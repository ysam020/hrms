import { useEffect, useState } from "react";

/**
 * Listens for the custom "sw-update-available" event dispatched by index.html
 * when a new service worker is waiting to activate.
 *
 * Returns `triggerUpdate` — call it to skip waiting and reload with fresh assets.
 */
export function useSwUpdate() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setRegistration((e as CustomEvent<ServiceWorkerRegistration>).detail);
    };
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  const triggerUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    setRegistration(null);
  };

  return { updateAvailable: !!registration, triggerUpdate };
}
