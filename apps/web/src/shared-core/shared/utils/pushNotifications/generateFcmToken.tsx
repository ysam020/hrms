import { saveToken } from "./saveToken";
import { getFirebaseMessaging } from "@web/core/config/firebase";
import { generateDeviceFingerprint } from "./deviceFingerprint";

// Every early-return below used to be silent (console only) — from the
// button's perspective that reads as "nothing happened, no request was
// made", which is exactly the bug this was reported as. Each path now tells
// the user why via setAlert instead of failing invisibly.
const isBrave = () => typeof navigator !== "undefined" && "brave" in navigator;

/**
 * What went wrong, in words someone can act on. The browser's push service
 * failing is the common case: Brave ships with it off ("Use Google services
 * for push messaging"), and every site's subscription then fails with
 * "Registration failed - push service error".
 */
export function pushErrorMessage(error: any): string {
  const code = String(error?.code ?? "");
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  if (
    /push service error|Registration failed|token-subscribe-failed/i.test(
      `${code} ${text}`,
    )
  )
    return isBrave()
      ? "Brave has push messaging turned off. In Brave, open Settings › Privacy and security, turn on “Use Google services for push messaging”, relaunch Brave, and try again."
      : "This browser’s push service couldn’t be reached. Check your connection, or try another browser such as Chrome, Edge or Safari.";
  if (code === "messaging/unsupported-browser" || /unsupported/i.test(code))
    return "This browser doesn’t support push notifications.";
  if (code === "messaging/permission-blocked" || /permission/i.test(code))
    return "Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.";
  return "Something went wrong enabling push notifications.";
}

export const generateToken = async (setAlert) => {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    setAlert?.({
      open: true,
      message: "This browser doesn’t support push notifications.",
      severity: "warning",
    });
    return;
  }
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
      message: pushErrorMessage(error),
      severity: "error",
    });
  }
};
