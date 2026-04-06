import React, { useContext, useEffect } from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "./Button";
import IconButton from "@mui/material/IconButton";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import CloseIcon from "@mui/icons-material/Close";
import CampaignIcon from "@mui/icons-material/Campaign";
import UpdateIcon from "@mui/icons-material/Update";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useBottomDrawer } from "@web/app/providers/BottomDrawerContext";

function NotificationConsentDrawer({
  showConsentDrawer,
  setShowConsentDrawer,
  setAlert,
  onEnableNotifications,
}: {
  showConsentDrawer: boolean;
  setShowConsentDrawer: (open: boolean) => void;
  setAlert: (alert: {
    open: boolean;
    message: string;
    severity: "error" | "info" | "success" | "warning";
  }) => void;
  onEnableNotifications?: () => Promise<void>;
}) {
  const { theme } = useContext(ThemeContext);
  const { setDrawerOpen } = useBottomDrawer();
  useEffect(() => {
    setDrawerOpen(showConsentDrawer);
    return () => setDrawerOpen(false);
  }, [showConsentDrawer, setDrawerOpen]);

  const handleAllow = async () => {
    setShowConsentDrawer(false);
    if (onEnableNotifications) {
      await onEnableNotifications();
    }
  };

  const handleDeny = () => {
    setShowConsentDrawer(false);
    setAlert({
      open: true,
      message: "You can enable notifications later from settings.",
      severity: "info",
    });
  };

  const handleClose = () => {
    setShowConsentDrawer(false);
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

        <Box sx={{ p: 3, pb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
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
                    ? "linear-gradient(135deg, #6c5dfc 0%, #5541d8 100%)"
                    : "linear-gradient(135deg, #2e1f85 0%, #1f1554 100%)",
              }}
            >
              <NotificationsActiveIcon sx={{ fontSize: 28, color: "#fff" }} />
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
                Enable Notifications
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                }}
              >
                Stay updated with real-time alerts
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
              <UpdateIcon sx={{ fontSize: 20, color: "#2196f3", mt: 0.2 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Real-time Updates
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Get instant alerts for important events and messages
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
              <CampaignIcon sx={{ fontSize: 20, color: "#ff9800", mt: 0.2 }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Important Announcements
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Never miss critical updates from your organization
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Button onClick={handleAllow}>Enable Notifications</Button>
            <Button onClick={handleDeny}>Not Now</Button>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}

export default React.memo(NotificationConsentDrawer);
