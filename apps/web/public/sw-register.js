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

    // When the new SW takes control, reload once to serve fresh assets
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
