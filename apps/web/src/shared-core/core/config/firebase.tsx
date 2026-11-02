const firebaseConfig = {
  apiKey: "AIzaSyDTDvGXNnUuzR3cqjVc5ZLyHfNqhrA_q5w",
  authDomain: "wapp-c2920.firebaseapp.com",
  databaseURL: "https://wapp-c2920-default-rtdb.firebaseio.com",
  projectId: "wapp-c2920",
  storageBucket: "wapp-c2920.appspot.com",
  messagingSenderId: "173956484948",
  appId: "1:173956484948:web:3c7ea53f56301230aa82c1",
  measurementId: "G-VX01JD5DCY",
};

// The project's public Web Push (VAPID) key. Builds normally get it from
// VITE_VAPID_KEY; the local Docker build has no env file, so fall back to it
// (it is public, like the config above) and keep tokens tied to this project's
// key everywhere.
const VAPID_KEY =
  import.meta.env.VITE_VAPID_KEY ||
  "BLGKEfuaans2E5HO9H6OQOfLDoyrbx0Dl_XtcVLrUz-0LZvoNEvrO3tchAH8kZl_BleEDosVd-L684xbBCGn4GU";

// Module-level singletons — ensures onMessage is registered exactly once per session
let messagingInstance: any = null;
let foregroundListenerSet = false;

export const getFirebaseMessaging = async () => {
  const [{ initializeApp, getApps }, { getMessaging, getToken, onMessage }] =
    await Promise.all([import("firebase/app"), import("firebase/messaging")]);

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }

  // Register the foreground handler only once per session
  if (!foregroundListenerSet) {
    foregroundListenerSet = true;
    onMessage(messagingInstance, (payload) => {
      if (Notification.permission !== "granted") return;
      const title = payload.notification?.title || "New message";
      const options = {
        body: payload.notification?.body || "",
        icon: "/icon-192.png",
        tag: payload.messageId || "chat-msg",
        renotify: true,
      };
      // Use service worker showNotification — required in Firefox, preferred everywhere
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, options))
          .catch(() => new Notification(title, options));
      } else {
        new Notification(title, options);
      }
    });
  }

  if (!("serviceWorker" in navigator) || import.meta.env.DEV) {
    return { getToken, messaging: messagingInstance, token: null };
  }

  await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });
  // A worker that is still installing can't subscribe to push ("no active
  // Service Worker"): wait for the active one, as on a first visit or right
  // after an update.
  const serviceWorkerRegistration = await navigator.serviceWorker.ready;

  const token = await getToken(messagingInstance, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration,
  });

  return { getToken, messaging: messagingInstance, token };
};
