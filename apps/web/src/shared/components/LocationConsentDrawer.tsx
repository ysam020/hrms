import { memo, useContext, useEffect, useState } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "./Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import useTheme from "@mui/material/styles/useTheme";
import useMediaQuery from "@mui/material/useMediaQuery";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import SecurityIcon from "@mui/icons-material/Security";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useBottomDrawer } from "@web/app/providers/BottomDrawerContext";

function LocationConsentDrawer({
  showConsentDrawer,
  setShowConsentDrawer,
  onAllowLocation,
  onDenyLocation,
}: {
  showConsentDrawer: boolean;
  setShowConsentDrawer: (open: boolean) => void;
  onAllowLocation: (coords: { latitude: number; longitude: number }) => void;
  onDenyLocation: (reason: {
    locationUnavailable: boolean;
    reason: string;
  }) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const { setDrawerOpen, dockVisible } = useBottomDrawer();
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const muiTheme = useTheme();

  useEffect(() => {
    setDrawerOpen(showConsentDrawer);
    return () => setDrawerOpen(false);
  }, [showConsentDrawer, setDrawerOpen]);
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const handleAllow = async () => {
    if (onAllowLocation) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "geolocation",
        });

        if (permissionStatus.state === "denied") {
          setPermissionBlocked(true);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            setShowConsentDrawer(false);
            setPermissionBlocked(false);
            onAllowLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              setPermissionBlocked(true);
            } else {
              setShowConsentDrawer(false);
              setPermissionBlocked(false);
              onDenyLocation({
                locationUnavailable: true,
                reason: `error-${error.code}`,
              });
            }
          },
          {
            timeout: 10000,
            maximumAge: 60000,
            enableHighAccuracy: false,
          },
        );
      } catch (error) {
        setShowConsentDrawer(false);
        setPermissionBlocked(false);
        onDenyLocation({ locationUnavailable: true, reason: "unknown-error" });
      }
    }
  };

  const handleDeny = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyLocation) {
      onDenyLocation({ locationUnavailable: true, reason: "user-denied" });
    }
  };

  const handleCloseAndProceed = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyLocation) {
      onDenyLocation({
        locationUnavailable: true,
        reason: "permission-blocked",
      });
    }
  };

  const handleClose = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyLocation) {
      onDenyLocation({
        locationUnavailable: true,
        reason: "drawer-closed",
      });
    }
  };

  return (
    <Drawer
      anchor="bottom"
      open={showConsentDrawer}
      onClose={handleClose}
      disablePortal={true}
      PaperProps={{
        sx: {
          borderTopLeftRadius: { xs: 20, sm: 16 },
          borderTopRightRadius: { xs: 20, sm: 16 },
          backgroundColor: theme === "light" ? "#fff" : "#212e35",
          margin: "0 auto",
          width: "100%",
          paddingBottom: dockVisible ? "72px" : 0,
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <IconButton
          onClick={handleClose}
          size={isMobile ? "small" : "medium"}
          aria-label="Close location consent dialog"
          sx={{
            position: "absolute",
            right: { xs: 6, sm: 8 },
            top: { xs: 6, sm: 8 },
            color: "text.secondary",
            zIndex: 1,
          }}
        >
          <CloseIcon sx={{ fontSize: { xs: 20, sm: 24 } }} aria-hidden="true" />
        </IconButton>

        {!permissionBlocked ? (
          <Box sx={{ p: { xs: 2.5, sm: 3 }, pb: { xs: 2, sm: 2 } }}>
            {/* Header with icon */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1.25, sm: 1.5 },
                mb: { xs: 1.75, sm: 2 },
                pr: { xs: 4, sm: 0 },
              }}
            >
              <Box
                sx={{
                  width: { xs: 44, sm: 48 },
                  height: { xs: 44, sm: 48 },
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    theme === "light"
                      ? "linear-gradient(135deg, #2196f3 0%, #1976d2 100%)"
                      : "linear-gradient(135deg, #0c3f61 0%, #1a2a42 100%)",
                }}
              >
                <LocationOnIcon
                  sx={{ fontSize: { xs: 24, sm: 28 }, color: "#fff" }}
                />
              </Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: "1rem", sm: "1.1rem" },
                    mb: 0.5,
                  }}
                >
                  Location Access Required
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    fontSize: { xs: "0.75rem", sm: "0.75rem" },
                  }}
                >
                  Help us keep your account secure
                </Typography>
              </Box>
            </Box>

            {/* Benefits */}
            <Box
              sx={{
                backgroundColor: theme === "light" ? "#f8f9fa" : "#1a252b",
                borderRadius: { xs: 1.5, sm: 2 },
                p: { xs: 1.5, sm: 2 },
                mb: { xs: 1.75, sm: 2 },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: { xs: 1.25, sm: 1.5 },
                  mb: { xs: 1.25, sm: 1.5 },
                }}
              >
                <SecurityIcon
                  sx={{
                    fontSize: { xs: 18, sm: 20 },
                    color: "#4caf50",
                    mt: 0.2,
                  }}
                />
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      mb: 0.5,
                      fontSize: { xs: "0.85rem", sm: "0.875rem" },
                    }}
                  >
                    Security Verification
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontSize: { xs: "0.75rem", sm: "0.75rem" },
                      lineHeight: 1.5,
                    }}
                  >
                    Detect suspicious login attempts from unusual locations
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: { xs: 1.25, sm: 1.5 },
                }}
              >
                <CheckCircleIcon
                  sx={{
                    fontSize: { xs: 18, sm: 20 },
                    color: "#2196f3",
                    mt: 0.2,
                  }}
                />
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      mb: 0.5,
                      fontSize: { xs: "0.85rem", sm: "0.875rem" },
                    }}
                  >
                    Accurate Attendance
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontSize: { xs: "0.75rem", sm: "0.75rem" },
                      lineHeight: 1.5,
                    }}
                  >
                    Record your attendance based on location
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Action buttons */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: { xs: 1, sm: 1.5 },
              }}
            >
              <Button onClick={handleAllow}>Allow Location</Button>
              <Button onClick={handleDeny}>Skip</Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: { xs: 2.5, sm: 3 }, pb: { xs: 2, sm: 2 } }}>
            {/* Blocked state header */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1.25, sm: 1.5 },
                mb: { xs: 1.75, sm: 2 },
                pr: { xs: 4, sm: 0 },
              }}
            >
              <Box
                sx={{
                  width: { xs: 44, sm: 48 },
                  height: { xs: 44, sm: 48 },
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    theme === "light"
                      ? "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)"
                      : "linear-gradient(135deg, #442d0f 0%, #3d2a1a 100%)",
                }}
              >
                <BlockIcon
                  sx={{ fontSize: { xs: 24, sm: 28 }, color: "#fff" }}
                />
              </Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: "1rem", sm: "1.1rem" },
                    mb: 0.5,
                  }}
                >
                  Location Access Blocked
                </Typography>
                <Chip
                  label="Action Required"
                  size="small"
                  sx={{
                    backgroundColor: theme === "light" ? "#fff3e0" : "#442d0f",
                    color: theme === "light" ? "#e65100" : "#ffcc80",
                    fontWeight: 600,
                    height: { xs: 18, sm: 20 },
                    fontSize: { xs: "0.7rem", sm: "0.75rem" },
                  }}
                />
              </Box>
            </Box>

            <Box
              sx={{
                backgroundColor: theme === "light" ? "#f8f9fa" : "#1a252b",
                borderRadius: { xs: 1.5, sm: 2 },
                p: { xs: 1.5, sm: 2 },
                mb: { xs: 1.75, sm: 2 },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  mb: { xs: 1.25, sm: 1.5 },
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  fontSize: { xs: "0.85rem", sm: "0.875rem" },
                }}
              >
                📍 Quick Fix
              </Typography>

              <Box
                component="ol"
                sx={{
                  m: 0,
                  pl: { xs: 2, sm: 2.5 },
                  "& li": { mb: { xs: 0.75, sm: 1 } },
                }}
              >
                <Typography
                  component="li"
                  variant="caption"
                  sx={{
                    lineHeight: 1.6,
                    fontSize: { xs: "0.75rem", sm: "0.75rem" },
                  }}
                >
                  Click the <strong>lock icon 🔒</strong> in your address bar
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{
                    lineHeight: 1.6,
                    fontSize: { xs: "0.75rem", sm: "0.75rem" },
                  }}
                >
                  Find <strong>"Location"</strong> in permissions
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{
                    lineHeight: 1.6,
                    fontSize: { xs: "0.75rem", sm: "0.75rem" },
                  }}
                >
                  Change from <strong>"Block"</strong> to <strong>"Ask"</strong>
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{
                    lineHeight: 1.6,
                    fontSize: { xs: "0.75rem", sm: "0.75rem" },
                  }}
                >
                  <strong>Reload</strong> and try again
                </Typography>
              </Box>
            </Box>

            {/* Action buttons */}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: { xs: 1, sm: 1.5 },
              }}
            >
              <Button onClick={handleCloseAndProceed}>
                {isMobile ? "Proceed Without" : "Proceed Without Location"}
              </Button>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

export default memo(LocationConsentDrawer);
