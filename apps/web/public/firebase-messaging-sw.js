importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js",
);
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js",
);

// ─── Firebase ─────────────────────────────────────────────────────────────────

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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || "Default Title";
  const notificationBody = payload.notification?.body || "Default Body";
  const notificationIcon = payload.notification?.image;

  self.registration.showNotification(notificationTitle, {
    body: notificationBody,
    icon: notificationIcon,
    tag: payload.messageId,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      timestamp: Date.now(),
      notificationId: payload.messageId || Date.now(),
    },
  });
});

// ─── Workbox ──────────────────────────────────────────────────────────────────

if (!workbox) {
  console.error("Workbox could not be loaded.");
} else {
  workbox.setConfig({ debug: false });

  // Precache app shell — workbox injectManifest replaces this placeholder at build time
  workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

  // ── Static assets ──────────────────────────────────────────────────────────

  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.origin === self.location.origin &&
      (request.destination === "script" || request.destination === "style") &&
      /\.[a-f0-9]{8,}\.(js|css|chunk\.js)$/.test(url.pathname),
    new workbox.strategies.CacheFirst({
      cacheName: "versioned-assets-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 365 * 24 * 60 * 60,
          maxEntries: 100,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.origin === self.location.origin &&
      (request.destination === "image" ||
        /\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname) ||
        url.pathname.startsWith("/static/media/")),
    new workbox.strategies.CacheFirst({
      cacheName: "images-cache-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 30 * 24 * 60 * 60,
          maxEntries: 100,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.origin === self.location.origin &&
      (request.destination === "document" || url.pathname.endsWith(".html")),
    new workbox.strategies.NetworkFirst({
      cacheName: "html-cache-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 24 * 60 * 60,
          maxEntries: 10,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === self.location.origin &&
      (url.pathname.startsWith("/static/") ||
        url.pathname.startsWith("/logo") ||
        url.pathname.startsWith("/manifest")),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "static-resources-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 7 * 24 * 60 * 60,
          maxEntries: 50,
        }),
      ],
    }),
  );

  // ── API caching ────────────────────────────────────────────────────────────
  // Note: API may be on a different origin (port), so we match by pathname only.

  // Notifications - NetworkFirst since they need to be real-time
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith("/api/get-notifications"),
    new workbox.strategies.NetworkFirst({
      cacheName: "api-notifications-v1",
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 10,
          maxAgeSeconds: 60,
        }),
      ],
    }),
  );

  // Auth - short cache, needs to be fresh
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith("/api/verify-user"),
    new workbox.strategies.CacheFirst({
      cacheName: "api-auth-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 5,
          maxAgeSeconds: 10 * 60,
        }),
      ],
    }),
  );

  // All other GET API routes - catch-all
  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.pathname.startsWith("/api/") && request.method === "GET",
    new workbox.strategies.CacheFirst({
      cacheName: "api-general-v1",
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 5 * 60,
        }),
      ],
    }),
  );

  // Mutations - never cache, but queue if offline
  workbox.routing.registerRoute(
    ({ request, url }) =>
      ["POST", "PUT", "DELETE", "PATCH"].includes(request.method) &&
      url.pathname.startsWith("/api/"),
    new workbox.strategies.NetworkOnly({
      plugins: [
        new workbox.backgroundSync.BackgroundSyncPlugin("formSubmissionQueue", {
          maxRetentionTime: 24 * 60,
          onSync: async ({ queue }) => {
            let entry;
            while ((entry = await queue.shiftRequest())) {
              try {
                await fetch(entry.request.clone());
              } catch (err) {
                console.error("Replay failed for:", entry.request.url, err);
                throw err;
              }
            }
          },
        }),
      ],
    }),
  );

  // ── Cache invalidation via postMessage ────────────────────────────────────

  self.addEventListener("message", async (event) => {
    if (event.data?.type === "INVALIDATE_CACHE") {
      const { cacheName, urlPattern } = event.data;
      try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        const toDelete = keys.filter((req) =>
          urlPattern ? req.url.includes(urlPattern) : true,
        );
        await Promise.all(toDelete.map((req) => cache.delete(req)));
        event.source?.postMessage({
          type: "CACHE_INVALIDATED",
          count: toDelete.length,
        });
      } catch (err) {
        console.error("Cache invalidation failed:", err);
      }
    }

    if (event.data?.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
  });
}
