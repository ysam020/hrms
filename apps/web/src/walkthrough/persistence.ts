import { apiClient, unwrap } from "@next/lib/api";
import { STATE_SCHEMA, type WalkthroughState } from "./types";
import { newer, normalize } from "./engine";

// Where walkthrough progress lives. The server copy (GET/PUT/DELETE
// /walkthrough/progress, keyed by the signed-in tenant and user) follows
// the person across devices; a localStorage copy, namespaced by tenant and
// user, makes loading instant and covers offline use and failed saves.
// Neither holds anything but step ids, statuses and a route: no tokens, no
// HR data. Sign-out clears the local copy (signOutStorage keeps only
// device preferences).

export interface ProgressAdapter {
  load(): Promise<unknown>;
  save(state: WalkthroughState): Promise<void>;
  clear(): Promise<void>;
}

export const WALKTHROUGH_ENDPOINT = "/walkthrough/progress";

export const localKey = (scope: string) =>
  `px-walkthrough:${STATE_SCHEMA}:${scope}`;

export function localAdapter(scope: string): ProgressAdapter {
  const key = localKey(scope);
  return {
    async load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null; // blocked storage or a corrupt value
      }
    },
    async save(state) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* full or blocked: the server copy still has it */
      }
    },
    async clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function remoteAdapter(): ProgressAdapter {
  return {
    async load() {
      const res = await apiClient.get(WALKTHROUGH_ENDPOINT);
      return unwrap<{ state: unknown }>(res)?.state ?? null;
    },
    async save(state) {
      await apiClient.put(WALKTHROUGH_ENDPOINT, { state });
    },
    async clear() {
      await apiClient.delete(WALKTHROUGH_ENDPOINT);
    },
  };
}

/** Marks a tour running in this tab, so a refresh carries on with it. */
export const runningKey = (scope: string) => `px-walkthrough-running:${scope}`;

export function readRunningMarker(scope: string): string | null {
  try {
    return sessionStorage.getItem(runningKey(scope));
  } catch {
    return null;
  }
}

export function writeRunningMarker(scope: string, tour: string | null) {
  try {
    if (tour) sessionStorage.setItem(runningKey(scope), tour);
    else sessionStorage.removeItem(runningKey(scope));
  } catch {
    /* ignore */
  }
}

/**
 * Local + remote together. `load` returns the newer of the two (and pushes a
 * newer local copy up, e.g. after an offline session); `save` writes locally
 * at once and to the server after `delay`, coalescing rapid steps into one
 * request. A failed server save is retried with the next change or `flush`.
 */
export function createProgressStore(
  scope: string,
  {
    local = localAdapter(scope),
    remote = remoteAdapter(),
    delay = 800,
  }: {
    local?: ProgressAdapter;
    remote?: ProgressAdapter | null;
    delay?: number;
  } = {},
) {
  let pending: WalkthroughState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Once disposed (sign-out, another account) nothing more is sent: the API
  // client would carry the next person's token.
  let disposed = false;

  const push = async () => {
    clearTimeout(timer);
    timer = undefined;
    const state = pending;
    if (!state || !remote || disposed) return;
    try {
      await remote.save(state);
      if (pending === state) pending = null;
    } catch {
      /* keep `pending`: the next save or flush retries */
    }
  };

  return {
    async load(): Promise<WalkthroughState | null> {
      const keepRunning = readRunningMarker(scope);
      const opts = (raw: any) => ({
        keepRunning: Boolean(keepRunning && raw?.active === keepRunning),
      });
      const rawLocal = await local.load();
      const fromLocal = normalize(rawLocal, opts(rawLocal));
      let fromRemote: WalkthroughState | null = null;
      let remoteOk = false;
      if (remote) {
        try {
          const raw = await remote.load();
          fromRemote = normalize(raw, opts(raw));
          remoteOk = true;
        } catch {
          /* offline or failing: the local copy stands in */
        }
      }
      const best = newer(fromRemote, fromLocal);
      if (best && remoteOk && best === fromLocal && best !== fromRemote) {
        pending = best;
        void push();
      }
      return best;
    },
    save(state: WalkthroughState) {
      if (disposed) return;
      void local.save(state);
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(() => void push(), delay);
    },
    /** Send any unsaved change now (pausing, leaving the page). */
    flush: push,
    async clear() {
      pending = null;
      clearTimeout(timer);
      await local.clear();
      if (remote) await remote.clear().catch(() => undefined);
    },
    /** Stop for good. Call `flush` first while the session is still this one. */
    dispose() {
      disposed = true;
      pending = null;
      clearTimeout(timer);
    },
  };
}

export type ProgressStore = ReturnType<typeof createProgressStore>;
