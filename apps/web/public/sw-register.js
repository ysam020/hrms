if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js", { scope: "/" })
      .then((reg) => {
        // When a new SW is waiting, show an update banner and activate on confirm
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Dispatch a custom event so the React app can show a toast
              window.dispatchEvent(
                new CustomEvent("sw-update-available", { detail: reg }),
              );
            }
          });
        });
      })
      .catch(console.error);

    // Reload-on-update is handled once, centrally, by
    // watchForServiceWorkerUpdates() (see src/core/config/serviceWorkerUpdate.ts)
    // — it also guards against reloading on this client's first-ever SW
    // activation, which a second independent listener here can't do.
  });
}
