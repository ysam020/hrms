// Pairs with firebase-messaging-sw.ts's skipWaiting()/clients.claim(): once
// a new service worker version activates and takes control of this page,
// this tab is still running the *old* JS bundle in memory against a now
// differently-versioned cache/routing table. Reload exactly once so it
// actually picks up the new bundle, instead of continuing to run stale code
// (the previous failure mode here — no update handling at all — meant a new
// deploy silently never took effect for an already-open tab).
export function watchForServiceWorkerUpdates(): void {
  if (!("serviceWorker" in navigator)) return;

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
