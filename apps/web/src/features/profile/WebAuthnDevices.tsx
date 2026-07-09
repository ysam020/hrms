import { lazy, memo, useContext, useEffect, useState } from "react";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import SecurityIcon from "@mui/icons-material/Security";
import UsbIcon from "@mui/icons-material/Usb";
import NfcIcon from "@mui/icons-material/Nfc";
import BluetoothIcon from "@mui/icons-material/Bluetooth";
import { useTheme, alpha } from "@mui/material/styles";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import {
  disableWebAuthnCredential,
  disableAllWebAuthn,
  getCurrentDeviceCredentialId,
  initiateWebauthnRegistration,
} from "@web/core/webauthn";
import apiClient from "@web/core/http/axiosConfig";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";
const ConfirmationDialog = lazy(
  () => import("@web/shared/components/ConfirmationDialog"),
);
const EmptyState = lazy(() => import("@web/shared/components/EmptyState"));

function WebAuthnDevices() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const muiTheme = useTheme();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [currentCredentialId, setCurrentCredentialId] = useState<string | null>(
    null,
  );
  const [disableAllDialog, setDisableAllDialog] = useState(false);
  const [removeDialog, setRemoveDialog] = useState<{
    open: boolean;
    credentialId: string | null;
    deviceName: string;
  }>({
    open: false,
    credentialId: null,
    deviceName: "",
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState({});

  useEffect(() => {
    fetchCredentials();
    setCurrentCredentialId(getCurrentDeviceCredentialId());
  }, []);

  const fetchCredentials = async () => {
    try {
      const response = await apiClient(API_ENDPOINTS.WEBAUTHN_CREDENTIALS);
      setCredentials(response.data.data.credentials);
    } catch (error) {
      console.error("Error fetching WebAuthn credentials:", error);
    }
  };

  const handleRegisterWebAuthn = async () => {
    setRegisterLoading(true);
    try {
      await initiateWebauthnRegistration(setAlert as any);
      // Refresh credentials list
      await fetchCredentials();
      // Update current credential ID after successful registration
      setCurrentCredentialId(getCurrentDeviceCredentialId());
    } catch (error) {
      console.error("Error registering WebAuthn:", error);
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRemoveClick = (credentialId, deviceName) => {
    setRemoveDialog({ open: true, credentialId, deviceName });
  };

  const handleRemoveConfirm = async () => {
    const { credentialId } = removeDialog;
    setRemoveLoading((prev) => ({ ...prev, [credentialId as string]: true }));
    try {
      await disableWebAuthnCredential(credentialId as string, setAlert as any);
      setRemoveDialog({ open: false, credentialId: null, deviceName: "" });
      await fetchCredentials();

      if (credentialId === currentCredentialId) {
        localStorage.removeItem("currentWebAuthnCredentialId");
        setCurrentCredentialId(null);
      }
    } catch (error) {
      console.error("Error disabling WebAuthn credential:", error);
    } finally {
      setRemoveLoading((prev) => ({
        ...prev,
        [credentialId as string]: false,
      }));
    }
  };

  const handleRemoveCancel = () => {
    setRemoveDialog({ open: false, credentialId: null, deviceName: "" });
  };

  const handleDisableAllCredentials = async () => {
    setDisableLoading(true);
    try {
      await disableAllWebAuthn(setAlert as any);
      setCredentials([]);
      setDisableAllDialog(false);

      // Clear stored credential ID
      localStorage.removeItem("currentWebAuthnCredentialId");
      setCurrentCredentialId(null);
    } catch (error) {
      console.error("Error disabling all WebAuthn credentials:", error);
    } finally {
      setDisableLoading(false);
    }
  };

  const getTransportIcon = (transports) => {
    if (!transports || transports.length === 0)
      return <SecurityIcon color="primary" />;

    const transport = transports[0]; // Show icon for first transport
    switch (transport) {
      case "usb":
        return <UsbIcon color="primary" />;
      case "nfc":
        return <NfcIcon color="primary" />;
      case "ble":
        return <BluetoothIcon color="primary" />;
      case "internal":
        return <FingerprintIcon color="primary" />;
      default:
        return <SecurityIcon color="primary" />;
    }
  };

  const getCredentialDisplayName = (credential) => {
    if (credential.deviceInfo) {
      return `${credential.deviceInfo.browser} on ${credential.deviceInfo.os}`;
    }

    // Fallback based on transports
    if (credential.transports) {
      if (credential.transports.includes("internal")) {
        return "Built-in Authenticator";
      } else if (credential.transports.includes("usb")) {
        return "USB Security Key";
      } else if (credential.transports.includes("nfc")) {
        return "NFC Security Key";
      } else if (credential.transports.includes("ble")) {
        return "Bluetooth Security Key";
      }
    }

    return "Security Key";
  };

  const getBrowserName = (credential) => {
    if (credential.deviceInfo && credential.deviceInfo.browser !== "Unknown") {
      const version =
        credential.deviceInfo.browserVersion &&
        credential.deviceInfo.browserVersion !== "Unknown"
          ? ` ${credential.deviceInfo.browserVersion.split(".")[0]}`
          : "";
      return `${credential.deviceInfo.browser}${version}`;
    }
    return getCredentialDisplayName(credential);
  };

  const getOSName = (credential) => {
    if (credential.deviceInfo && credential.deviceInfo.os !== "Unknown") {
      return credential.deviceInfo.os;
    }
    return "Unknown OS";
  };

  const getTransportDescription = (transports) => {
    if (!transports || transports.length === 0) return "Unknown transport";

    const descriptions = {
      usb: "USB",
      nfc: "NFC",
      ble: "Bluetooth",
      internal: "Built-in",
    };

    return transports.map((t) => descriptions[t] || t).join(", ");
  };

  const isCurrentDevice = (credentialId) => {
    return credentialId === currentCredentialId;
  };

  const isCurrentDeviceRegistered = () => {
    return credentials.some((credential) =>
      isCurrentDevice(credential.credentialID),
    );
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

  // Theme-aware styling (same as PushNotifications)
  const getThemedBoxStyles = () => ({
    mt: 2,
    bgcolor: "background.paper",
    borderRadius: 1.5,
    border: "1px solid",
    borderColor: "divider",
    p: 2,
  });

  const getThemedListItemStyles = (credential) => {
    const isCurrentDev = isCurrentDevice(credential.credentialID);

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
              gap: { xs: 1, sm: 0 },
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              mb: 1,
              py: { xs: 2, sm: 1.25 },
              px: 2,
            }}
          >
            <ListItemText primary="WebAuthn / Passkeys" />
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
                onClick={handleRegisterWebAuthn}
                disabled={
                  registerLoading ||
                  disableLoading ||
                  isCurrentDeviceRegistered()
                }
              >
                {registerLoading
                  ? "Registering..."
                  : isCurrentDeviceRegistered()
                    ? "Already registered"
                    : "Register this device"}
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => setDisableAllDialog(true)}
                disabled={registerLoading || disableLoading}
              >
                Disable all devices
              </Button>
            </Box>
          </ListItem>
        </List>

        {credentials && credentials.length > 0 ? (
          <Box sx={getThemedBoxStyles()}>
            <Typography variant="subtitle1" gutterBottom>
              Active Devices ({credentials.length})
            </Typography>

            {credentials.map((credential, index) => (
              <Box key={index} sx={getThemedListItemStyles(credential)}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    width: "100%",
                    p: { xs: 1.5, sm: 0 },
                  }}
                >
                  <Box
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      alignItems: "center",
                      margin: 2,
                    }}
                  >
                    {getTransportIcon(credential.transports)}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                        flex: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <Box
                          sx={{ display: { xs: "inline-flex", sm: "none" } }}
                        >
                          {getTransportIcon(credential.transports)}
                        </Box>
                        <Typography variant="body1" fontWeight="medium">
                          {getBrowserName(credential)}
                        </Typography>
                        {isCurrentDevice(credential.credentialID) && (
                          <Chip
                            label="This Device"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Box>

                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {getOSName(credential)} •
                          {getTransportDescription(credential.transports)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          Registered: {formatLastUsed(credential.createdAt)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", mr: 2 }}>
                      <Button
                        variant="warning"
                        size="small"
                        onClick={() =>
                          handleRemoveClick(
                            credential.credentialID,
                            getBrowserName(credential),
                          )
                        }
                        disabled={
                          removeLoading[credential.credentialID] ||
                          registerLoading ||
                          disableLoading
                        }
                      >
                        {removeLoading[credential.credentialID]
                          ? "Removing..."
                          : "Remove"}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))}

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: "block" }}
            >
              Each device/browser creates a unique passkey. Remove individual
              devices or all at once.
            </Typography>
          </Box>
        ) : (
          <EmptyState
            message=" No WebAuthn credentials are currently registered."
            theme={theme}
          />
        )}

        {/* Remove single credential dialog */}
        <ConfirmationDialog
          open={removeDialog.open}
          onClose={handleRemoveCancel}
          onConfirm={handleRemoveConfirm}
          title="Remove Device"
          message={`Remove "${removeDialog.deviceName}" from your trusted devices?`}
          description="You will no longer be able to use this device for passwordless login."
          confirmText="Remove"
          cancelText="Cancel"
          loading={
            removeDialog.credentialId
              ? !!removeLoading[removeDialog.credentialId]
              : false
          }
          variant="danger"
          theme={theme}
        />

        {/* Disable All Credentials confirmation dialog */}
        <ConfirmationDialog
          open={disableAllDialog}
          onClose={() => setDisableAllDialog(false)}
          onConfirm={handleDisableAllCredentials}
          title="Disable All WebAuthn Devices"
          message="Are you sure you want to disable WebAuthn for all your devices? This will remove all registered passkey(s). You can re-register WebAuthn on any device later."
          confirmText="Disable All"
          cancelText="Cancel"
          loading={disableLoading}
          variant="danger"
          theme={theme}
        />
      </Grid>
    </Grid>
  );
}

export default memo(WebAuthnDevices);
