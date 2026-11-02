import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useSocket } from "@web/app/providers/SocketContext";
import { apiClient, errorMessage, isCanceled, unwrap } from "@next/lib/api";
import {
  PRESENCE_API,
  browserTimeZone,
  displayStatus,
  presenceStore,
  type Availability,
  type Duration,
  type OwnPresence,
  type PresenceView,
} from "./model";

// Signed-in presence (docs/presence.md): the person's own status, the
// activity signal behind online/idle, and one shared watch list for every
// indicator on screen. Lives in AppShell inside SocketProvider.
//
// Activity is a timestamp of the last input event — never which key, where
// the pointer was, or what was on screen.

const INPUT_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;
const MAX_WATCH = 500;
const HTTP_CHUNK = 200;

export interface StatusChoice {
  availability: Availability;
  message: string | null;
  duration: Duration;
}

interface PresenceContextValue {
  me: OwnPresence | null;
  saving: boolean;
  choose: (choice: StatusChoice) => Promise<boolean>;
  restore: () => Promise<boolean>;
  clearMessage: () => Promise<boolean>;
  /** Keep these people's presence live; returns the release function. */
  watch: (ids: string[]) => () => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export const usePresence = () => useContext(PresenceContext);

const FIXED_MS: Partial<Record<Duration, number>> = {
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 120 * 60_000,
};

/** What the person will see until the server answers. */
function optimistic(before: OwnPresence, c: StatusChoice): OwnPresence {
  const ms = FIXED_MS[c.duration];
  return {
    ...before,
    availability: c.availability,
    message: c.message,
    source: "manual",
    status: displayStatus(c.availability, before.connectivity),
    expiresAt:
      c.duration === "until_changed"
        ? null
        : ms
          ? new Date(Date.now() + ms).toISOString()
          : before.expiresAt,
  };
}

const ownOf = (res: unknown) =>
  unwrap<{ presence: OwnPresence }>(res as any).presence;

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const { socketRef, connected } = useSocket();
  const userId: string | undefined = user?.id;
  const [me, setMe] = useState<OwnPresence | null>(null);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    idleAfterSeconds: 300,
    heartbeatSeconds: 25,
  });
  const [reload, setReload] = useState(0);
  const meRef = useRef<OwnPresence | null>(null);
  const activity = useRef<"active" | "idle">("active");
  const watchCounts = useRef(new Map<string, number>());
  const sentWatch = useRef<string | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // A different person signed in: forget everything about the last one.
  useEffect(() => {
    presenceStore.clear();
    setMe(null);
    sentWatch.current = null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const ctrl = new AbortController();
    apiClient
      .get(PRESENCE_API.me, { signal: ctrl.signal })
      .then((res) => {
        const data = unwrap<any>(res);
        setMe(data.presence);
        if (data.config) setConfig(data.config);
      })
      .catch((err) => {
        if (!isCanceled(err))
          console.warn("[presence] status unavailable", err);
      });
    return () => ctrl.abort();
  }, [userId, reload]);

  const sendWatch = useCallback(
    (force = false) => {
      const ids = [...watchCounts.current.keys()].slice(0, MAX_WATCH);
      const key = ids.join(",");
      if (!force && key === sentWatch.current) return;
      sentWatch.current = key;
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit(
          "presence:watch",
          { userIds: ids },
          (ack: { ok: boolean; presence?: PresenceView[] }) => {
            if (ack?.ok) ack.presence?.forEach((v) => presenceStore.merge(v));
          },
        );
        return;
      }
      // No live connection yet: a one-off snapshot, live again on connect.
      for (let i = 0; i < ids.length; i += HTTP_CHUNK)
        apiClient
          .get(PRESENCE_API.batch(ids.slice(i, i + HTTP_CHUNK)))
          .then((res) =>
            unwrap<{ presence: PresenceView[] }>(res).presence.forEach((v) =>
              presenceStore.merge(v),
            ),
          )
          .catch(() => undefined);
    },
    [socketRef],
  );

  const watch = useCallback(
    (ids: string[]) => {
      const counts = watchCounts.current;
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      const schedule = () => {
        clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => sendWatch(), 80);
      };
      schedule();
      return () => {
        for (const id of ids) {
          const n = (counts.get(id) ?? 1) - 1;
          if (n <= 0) counts.delete(id);
          else counts.set(id, n);
        }
        schedule();
      };
    },
    [sendWatch],
  );

  // Live updates. Registered once per connection; on every (re)connect the
  // server gets a fresh heartbeat and watch list, and the watch reply
  // replaces whatever was missed while disconnected.
  useEffect(() => {
    const socket = socketRef.current;
    if (!connected || !socket || !userId) return;
    const onUpdate = (v: PresenceView) => {
      presenceStore.merge(v);
      if (v.userId !== userId) return;
      const cur = meRef.current;
      // Changed on another device: fetch the full own view (previous, zone).
      if (!cur || v.revision > cur.revision) setReload((n) => n + 1);
      else
        setMe((c) =>
          c && v.revision === c.revision && v.at > c.at ? { ...c, ...v } : c,
        );
    };
    socket.on("presence:update", onUpdate);
    socket.emit("presence:heartbeat", { state: activity.current });
    sendWatch(true);
    return () => {
      socket.off("presence:update", onUpdate);
    };
  }, [connected, socketRef, userId, sendWatch]);

  // Activity → heartbeats. Idle after `idleAfterSeconds` without input.
  useEffect(() => {
    if (!userId) return;
    let last = Date.now();
    const idleMs = config.idleAfterSeconds * 1000;
    const send = (state: "active" | "idle") => {
      activity.current = state;
      const socket = socketRef.current;
      // Not buffered while offline: a reconnect sends the current state.
      if (socket?.connected) socket.emit("presence:heartbeat", { state });
    };
    const onInput = () => {
      last = Date.now();
      if (activity.current === "idle") send("active");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onInput();
    };
    const opts = { passive: true, capture: true } as const;
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, opts);
    document.addEventListener("visibilitychange", onVisibility);
    const idleCheck = setInterval(() => {
      if (activity.current === "active" && Date.now() - last >= idleMs)
        send("idle");
    }, 15_000);
    const beat = setInterval(
      () => send(activity.current),
      config.heartbeatSeconds * 1000,
    );
    return () => {
      for (const e of INPUT_EVENTS)
        window.removeEventListener(e, onInput, opts);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(idleCheck);
      clearInterval(beat);
    };
  }, [userId, config.idleAfterSeconds, config.heartbeatSeconds, socketRef]);

  useEffect(() => () => clearTimeout(flushTimer.current), []);

  const write = useCallback(
    async (
      request: () => Promise<unknown>,
      guess?: (cur: OwnPresence) => OwnPresence,
    ) => {
      const before = meRef.current;
      if (before && guess) setMe(guess(before));
      setSaving(true);
      try {
        const next = ownOf(await request());
        setMe(next);
        presenceStore.merge(next);
        return true;
      } catch (err) {
        setMe(before); // roll back the optimistic change
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [setAlert],
  );

  const value = useMemo<PresenceContextValue>(
    () => ({
      me,
      saving,
      watch,
      choose: (c) =>
        write(
          () =>
            apiClient.put(PRESENCE_API.me, {
              availability: c.availability,
              message: c.message,
              duration: c.duration,
              timeZone: browserTimeZone(),
            }),
          (cur) => optimistic(cur, c),
        ),
      restore: () => write(() => apiClient.post(PRESENCE_API.restore)),
      clearMessage: () =>
        write(
          () => apiClient.delete(PRESENCE_API.message),
          (cur) => ({ ...cur, message: null }),
        ),
    }),
    [me, saving, watch, write],
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

/**
 * Live presence for one person: the person's own (from the provider, which
 * includes optimistic changes) or a colleague's (from the shared store).
 */
export function usePresenceOf(
  userId: string | null | undefined,
): PresenceView | null {
  const ctx = useContext(PresenceContext);
  const fromStore = useSyncExternalStore(presenceStore.subscribe, () =>
    userId ? presenceStore.get(userId) : undefined,
  );
  if (userId && ctx?.me && ctx.me.userId === userId) return ctx.me;
  return fromStore ?? null;
}

/** Keep a set of people live while the calling component is mounted. */
export function useWatchPresence(ids: (string | null | undefined)[]) {
  const ctx = useContext(PresenceContext);
  const key = [...new Set(ids.filter(Boolean) as string[])].sort().join(",");
  const watch = ctx?.watch;
  useEffect(() => {
    if (!watch || !key) return;
    return watch(key.split(","));
  }, [watch, key]);
}
