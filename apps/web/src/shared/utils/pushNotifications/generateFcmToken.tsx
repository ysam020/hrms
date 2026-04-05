import { getToken } from "firebase/messaging";
import { saveToken } from "./saveToken";
import { getFirebaseMessaging } from "@web/core/config/firebase";
import { generateDeviceFingerprint } from "./deviceFingerprint";

export const generateToken = async (setAlert) => {
  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return;
    }

    const { messaging } = await getFirebaseMessaging();
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_VAPID_KEY,
    });

    if (!token) {
      console.warn("Failed to generate FCM token.");
      return;
    }

    // Generate device fingerprint and info
    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    await saveToken(token, deviceFingerprint, deviceInfo, setAlert);
    return token;
  } catch (error) {
    console.error("Error generating FCM token:", error);
  }
};
