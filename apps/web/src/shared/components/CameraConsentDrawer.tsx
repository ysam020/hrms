import { memo, useContext, useEffect, useState } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "./Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import VideocamIcon from "@mui/icons-material/Videocam";
import FaceRetouchingNaturalIcon from "@mui/icons-material/FaceRetouchingNatural";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import BlockIcon from "@mui/icons-material/Block";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useBottomDrawer } from "@web/app/providers/BottomDrawerContext";

function CameraConsentDrawer({
  showConsentDrawer,
  setShowConsentDrawer,
  onAllowCamera,
  onDenyCamera,
}: {
  showConsentDrawer: boolean;
  setShowConsentDrawer: (open: boolean) => void;
  onAllowCamera?: () => void;
  onDenyCamera?: (reason: {
    cameraUnavailable: boolean;
    reason: string;
  }) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const { setDrawerOpen, dockVisible } = useBottomDrawer();
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  useEffect(() => {
    setDrawerOpen(showConsentDrawer);
    return () => setDrawerOpen(false);
  }, [showConsentDrawer, setDrawerOpen]);

  const handleAllow = async () => {
    if (onAllowCamera) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });

        if (permissionStatus.state === "denied") {
          setPermissionBlocked(true);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, min: 480 },
            height: { ideal: 480, min: 360 },
            facingMode: "user",
          },
        });

        setShowConsentDrawer(false);
        setPermissionBlocked(false);

        stream.getTracks().forEach((track) => track.stop());

        onAllowCamera();
      } catch (err) {
        const error = err as { name?: string };
        if (error.name === "NotAllowedError") {
          setPermissionBlocked(true);
        } else {
          setShowConsentDrawer(false);
          setPermissionBlocked(false);
          if (onDenyCamera) {
            onDenyCamera({
              cameraUnavailable: true,
              reason: error.name || "unknown-error",
            });
          }
        }
      }
    }
  };

  const handleDeny = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyCamera) {
      onDenyCamera({ cameraUnavailable: true, reason: "user-denied" });
    }
  };

  const handleCloseAndProceed = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyCamera) {
      onDenyCamera({
        cameraUnavailable: true,
        reason: "permission-blocked",
      });
    }
  };

  const handleClose = () => {
    setShowConsentDrawer(false);
    setPermissionBlocked(false);
    if (onDenyCamera) {
      onDenyCamera({
        cameraUnavailable: true,
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
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          backgroundColor: theme === "light" ? "#fff" : "#212e35",
          margin: "0 auto",
          paddingBottom: dockVisible ? "72px" : 0,
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <IconButton
          onClick={handleClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: "text.secondary",
          }}
        >
          <CloseIcon />
        </IconButton>

        {!permissionBlocked ? (
          <Box sx={{ p: 3, pb: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    theme === "light"
                      ? "linear-gradient(135deg, #4caf50 0%, #388e3c 100%)"
                      : "linear-gradient(135deg, #1e3b2d 0%, #2e5738 100%)",
                }}
              >
                <VideocamIcon sx={{ fontSize: 28, color: "#fff" }} />
              </Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: "1.1rem",
                    mb: 0.5,
                  }}
                >
                  Camera Access Required
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                  }}
                >
                  Verify your identity with face recognition
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                backgroundColor: theme === "light" ? "#f8f9fa" : "#1a252b",
                borderRadius: 2,
                p: 2,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  mb: 1.5,
                }}
              >
                <FaceRetouchingNaturalIcon
                  sx={{ fontSize: 20, color: "#4caf50", mt: 0.2 }}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                    Face Recognition
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    Verify your identity using facial recognition technology
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  mb: 1.5,
                }}
              >
                <VerifiedUserIcon
                  sx={{ fontSize: 20, color: "#2196f3", mt: 0.2 }}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                    Secure Attendance
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    Prevent unauthorized attendance marking with biometric
                    verification
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Button onClick={handleAllow}>Allow Camera</Button>
              <Button onClick={handleDeny}>Cancel</Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 3, pb: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    theme === "light"
                      ? "linear-gradient(135deg, #f44336 0%, #d32f2f 100%)"
                      : "linear-gradient(135deg, #441a1a 0%, #3d1a1a 100%)",
                }}
              >
                <BlockIcon sx={{ fontSize: 28, color: "#fff" }} />
              </Box>
              <Box flex={1}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    fontSize: "1.1rem",
                    mb: 0.5,
                  }}
                >
                  Camera Access Blocked
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                  }}
                >
                  Cannot mark attendance without camera
                </Typography>
              </Box>
            </Box>

            <Alert severity="error" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                Camera Permission Required
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: "block", lineHeight: 1.5 }}
              >
                Face recognition is mandatory for attendance marking. You must
                enable camera access to continue.
              </Typography>
            </Alert>

            <Box
              sx={{
                backgroundColor: theme === "light" ? "#f8f9fa" : "#1a252b",
                borderRadius: 2,
                p: 2,
                mb: 2,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  mb: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                📹 Enable Camera Access
              </Typography>

              <Box component="ol" sx={{ m: 0, pl: 2.5, "& li": { mb: 1 } }}>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{ lineHeight: 1.6 }}
                >
                  Click the <strong>lock icon 🔒</strong> in your address bar
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{ lineHeight: 1.6 }}
                >
                  Find <strong>"Camera"</strong> in permissions
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{ lineHeight: 1.6 }}
                >
                  Change from <strong>"Block"</strong> to <strong>"Ask"</strong>
                </Typography>
                <Typography
                  component="li"
                  variant="caption"
                  sx={{ lineHeight: 1.6 }}
                >
                  <strong>Reload</strong> the page and try again
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Button onClick={handleCloseAndProceed}>Cancel Attendance</Button>
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

export default memo(CameraConsentDrawer);
