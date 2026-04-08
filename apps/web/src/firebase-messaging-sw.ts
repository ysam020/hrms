/// <reference lib="WebWorker" />
declare const self: ServiceWorkerGlobalScope;

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// ── Firebase Messaging ───────────────────────────────────────────────────────
const firebaseApp = initializeApp({
  apiKey: "AIzaSyDTDvGXNnUuzR3cqjVc5ZLyHfNqhrA_q5w",
  authDomain: "wapp-c2920.firebaseapp.com",
  databaseURL: "https://wapp-c2920-default-rtdb.firebaseio.com",
  projectId: "wapp-c2920",
  storageBucket: "wapp-c2920.appspot.com",
  messagingSenderId: "173956484948",
  appId: "1:173956484948:web:3c7ea53f56301230aa82c1",
  measurementId: "G-VX01JD5DCY",
});

const messaging = getMessaging(firebaseApp);

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title ?? "Praesto";
  const body = payload.notification?.body ?? "";
  const icon = payload.notification?.image ?? "/favicon.ico";

  self.registration.showNotification(title, {
    body,
    icon,
    tag: payload.messageId,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      timestamp: Date.now(),
      notificationId: payload.messageId ?? Date.now(),
    },
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "INVALIDATE_CACHE") {
    const { cacheName, urlPattern } = event.data;
    caches.open(cacheName).then((cache) => {
      cache.keys().then((keys) => {
        const toDelete = keys.filter((req) =>
          urlPattern ? req.url.includes(urlPattern) : true,
        );
        Promise.all(toDelete.map((req) => cache.delete(req))).then(() => {
          event.source?.postMessage({
            type: "CACHE_INVALIDATED",
            count: toDelete.length,
          });
        });
      });
    });
  }
});

// ── Workbox Precaching ───────────────────────────────────────────────────────
// vite-plugin-pwa replaces self.__WB_MANIFEST with the asset list at build time
cleanupOutdatedCaches();
precacheAndRoute((self as any).__WB_MANIFEST ?? []);

// ── Navigation fallback (SPA shell) ─────────────────────────────────────────
// Serve cached index.html for all navigation requests; fall back to offline.html
const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(
    async (params) => {
      try {
        return await navigationHandler(params);
      } catch {
        const offline = await caches.match("/offline.html");
        return offline ?? Response.error();
      }
    },
    // Don't intercept OAuth callbacks or API calls
    { denylist: [/\/api\//, /oauth_success/, /error=/] },
  ),
);

// ── Static assets (hashed filenames = immutable) ─────────────────────────────
registerRoute(
  ({ request }) =>
    request.destination === "script" || request.destination === "style",
  new CacheFirst({
    cacheName: "static-assets-v1",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60,
        maxEntries: 200,
      }),
    ],
  }),
);

// ── Images ───────────────────────────────────────────────────────────────────
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images-v1",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxEntries: 100,
      }),
    ],
  }),
);

// ── Fonts ────────────────────────────────────────────────────────────────────
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: "fonts-v1",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60,
        maxEntries: 30,
      }),
    ],
  }),
);

// ── API: Notifications (real-time, very short cache) ─────────────────────────
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/get-notifications"),
  new NetworkFirst({
    cacheName: "api-notifications-v1",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 30 }),
    ],
  }),
);

// ── API: Dashboard / analytics (medium cache, offline reads ok) ───────────────
registerRoute(
  ({ url }) =>
    url.pathname.includes("insights") ||
    url.pathname.includes("analytics") ||
    url.pathname.startsWith("/api/get-holidays") ||
    url.pathname.startsWith("/api/birthdays-anniversaries") ||
    url.pathname.startsWith("/api/get-hr-activities"),
  new NetworkFirst({
    cacheName: "api-dashboard-v1",
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 15 * 60 }),
    ],
  }),
);

// ── API: All other GET routes ────────────────────────────────────────────────
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith("/api/") && request.method === "GET",
  new NetworkFirst({
    cacheName: "api-general-v1",
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  }),
);
