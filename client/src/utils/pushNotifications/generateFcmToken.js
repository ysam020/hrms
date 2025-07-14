import { getToken } from "firebase/messaging";
import { saveToken } from "./saveToken";
import { messaging } from "../../config/firebase";

export const generateToken = async (setAlert) => {
  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return;
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.REACT_APP_VAPID_KEY,
    });

    if (!token) {
      console.warn("Failed to generate FCM token.");
      return;
    }

    await saveToken(token, setAlert);
  } catch (error) {
    console.error("Error generating FCM token:", error);
  }
};
