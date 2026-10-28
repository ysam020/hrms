// Development only. The production build overwrites this file with the real
// service worker (sw/sw.ts). The dev server doesn't register a worker; this
// stand-in retires one left over from an earlier build or from Classic's
// worker, so `vite dev` always runs against the network: it clears this
// origin's caches, unregisters itself and reloads the open tabs.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) await caches.delete(name);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" }))
        client.navigate(client.url);
    })(),
  );
});
