import type { Scope } from "./store";

// Shared, in-memory facts about the offline layer, with change
// notifications so React can subscribe (useSyncExternalStore).

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Something persisted changed (queue, uploads, drafts): re-read. */
export function notify() {
  version++;
  for (const fn of listeners) fn();
}
let version = 0;
export const getVersion = () => version;

// ── Scope: who is signed in, and to which organisation ─────────────────────

let scope: Scope | null = null;

/** `${tenantId}:${userId}` from an access token, or null. */
export function scopeFromToken(token: string | null): Scope | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!payload?.tenantId || !payload?.userId) return null;
    return `${payload.tenantId}:${payload.userId}`;
  } catch {
    return null;
  }
}

export function getScope() {
  return scope;
}

export function setScope(next: Scope | null) {
  if (next === scope) return;
  scope = next;
  notify();
}

// ── Connectivity ────────────────────────────────────────────────────────────
// `navigator.onLine` false means definitely offline; true only means "maybe".
// Whether the API is actually reachable is learnt from a probe or from real
// requests (markReachable/markUnreachable).

export type Connectivity = "online" | "offline" | "unreachable";

let browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
let apiReachable = true;

export function getConnectivity(): Connectivity {
  if (!browserOnline) return "offline";
  return apiReachable ? "online" : "unreachable";
}

export function setBrowserOnline(v: boolean) {
  if (v === browserOnline) return;
  browserOnline = v;
  notify();
}

export function markReachable(v: boolean) {
  if (v === apiReachable) return;
  apiReachable = v;
  notify();
}

// ── Work that a page reload would interrupt ─────────────────────────────────
// Forms with unsaved edits and uploads in flight register here, so an app
// update waits instead of reloading under them.

const busy = new Set<string>();

export function setBusy(key: string, on: boolean) {
  const had = busy.has(key);
  if (on) busy.add(key);
  else busy.delete(key);
  if (had !== on) notify();
}

export const isBusy = () => busy.size > 0;

// ── App updates ─────────────────────────────────────────────────────────────
// Set when a new service worker is installed and waiting; calling it
// activates the new version and reloads.

let applyUpdate: (() => void) | null = null;

export function setUpdateReady(fn: (() => void) | null) {
  applyUpdate = fn;
  notify();
}

export const getApplyUpdate = () => applyUpdate;
