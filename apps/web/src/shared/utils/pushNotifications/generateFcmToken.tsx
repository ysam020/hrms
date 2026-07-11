import { saveToken } from "./saveToken";
import { getFirebaseMessaging } from "@web/core/config/firebase";
import { generateDeviceFingerprint } from "./deviceFingerprint";

// Every early-return below used to be silent (console only) — from the
// button's perspective that reads as "nothing happened, no request was
// made", which is exactly the bug this was reported as. Each path now tells
// the user why via setAlert instead of failing invisibly.
export const generateToken = async (setAlert) => {
  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setAlert?.({
        open: true,
        message:
          "Notification permission was denied. Enable notifications for this site in your browser settings to receive push notifications.",
        severity: "warning",
      });
      return;
    }

    // getFirebaseMessaging() already registers the service worker and calls
    // getToken() with the correct serviceWorkerRegistration — re-deriving
    // the token here via a second, differently-configured getToken() call
    // was redundant and, in practice, more failure-prone.
    const { token } = await getFirebaseMessaging();

    if (!token) {
      setAlert?.({
        open: true,
        message: import.meta.env.DEV
          ? "Push notifications aren't available in local development — they require a deployed environment with a registered service worker."
          : "Couldn't generate a push notification token for this device. Please try again.",
        severity: "warning",
      });
      return;
    }

    // Generate device fingerprint and info
    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    await saveToken(token, deviceFingerprint, deviceInfo, setAlert);
    return token;
  } catch (error) {
    console.error("Error generating FCM token:", error);
    setAlert?.({
      open: true,
      message: "Something went wrong enabling push notifications.",
      severity: "error",
    });
  }
};
