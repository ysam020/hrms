import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "../../config/firebase";
import { saveToken } from "./saveToken";

// Function to set up FCM token management
export const refreshFcmToken = async (
  setShowConsentDrawer,
  setAlert,
  fcmTokens = []
) => {
  try {
    const permissionStatus = await navigator.permissions.query({
      name: "notifications",
    });

    if (permissionStatus.state === "granted") {
      // Get current FCM token
      const currentToken = await getToken(messaging, {
        vapidKey: process.env.REACT_APP_VAPID_KEY,
      });

      if (currentToken) {
        // Check if this token already exists in the user's tokens
        const tokenExists = fcmTokens?.includes(currentToken);

        if (!tokenExists) {
          // Token doesn't exist in database, save it
          await saveToken(currentToken, setAlert);
        }
      }
    } else if (permissionStatus.state === "prompt") {
      setShowConsentDrawer(true);
      return null;
    } else if (permissionStatus.state === "denied") {
      // User has explicitly denied permission
      setAlert({
        open: true,
        message:
          "Notification permission denied. You can change this in your browser settings.",
        severity: "warning",
      });
      return { notificationUnavailable: true, reason: "permission-denied" };
    }
  } catch (error) {
    console.error("Error setting up FCM:", error);
  }
};
