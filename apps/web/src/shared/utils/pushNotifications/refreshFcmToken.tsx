import { saveToken } from "./saveToken";
import { generateDeviceFingerprint } from "./deviceFingerprint";
import { getFirebaseMessaging } from "@web/core/config/firebase";

export const refreshFcmToken = async (
  setShowConsentDrawer,
  setAlert,
  fcmTokens: any[] = [],
) => {
  try {
    const { getToken, messaging } = await getFirebaseMessaging();
    const permissionStatus = await navigator.permissions.query({
      name: "notifications",
    });

    if (permissionStatus.state === "granted") {
      const currentToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_KEY,
      });

      if (currentToken) {
        const { deviceFingerprint, deviceInfo } =
          await generateDeviceFingerprint();

        const existingTokenForDevice = fcmTokens?.find(
          (tokenObj) => tokenObj.deviceFingerprint === deviceFingerprint,
        );

        if (
          !existingTokenForDevice ||
          existingTokenForDevice.token !== currentToken
        ) {
          await saveToken(
            currentToken,
            deviceFingerprint,
            deviceInfo,
            setAlert,
          );
        }
      }
    } else if (permissionStatus.state === "prompt") {
      if (localStorage.getItem("notificationConsentDismissed") !== "true") {
        setShowConsentDrawer(true);
      }
      return null;
    } else if (permissionStatus.state === "denied") {
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
