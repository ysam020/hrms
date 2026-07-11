import { lazy, memo, useContext, useEffect, useState } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import SmartphoneIcon from "@mui/icons-material/Smartphone";
import ComputerIcon from "@mui/icons-material/Computer";
import TabletIcon from "@mui/icons-material/Tablet";
import DevicesIcon from "@mui/icons-material/Devices";
import TvIcon from "@mui/icons-material/Tv";
import WatchIcon from "@mui/icons-material/Watch";
import useTheme from "@mui/material/styles/useTheme";
import { alpha } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
import apiClient from "@web/core/http/axiosConfig";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";
const ConfirmationDialog = lazy(
  () => import("@web/shared/components/ConfirmationDialog"),
);
const EmptyState = lazy(() => import("@web/shared/components/EmptyState"));

function PushNotifications() {
  const { setAlert } = useContext(AlertContext);
  const { user, setUser } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [currentDeviceFingerprint, setCurrentDeviceFingerprint] = useState<
    string | null
  >(null);
  const [disableAllDialog, setDisableAllDialog] = useState(false);
  const [removeDialog, setRemoveDialog] = useState({
    open: false,
    fingerprint: null,
    deviceName: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getCurrentDeviceFingerprint = async () => {
      try {
        const { deviceFingerprint } = await generateDeviceFingerprint();
        setCurrentDeviceFingerprint(deviceFingerprint);
      } catch (error) {
        console.error("Error getting device fingerprint:", error);
      }
    };

    getCurrentDeviceFingerprint();
  }, []);

  const handleEnablePushNotifications = async () => {
    setLoading(true);
    try {
      // generateToken() calls Notification.requestPermission() as its first
      // step — browsers can silently auto-deny a permission prompt that's
      // no longer tied to the click that triggered it, so nothing here
      // should await before that call. (Dynamic import()s used to sit in
      // front of it, pushing the request several ticks past the click.)
      const token = await generateToken(setAlert);
      if (token) {
        const { deviceFingerprint, deviceInfo } =
          await generateDeviceFingerprint();
        setUser((prev) => {
          const existing = Array.isArray(prev.fcmTokens) ? prev.fcmTokens : [];
          const idx = existing.findIndex(
            (t) => t.deviceFingerprint === deviceFingerprint,
          );
          const newEntry = {
            token,
            deviceFingerprint,
            deviceInfo,
            lastUsed: new Date(),
            isActive: true,
          };
          const updated =
            idx >= 0
              ? existing.map((t, i) => (i === idx ? { ...t, ...newEntry } : t))
              : [...existing, newEntry];
          return { ...prev, fcmTokens: updated };
        });
        setAlert({
          open: true,
          message: "Push notifications enabled on this device",
          severity: "success",
        });
      }
    } catch (error) {
      console.error("Error enabling push notifications:", error);
      setAlert({
        open: true,
        message: "Something went wrong enabling push notifications.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDeviceClick = (tokenObj) => {
    const deviceName = getBrowserName(tokenObj.deviceInfo);
    setRemoveDialog({
      open: true,
      fingerprint: tokenObj.deviceFingerprint,
      deviceName,
    });
  };

  const handleRemoveDeviceConfirm = async () => {
    const { fingerprint: deviceFingerprint } = removeDialog;
    setLoading(true);
    try {
      const res = await apiClient.delete(
        API_ENDPOINTS.DISABLE_PUSH_NOTIFICATIONS,
        { data: { deviceFingerprint } },
      );
      setAlert({ open: true, message: res.data.message, severity: "success" });
      setRemoveDialog({ open: false, fingerprint: null, deviceName: "" });
      setUser((prev) => ({
        ...prev,
        fcmTokens: (prev.fcmTokens || []).filter(
          (t) => t.deviceFingerprint !== deviceFingerprint,
        ),
      }));
    } catch (error) {
      setAlert({
        open: true,
        message: error.response?.data?.message || "Error removing device",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisableAllDevices = async () => {
    setLoading(true);
    try {
      const { disablePushNotifications } =
        await import("@web/shared/utils/pushNotifications/disablePushNotifications");
      await disablePushNotifications(setAlert, true); // All devices
      setDisableAllDialog(false);
      // Update user context to reflect changes
      setUser((prev) => ({ ...prev, fcmTokens: [] }));
    } catch (error) {
      console.error("Error disabling all devices:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDeviceIcon = (deviceType) => {
    const iconSize = { fontSize: { xs: 20, sm: 24 } };
    switch (deviceType?.toLowerCase()) {
      case "mobile":
        return <SmartphoneIcon color="primary" sx={iconSize} />;
      case "tablet":
        return <TabletIcon color="primary" sx={iconSize} />;
      case "smarttv":
        return <TvIcon color="primary" sx={iconSize} />;
      case "wearable":
        return <WatchIcon color="primary" sx={iconSize} />;
      case "desktop":
        return <ComputerIcon color="primary" sx={iconSize} />;
      default:
        return <DevicesIcon color="primary" sx={iconSize} />;
    }
  };

  const isCurrentDevice = (tokenObj) => {
    if (typeof tokenObj === "string" || !currentDeviceFingerprint) {
      return false;
    }
    return tokenObj.deviceFingerprint === currentDeviceFingerprint;
  };

  const isCurrentDeviceEnabled = () => {
    if (!currentDeviceFingerprint || !user?.fcmTokens) {
      return false;
    }
    return user.fcmTokens.some((tokenObj) => isCurrentDevice(tokenObj));
  };

  const formatLastUsed = (timestamp) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (Number(now) - Number(date)) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days} day${days > 1 ? "s" : ""} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getBrowserName = (deviceInfo) => {
    if (
      !deviceInfo ||
      !deviceInfo.browser ||
      deviceInfo.browser === "Unknown"
    ) {
      return "Unknown Browser";
    }

    const version =
      deviceInfo.browserVersion && deviceInfo.browserVersion !== "Unknown"
        ? ` ${deviceInfo.browserVersion.split(".")[0]}`
        : "";

    return `${deviceInfo.browser}${version}`;
  };

  const getOSName = (deviceInfo) => {
    if (!deviceInfo || !deviceInfo.os || deviceInfo.os === "Unknown") {
      return "Unknown OS";
    }

    return deviceInfo.os;
  };

  // Theme-aware styling
  const getThemedBoxStyles = () => ({
    mt: 2,
    bgcolor: "background.paper",
    borderRadius: 1.5,
    border: "1px solid",
    borderColor: "divider",
    p: { xs: 1.5, sm: 2 },
  });

  const getThemedListItemStyles = (tokenObj) => {
    const isCurrentDev = isCurrentDevice(tokenObj);

    return {
      border: "1px solid",
      borderColor: isCurrentDev ? "primary.main" : "divider",
      borderRadius: "8px",
      mb: 1,
      bgcolor: isCurrentDev
        ? alpha(
            muiTheme.palette.primary.main,
            muiTheme.palette.mode === "light" ? 0.08 : 0.16,
          )
        : "background.paper",
      transition: "background-color 0.15s ease",
      "&:hover": {
        bgcolor: isCurrentDev
          ? alpha(
              muiTheme.palette.primary.main,
              muiTheme.palette.mode === "light" ? 0.14 : 0.24,
            )
          : "action.hover",
      },
    };
  };

  const currentDeviceEnabled = isCurrentDeviceEnabled();

  return (
    <Grid container>
      <Grid size={12}>
        <List disablePadding sx={{ width: "100%" }}>
          <ListItem
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              mb: 1,
              py: { xs: 2, sm: 1.25 },
              px: { xs: 2, sm: 2 },
              gap: { xs: 1, sm: 0 },
            }}
          >
            <ListItemText
              primary="Push Notifications"
              primaryTypographyProps={{
                sx: {
                  fontSize: { xs: "0.95rem", sm: "1rem" },
                  fontWeight: { xs: 500, sm: 400 },
                },
              }}
            />
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "stretch", sm: "center" },
                gap: 1,
                width: { xs: "100%", sm: "auto" },
              }}
            >
              <Button
                size="small"
                onClick={handleEnablePushNotifications}
                disabled={loading || currentDeviceEnabled}
                style={{ whiteSpace: isMobile ? "normal" : "nowrap" }}
              >
                {loading
                  ? "Enabling..."
                  : currentDeviceEnabled
                    ? isMobile
                      ? "Enabled on this device"
                      : "Already enabled on this device"
                    : "Enable on this device"}
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => setDisableAllDialog(true)}
                disabled={loading}
              >
                Disable all devices
              </Button>
            </Box>
          </ListItem>
        </List>

        {user?.fcmTokens && user.fcmTokens.length > 0 ? (
          <Box sx={getThemedBoxStyles()}>
            <Typography
              variant="subtitle1"
              gutterBottom
              sx={{ fontSize: { xs: "0.95rem", sm: "1rem" } }}
            >
              Active Devices ({user.fcmTokens.length})
            </Typography>

            {user.fcmTokens.map((tokenObj, index) => (
              <Box key={index} sx={getThemedListItemStyles(tokenObj)}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    gap: { xs: 1, sm: 1 },
                    width: "100%",
                    p: { xs: 1.5, sm: 0 },
                  }}
                >
                  {/* Icon - Hidden on mobile, shown on tablet+ */}
                  <Box
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      alignItems: "center",
                      justifyContent: "center",
                      m: 2,
                    }}
                  >
                    {getDeviceIcon(tokenObj.deviceInfo?.deviceType)}
                  </Box>

                  {/* Main Content */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      width: "100%",
                      alignItems: { xs: "stretch", sm: "center" },
                      gap: { xs: 1.5, sm: 0 },
                    }}
                  >
                    {/* Device Info Section */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                        flex: 1,
                      }}
                    >
                      {/* Browser Name + Chips Row */}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        {/* Icon on mobile only */}
                        <Box
                          sx={{ display: { xs: "inline-flex", sm: "none" } }}
                        >
                          {getDeviceIcon(tokenObj.deviceInfo?.deviceType)}
                        </Box>

                        <Typography
                          variant="body1"
                          fontWeight="medium"
                          sx={{ fontSize: { xs: "0.9rem", sm: "1rem" } }}
                        >
                          {getBrowserName(tokenObj.deviceInfo)}
                        </Typography>

                        {isCurrentDevice(tokenObj) && (
                          <Chip
                            label="This Device"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{
                              height: { xs: 20, sm: 24 },
                              fontSize: { xs: "0.7rem", sm: "0.75rem" },
                              "& .MuiChip-label": { px: { xs: 0.75, sm: 1 } },
                            }}
                          />
                        )}

                        {typeof tokenObj === "string" && (
                          <Chip
                            label="Legacy"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{
                              height: { xs: 20, sm: 24 },
                              fontSize: { xs: "0.7rem", sm: "0.75rem" },
                              "& .MuiChip-label": { px: { xs: 0.75, sm: 1 } },
                            }}
                          />
                        )}
                      </Box>

                      {/* Device Details */}
                      <Box>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.8rem", sm: "0.875rem" } }}
                        >
                          {getOSName(tokenObj.deviceInfo)} •{" "}
                          {tokenObj.deviceInfo?.deviceType || "desktop"}
                        </Typography>

                        {typeof tokenObj === "object" && tokenObj.lastUsed && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontSize: { xs: "0.75rem", sm: "0.75rem" },
                              display: "block",
                            }}
                          >
                            Last used: {formatLastUsed(tokenObj.lastUsed)}
                          </Typography>
                        )}

                        {typeof tokenObj === "object" &&
                          tokenObj.deviceInfo?.screenResolution && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: { xs: "0.75rem", sm: "0.75rem" },
                                display: { xs: "block", sm: "inline" },
                                ml: { xs: 0, sm: 1 },
                              }}
                            >
                              {isMobile ? "" : "• "}
                              {tokenObj.deviceInfo.screenResolution}
                            </Typography>
                          )}
                      </Box>
                    </Box>

                    {/* Action Button */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: { xs: "flex-start", sm: "center" },
                        justifyContent: { xs: "flex-start", sm: "flex-end" },
                        mr: { xs: 0, sm: 2 },
                      }}
                    >
                      <Button
                        variant="warning"
                        size="small"
                        style={{ width: isMobile ? "100%" : "auto" }}
                        onClick={() => {
                          if (typeof tokenObj === "string") {
                            setAlert({
                              open: true,
                              message:
                                "Cannot remove legacy tokens individually. Please disable all devices and re-enable.",
                              severity: "warning",
                            });
                          } else {
                            handleRemoveDeviceClick(tokenObj);
                          }
                        }}
                        disabled={loading}
                      >
                        {loading ? "Removing..." : "Remove"}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                mt: 1,
                display: "block",
                fontSize: { xs: "0.75rem", sm: "0.75rem" },
                lineHeight: 1.5,
              }}
            >
              Devices are automatically cleaned up after 90 days of inactivity.
              Maximum 15 devices per account.
            </Typography>
          </Box>
        ) : (
          <EmptyState
            message="No devices are currently registered for push notifications."
            theme={theme}
          />
        )}

        {/* Remove single device confirmation dialog */}
        <ConfirmationDialog
          open={removeDialog.open}
          onClose={() =>
            !loading &&
            setRemoveDialog({ open: false, fingerprint: null, deviceName: "" })
          }
          onConfirm={handleRemoveDeviceConfirm}
          title="Remove Device"
          message={`Remove "${removeDialog.deviceName}" from push notification devices?`}
          description="This device will no longer receive push notifications."
          confirmText="Remove"
          cancelText="Cancel"
          loading={loading}
          variant="danger"
          theme={theme}
        />

        {/* Disable All Devices confirmation dialog */}
        <ConfirmationDialog
          open={disableAllDialog}
          onClose={() => setDisableAllDialog(false)}
          onConfirm={handleDisableAllDevices}
          title="Disable All Devices"
          message="Are you sure you want to disable push notifications for all your devices? This will remove your device(s) from receiving notifications."
          confirmText="Disable All"
          cancelText="Cancel"
          loading={loading}
          variant="danger"
          theme={theme}
        />
      </Grid>
    </Grid>
  );
}

export default memo(PushNotifications);
