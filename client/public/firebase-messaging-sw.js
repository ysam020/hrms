importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);

// Import Workbox libraries
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js"
);

// Workbox caching
if (workbox) {
  workbox.setConfig({ debug: false });
  // Precache files
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);
  workbox.routing.registerRoute(
    ({ url }) => {
      // Match only static assets (JS, CSS, images)
      return (
        url.origin === self.location.origin &&
        (url.pathname.endsWith(".html") ||
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".css") ||
          url.pathname.endsWith(".png") ||
          url.pathname.endsWith(".ico") ||
          url.pathname.startsWith("/static/css/") ||
          url.pathname.startsWith("/static/js/") ||
          url.pathname.startsWith("/static/media/"))
      );
    },
    new workbox.strategies.CacheFirst({
      cacheName: "static-assets-cache-v1",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 1 * 60 * 60, // Cache for 1 hour (changed from 30 days)
          maxEntries: 1000, // Limit the number of entries in the cache
        }),
      ],
    })
  );

  // Dynamic API caching
  const apiOrigin =
    self.location.hostname === "localhost"
      ? "http://localhost:9002"
      : "https://sameer-yadav.online";

  workbox.routing.registerRoute(
    ({ url }) => url.origin === apiOrigin,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "dynamic-api-cache-v1",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 1000,
          maxAgeSeconds: 5 * 60, // Cache for 5 minutes
        }),
      ],
    })
  );

  // Offline form submission
  const allowedMethods = ["POST", "PUT", "DELETE"];
  workbox.routing.registerRoute(
    ({ request }) =>
      allowedMethods.includes(request.method) && // Match allowed methods dynamically
      request.url.startsWith(apiOrigin),
    new workbox.strategies.NetworkOnly({
      plugins: [
        new workbox.backgroundSync.BackgroundSyncPlugin("formSubmissionQueue", {
          maxRetentionTime: 24 * 60, // Retry for up to 24 hours
          onSync: async ({ queue }) => {
            let entry;
            while ((entry = await queue.shiftRequest())) {
              try {
                const requestInit = {
                  method: entry.request.method, // Dynamically handle the method
                  headers: entry.request.headers,
                  body: await entry.request.blob(),
                  credentials: "include", // Include cookies
                };
                const url = entry.request.url;

                await fetch(url, requestInit);
              } catch (err) {
                console.error("Replay failed for:", entry.request, err);
                throw err;
              }
            }
          },
        }),
      ],
    })
  );
} else {
  console.error("Workbox could not be loaded.");
}

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDTDvGXNnUuzR3cqjVc5ZLyHfNqhrA_q5w",
  authDomain: "wapp-c2920.firebaseapp.com",
  databaseURL: "https://wapp-c2920-default-rtdb.firebaseio.com",
  projectId: "wapp-c2920",
  storageBucket: "wapp-c2920.appspot.com",
  messagingSenderId: "173956484948",
  appId: "1:173956484948:web:3c7ea53f56301230aa82c1",
  measurementId: "G-VX01JD5DCY",
});

// Firebase service worker for push notifications
const messaging = firebase.messaging();
// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log(payload);
  const notificationTitle = payload.notification?.title || "Default Title";
  const notificationBody = payload.notification?.body || "Default Body";
  const notificationIcon =
    payload.notification?.image ||
    "https://paymaster-document.s3.ap-south-1.amazonaws.com/kyc/personal.webp/favicon.png";

  // Show the notification
  self.registration.showNotification(notificationTitle, {
    body: notificationBody,
    icon: notificationIcon,
    tag: payload.messageId,
    renotify: true,
    requireInteraction: true, // stays until user acts
    vibrate: [200, 100, 200], // optional, for visual feedback
    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      timestamp: Date.now(),
      notificationId: payload.messageId || Date.now(),
    },
    sound: "default", // for mobile — not supported on desktop web
  });
});
