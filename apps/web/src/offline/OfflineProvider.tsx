import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getAccessToken } from "@web/core/http/axiosConfig";
import { probe, watchConnectivity } from "./connectivity";
import { diag } from "./diag";
import {
  listMutations,
  otherScopesWithPendingWork,
  pruneSynced,
} from "./queue";
import { registerServiceWorker, requestBackgroundSync } from "./register";
import {
  getApplyUpdate,
  getConnectivity,
  getScope,
  getVersion,
  scopeFromToken,
  setScope,
  subscribe,
} from "./state";
import { getStore, requestPersistence, type MutationRecord } from "./store";
import {
  cleanupUploads,
  nextRetryAt,
  resumeAfterSignIn,
  syncNow,
} from "./sync";

// Wires the offline layer to the session and the page lifecycle. Mounted
// once, inside the session (it needs the signed-in user).
//
// Sync runs: when someone signs in, when the app starts, when the tab is
// shown again, when the browser reports the network is back (confirmed with
// a probe), when Background Sync wakes the app, when a retry falls due, and
// when the person presses Retry.

let persistenceAsked = false;
let persistent: boolean | null = null;

async function kick() {
  if (!getScope()) return;
  if (getConnectivity() !== "online") await probe();
  const res = await syncNow();
  if (res.stoppedBy === "offline" && res.remaining > 0)
    void requestBackgroundSync();
  if (res.synced) void cleanupUploads();
}

export function OfflineProvider({
  user,
  children,
}: {
  user: unknown;
  children: ReactNode;
}) {
  // Whose work is this? Recomputed whenever the session changes. A change of
  // person or organisation switches scope; the previous scope's work stays
  // on the device, untouched and unseen, until that account signs in again.
  useEffect(() => {
    // Offline mode has no token yet; it carries the remembered scope.
    const u = user as { offlineScope?: string } | null;
    const next = user
      ? (scopeFromToken(getAccessToken()) ?? u?.offlineScope ?? null)
      : null;
    const previous = getScope();
    setScope(next);
    if (next && next !== previous) {
      if (previous) diag("scope.changed");
      void resumeAfterSignIn()
        .then(() => pruneSynced())
        .then(kick);
    }
  }, [user]);

  // Page lifecycle and the service worker: once.
  useEffect(() => {
    registerServiceWorker(() => void kick());
    const stop = watchConnectivity(() => void kick());
    const onVisible = () => {
      if (document.visibilityState === "visible") void kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Wake up when the next retry is due.
  const version = useSyncExternalStore(subscribe, getVersion);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    let cancelled = false;
    void nextRetryAt().then((at) => {
      if (cancelled || at === null) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => void kick(),
        Math.max(1000, at - Date.now()),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return <>{children}</>;
}

// ── Reading the offline state from components ───────────────────────────────

export interface OfflineSummary {
  connectivity: ReturnType<typeof getConnectivity>;
  ops: MutationRecord[];
  waiting: number;
  syncing: number;
  attention: number;
  otherAccounts: number;
  /** null: unknown yet. false: the browser may clear this data under pressure. */
  persistent: boolean | null;
  durable: boolean;
  updateReady: boolean;
}

/** Live view of the queue and connection, for the status UI. */
export function useOfflineSummary(): OfflineSummary {
  const version = useSyncExternalStore(subscribe, getVersion);
  const [data, setData] = useState<{
    ops: MutationRecord[];
    otherAccounts: number;
    durable: boolean;
  }>({ ops: [], otherAccounts: 0, durable: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [ops, otherAccounts, store] = await Promise.all([
        listMutations(),
        otherScopesWithPendingWork(),
        getStore(),
      ]);
      // Ask the browser to keep our data once there is something to keep.
      if (!persistenceAsked && ops.some((o) => o.status !== "synced")) {
        persistenceAsked = true;
        persistent = await requestPersistence();
      }
      if (!cancelled) setData({ ops, otherAccounts, durable: store.durable });
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const open = data.ops.filter((o) => o.status !== "synced");
  return {
    connectivity: getConnectivity(),
    ops: data.ops,
    waiting: open.filter((o) =>
      ["queued", "retrying", "auth"].includes(o.status),
    ).length,
    syncing: open.filter((o) => o.status === "syncing").length,
    attention: open.filter((o) => ["attention", "conflict"].includes(o.status))
      .length,
    otherAccounts: data.otherAccounts,
    persistent,
    durable: data.durable,
    updateReady: Boolean(getApplyUpdate()),
  };
}

/** Start a sync pass now (the Retry button). */
export const syncFromUi = () => kick();
