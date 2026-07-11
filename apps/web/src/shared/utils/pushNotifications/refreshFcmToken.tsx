import { saveToken } from "./saveToken";
import { generateDeviceFingerprint } from "./deviceFingerprint";
import { getFirebaseMessaging } from "@web/core/config/firebase";

export const refreshFcmToken = async (
  setShowConsentDrawer,
  setAlert,
  fcmTokens: any[] = [],
) => {
  try {
    const permissionStatus = await navigator.permissions.query({
      name: "notifications",
    });

    if (permissionStatus.state === "granted") {
      // getFirebaseMessaging() already registers the service worker and
      // derives the token with the correct serviceWorkerRegistration — a
      // second, differently-configured getToken() call here (missing
      // serviceWorkerRegistration) used to silently produce a token that
      // didn't match what the service worker was actually subscribed with.
      const { token: currentToken } = await getFirebaseMessaging();

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
      // Use the DB as the source of truth: if this device has been enrolled
      // before, don't nag the user again. Show the drawer only on first use.
      const { deviceFingerprint } = await generateDeviceFingerprint();
      const devicePreviouslyEnrolled = fcmTokens?.some(
        (t) => t.deviceFingerprint === deviceFingerprint,
      );
      if (!devicePreviouslyEnrolled) {
        setShowConsentDrawer(true);
      }
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
