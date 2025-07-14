import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import { getToken } from "firebase/messaging";
import { messaging } from "../../config/firebase";
import { saveToken } from "../../utils/pushNotifications/saveToken";

function NotificationConsentDrawer({
  showConsentDrawer,
  setShowConsentDrawer,
  setAlert,
}) {
  const handleAllow = async () => {
    setShowConsentDrawer(false);

    try {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_VAPID_KEY,
        });

        if (token) {
          await saveToken(token, setAlert);
          setAlert({
            open: true,
            message: "Notification permission granted and token saved.",
            severity: "success",
          });
        }
      } else {
        setAlert({
          open: true,
          message:
            "Notification permission not granted. You can change this later in your browser settings.",
          severity: "info",
        });
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      setAlert({
        open: true,
        message: "An error occurred while enabling notifications.",
        severity: "error",
      });
    }
  };

  const handleDeny = () => {
    setShowConsentDrawer(false);
    setAlert({
      open: true,
      message: "You denied notification permission.",
      severity: "warning",
    });
  };

  return (
    <Drawer
      anchor="bottom"
      open={showConsentDrawer}
      onClose={() => setShowConsentDrawer(false)}
      ModalProps={{ disablePortal: true }}
    >
      <Box sx={{ width: "auto", p: 3 }} role="presentation">
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            marginBottom: "1rem",
          }}
        >
          Notification Permission Required
        </h2>

        <div style={{ margin: "1.2rem 0" }}>
          <p style={{ marginBottom: "1rem", fontSize: "1rem" }}>
            To keep you updated with the latest notifications from our app, we
            need your permission to send push notifications. By allowing
            notifications, you'll receive real-time updates about important
            events and messages. You can always change this setting later in
            your browser's notification settings.
          </p>
        </div>

        <div className="flex-div">
          <button
            className="btn"
            style={{
              marginRight: "10px",
              backgroundColor: "#4CAF50",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
            onClick={handleAllow}
          >
            Allow Notifications
          </button>
          <button
            className="btn"
            style={{
              backgroundColor: "#f44336",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: "5px",
            }}
            onClick={handleDeny}
          >
            Deny Notifications
          </button>
        </div>
      </Box>
    </Drawer>
  );
}

export default React.memo(NotificationConsentDrawer);
