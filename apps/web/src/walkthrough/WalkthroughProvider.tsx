import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { useShell } from "@next/shell/context";
import * as engine from "./engine";
import {
  createProgressStore,
  writeRunningMarker,
  type ProgressStore,
} from "./persistence";
import type { TourEnv, WalkthroughState } from "./types";

// One provider for the signed-in shell. It owns the walkthrough state (the
// single source of truth for status and position), loads and saves it for
// the signed-in tenant + user, and mounts the runner — Joyride, the step
// registry and the route orchestration, loaded lazily — only while a tour
// is running. With no tour running the app pays for a context and nothing
// else: no observers, no listeners, no Joyride.

const Runner = lazy(() => import("./Runner"));

export interface WalkthroughApi {
  /** Saved progress has loaded for this person. */
  ready: boolean;
  state: WalkthroughState;
  /** Start a tour, or resume it where it was left. `restart` starts over. */
  start: (tour: string, opts?: { restart?: boolean }) => Promise<void>;
  pause: () => void;
  /** Skip a whole tour (not completed; never starts by itself). */
  dismiss: (tour: string) => void;
  /** Apply an engine transition (the runner's way in); returns the result. */
  update: (fn: (s: WalkthroughState) => WalkthroughState) => WalkthroughState;
}

const Ctx = createContext<WalkthroughApi | null>(null);

/** The walkthrough API, or null outside the signed-in shell. */
export const useWalkthrough = () => useContext(Ctx);

/** Saved-progress scope: tenant + user, so accounts never share it. */
export function scopeOf(user: any): string | null {
  if (!user?.id) return null;
  return `${user.tenantId ?? user.tenantSlug ?? "none"}:${user.id}`;
}

export function WalkthroughProvider({
  children,
  storeFor = (scope: string) => createProgressStore(scope),
}: {
  children: ReactNode;
  /** Tests swap the store. */
  storeFor?: (scope: string) => ProgressStore;
}) {
  const { user } = useContext(UserContext);
  const { docked } = useShell();
  const scope = scopeOf(user);
  const [state, setState] = useState<WalkthroughState>(engine.emptyState);
  const [ready, setReady] = useState(false);
  const store = useRef<ProgressStore | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load for this person; switching account or organisation reloads. The old
  // store is disposed without a last send: by now the API client may hold
  // the next session's token. (Its local copy is newer and goes up on that
  // person's next load.)
  useEffect(() => {
    setReady(false);
    setState(engine.emptyState());
    if (!scope) return;
    const s = storeFor(scope);
    store.current = s;
    let cancelled = false;
    s.load().then((saved) => {
      if (cancelled) return;
      setState(saved ?? engine.emptyState());
      setReady(true);
    });
    return () => {
      cancelled = true;
      s.dispose();
      if (store.current === s) store.current = null;
    };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (fn: (s: WalkthroughState) => WalkthroughState) => {
      const prev = stateRef.current;
      const next = fn(prev);
      if (next === prev) return prev;
      stateRef.current = next;
      setState(next);
      store.current?.save(next);
      return next;
    },
    [],
  );

  const running =
    engine.progressOf(state, state.active ?? "").status === "running"
      ? state.active
      : null;

  // A refresh of this tab carries on with a running tour; a new session
  // (another tab, a later sign-in) finds it paused instead.
  useEffect(() => {
    if (scope && ready) writeRunningMarker(scope, running);
  }, [scope, ready, running]);

  // Pausing or finishing is worth saving right away, as is leaving the page.
  useEffect(() => {
    if (ready && !running) void store.current?.flush();
  }, [ready, running]);
  useEffect(() => {
    if (!ready) return;
    const onHide = () => void store.current?.flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [ready]);

  const userRef = useRef(user);
  userRef.current = user;
  const dockedRef = useRef(docked);
  dockedRef.current = docked;

  const start = useCallback<WalkthroughApi["start"]>(
    async (tour, opts) => {
      const { MODULES, canReach } = await import("./registry");
      const env: TourEnv = { user: userRef.current, docked: dockedRef.current };
      const steps = engine.buildSteps(tour, MODULES, env, canReach);
      update((s) =>
        opts?.restart
          ? engine.restart(s, tour, steps)
          : engine.start(s, tour, steps),
      );
    },
    [update],
  );

  const api = useMemo<WalkthroughApi>(
    () => ({
      ready,
      state,
      start,
      update,
      pause: () => void update((s) => engine.pause(s)),
      dismiss: (tour) => void update((s) => engine.dismiss(s, tour)),
    }),
    [ready, state, start, update],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {ready && running && (
        <Suspense fallback={null}>
          <Runner key={running} tour={running} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
