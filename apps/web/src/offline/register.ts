import { Workbox } from "workbox-window";
import { diag } from "./diag";
import { isBusy, setUpdateReady } from "./state";

// Registers the service worker (production builds only — the dev server
// runs without one; see public/firebase-messaging-sw.js) and manages
// updates: a new version waits until it's safe to switch.
//
//  - Found while the app is starting and nothing is being edited: switch
//    straight away (nothing to lose yet).
//  - Found later: show "Update available"; the person reloads when ready.
//    The reload is held back while a form has unsaved edits or an upload
//    is running.

const STARTUP_WINDOW_MS = 5000;
const RELOADED_FLAG = "px-sw-updated";

export function registerServiceWorker(onSyncRequest: () => void) {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  const startedAt = Date.now();
  const wb = new Workbox("/firebase-messaging-sw.js", { scope: "/" });

  const activate = () => {
    wb.addEventListener("controlling", () => {
      try {
        sessionStorage.setItem(RELOADED_FLAG, "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    });
    wb.messageSkipWaiting();
  };

  wb.addEventListener("waiting", () => {
    diag("sw.update-waiting");
    let reloadedAlready = false;
    try {
      reloadedAlready = sessionStorage.getItem(RELOADED_FLAG) === "1";
    } catch {
      /* ignore */
    }
    if (
      !reloadedAlready &&
      Date.now() - startedAt < STARTUP_WINDOW_MS &&
      !isBusy()
    ) {
      activate();
      return;
    }
    setUpdateReady(activate);
  });

  // The worker asks open windows to sync when Background Sync fires.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "PRAESTO_SYNC") onSyncRequest();
  });

  wb.register()
    .then(() => {
      try {
        sessionStorage.removeItem(RELOADED_FLAG);
      } catch {
        /* ignore */
      }
    })
    .catch((err) => diag("sw.register-failed", { name: err?.name }));

  // Look for a new version when the person comes back to the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void wb.update();
  });
}

/** Ask the browser to wake us for sync when connectivity returns. */
export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (
      reg as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    )?.sync;
    if (sync) await sync.register("praesto-sync");
  } catch {
    // Unsupported or denied: the app syncs on its own triggers instead.
  }
}
