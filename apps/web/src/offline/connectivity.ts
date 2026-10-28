import { diag } from "./diag";
import { markReachable, setBrowserOnline } from "./state";

// Is the API actually reachable? The browser's online/offline events only
// say whether there's a network interface; a captive portal or a gateway
// outage looks "online". The probe asks the gateway itself, unauthenticated
// and uncached, and any HTTP answer (even an error) counts as reachable.

const API = (import.meta.env.VITE_API_STRING as string) || "/api/v1";
const PROBE_URL = `${API}/csrf-token`;
const PROBE_TIMEOUT_MS = 5000;

export async function probe(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    markReachable(false);
    return false;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(PROBE_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: ctrl.signal,
    });
    markReachable(true);
    return true;
  } catch {
    markReachable(false);
    diag("connectivity.unreachable");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Track the browser's hints; returns a cleanup function. */
export function watchConnectivity(onRestore: () => void) {
  const online = () => {
    setBrowserOnline(true);
    void probe().then((ok) => ok && onRestore());
  };
  const offline = () => {
    setBrowserOnline(false);
    markReachable(false);
    diag("connectivity.offline");
  };
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}
