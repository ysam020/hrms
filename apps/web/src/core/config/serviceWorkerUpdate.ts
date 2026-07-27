// Pairs with firebase-messaging-sw.ts's skipWaiting()/clients.claim(): once
// a new service worker version activates and takes control of this page,
// this tab is still running the *old* JS bundle in memory against a now
// differently-versioned cache/routing table. Reload exactly once so it
// actually picks up the new bundle, instead of continuing to run stale code
// (the previous failure mode here — no update handling at all — meant a new
// deploy silently never took effect for an already-open tab).
export function watchForServiceWorkerUpdates(): void {
  if (!("serviceWorker" in navigator)) return;

  // If no service worker currently controls this page, the controllerchange
  // that's about to fire is the *first* activation for this client (a new
  // visitor, or one returning after a cache/storage clear) — there's no
  // stale bundle to replace, so reloading would just interrupt whatever
  // this load is already doing (e.g. consuming the Google OAuth callback's
  // access_token query param). Only reload when a controller already
  // existed, i.e. this is a genuine version change under an open tab.
  const hadController = !!navigator.serviceWorker.controller;

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });
}
