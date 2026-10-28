/// <reference lib="WebWorker" />
// Praesto Next's service worker, published as /firebase-messaging-sw.js so
// it replaces Classic's copy in place (same URL, same scope): one worker,
// which also keeps push notifications working.
//
// Responsibilities, and nothing more:
//   1. Precache the application shell (the build's own files) so the app
//      opens without a network. The manifest is injected after the build by
//      scripts/inject-sw-manifest.mjs (workbox-build injectManifest).
//   2. Serve that shell for in-app navigations, so any route loads offline.
//      The app itself still decides what a signed-out visitor may see; the
//      shell contains no user data.
//   3. Cache fonts and images, with size and age limits.
//   4. Cache NO API responses. HR data stays out of Cache Storage, where it
//      would be shared by everyone who uses this browser profile. The
//      worker also deletes the API caches Classic's worker used to fill.
//   5. Wake the app for Background Sync (it replays its own queue with the
//      signed-in session; the worker holds no credentials).
//   6. Firebase background push notifications.
//
// Updates: a new version installs and then waits. The app asks the person
// to reload when nothing would be lost, and sends SKIP_WAITING.

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

export const CACHE_VERSION = "v1";
const FONT_CACHE = `praesto-fonts-${CACHE_VERSION}`;
const IMAGE_CACHE = `praesto-images-${CACHE_VERSION}`;
const RUNTIME_CACHES = [FONT_CACHE, IMAGE_CACHE];
// Caches left by Classic's worker on this origin. The api-* ones held API
// responses (profiles, payroll, KYC) for whoever was signed in: remove them.
const LEGACY_CACHES = [
  "api-general-v1",
  "api-dashboard-v1",
  "api-notifications-v1",
  "static-assets-v1",
  "images-v1",
  "fonts-v1",
];

// ── 1. Precache the shell ───────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(RUNTIME_CACHES);
      for (const name of await caches.keys()) {
        const ours = name.startsWith("praesto-") && !keep.has(name);
        if (LEGACY_CACHES.includes(name) || ours) await caches.delete(name);
      }
    })(),
  );
});
clientsClaim();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// ── 2. In-app navigations get the shell ─────────────────────────────────────
const shell = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(
    async (options) => {
      try {
        return await shell(options);
      } catch {
        return (await matchPrecache("/offline.html")) ?? Response.error();
      }
    },
    {
      // The API, sockets, the worker itself and the OAuth return go to the
      // network untouched.
      denylist: [
        /^\/api\//,
        /^\/socket\.io\//,
        /^\/health/,
        /firebase-messaging-sw\.js$/,
      ],
    },
  ),
);

// ── 3. Fonts and images ─────────────────────────────────────────────────────
registerRoute(
  ({ request, url }) =>
    request.destination === "font" && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: FONT_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 86400 }),
    ],
  }),
);
registerRoute(
  ({ request, url }) =>
    request.destination === "image" &&
    url.origin === self.location.origin &&
    // Never cache signed URLs or anything from the API.
    !url.pathname.startsWith("/api/"),
  new CacheFirst({
    cacheName: IMAGE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 30 * 86400,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
// Everything else (notably /api/*) is not handled here: the browser sends it
// to the network as usual, with no caching by this worker.

// ── 5. Background Sync wake-up ──────────────────────────────────────────────
// The queue lives in the app's IndexedDB and must be replayed with the
// signed-in session, which only an open app has. So on a sync event the
// worker asks any open Praesto window to sync; with none open, the app syncs
// the next time it starts.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}
self.addEventListener("sync", ((event: SyncEvent) => {
  if (event.tag !== "praesto-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) =>
        clients.forEach((c) => c.postMessage({ type: "PRAESTO_SYNC" })),
      ),
  );
}) as EventListener);

// ── 6. Push notifications (same project as Classic) ─────────────────────────
const messaging = getMessaging(
  initializeApp({
    apiKey: "AIzaSyDTDvGXNnUuzR3cqjVc5ZLyHfNqhrA_q5w",
    authDomain: "wapp-c2920.firebaseapp.com",
    databaseURL: "https://wapp-c2920-default-rtdb.firebaseio.com",
    projectId: "wapp-c2920",
    storageBucket: "wapp-c2920.appspot.com",
    messagingSenderId: "173956484948",
    appId: "1:173956484948:web:3c7ea53f56301230aa82c1",
    measurementId: "G-VX01JD5DCY",
  }),
);
onBackgroundMessage(messaging, (payload) => {
  void self.registration.showNotification(
    payload.notification?.title ?? "Praesto",
    {
      body: payload.notification?.body ?? "",
      icon: payload.notification?.image ?? "/favicon.ico",
      tag: payload.messageId,
      requireInteraction: true,
      data: { timestamp: Date.now(), notificationId: payload.messageId },
    },
  );
});
