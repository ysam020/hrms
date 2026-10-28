import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiClient, errorMessage, isCanceled, unwrap } from "@next/lib/api";
import { sendOrQueue } from "@next/offline";
import { getStore } from "@next/offline/store";
import { getConnectivity, getScope, subscribe } from "@next/offline/state";

// Data layer for Today. The server decides everything that matters for
// access (GET /dashboard: which widgets this person may use, their defaults,
// their saved layout); this module only fetches, caches and saves.
//
// Caching: the last good config and widget data are kept in the offline store
// under one key, tagged with the signed-in scope (tenant:user), so a reload
// without a connection still shows the dashboard — marked as saved data — and
// another account on the device never sees it. Sign-out deletes it
// (offline/session.ts forgetSession).

export const DASHBOARD_ENDPOINTS = {
  CONFIG: "/dashboard",
  DATA: (ids: string[]) =>
    `/dashboard/data?ids=${encodeURIComponent(ids.join(","))}`,
  PREFERENCES: "/dashboard/preferences",
} as const;

export const CACHE_KEY = "dashboard-cache";

export type WidgetSize = "standard" | "wide";

export interface LayoutEntry {
  id: string;
  visible: boolean;
  size: WidgetSize;
  settings: Record<string, string | number>;
}

export interface SettingOption {
  value: string | number;
  label: string;
}

export interface AvailableWidget {
  id: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  source: "server" | "client";
  settings: Record<
    string,
    { default: string | number; options: SettingOption[] }
  >;
}

export interface DashboardConfig {
  version: number;
  capabilities: string[];
  personas: string[];
  widgets: AvailableWidget[];
  defaults: LayoutEntry[];
  layout: LayoutEntry[];
  customized: boolean;
}

export type WidgetResult =
  | { ok: true; data: any; settings: Record<string, string | number> }
  | { ok: false; error: "forbidden" | "failed" | "unknown" };

interface Cache {
  scope: string;
  config?: DashboardConfig;
  data?: Record<string, WidgetResult>;
  dataAt?: string;
}

async function readCache(): Promise<Cache | undefined> {
  const scope = getScope();
  if (!scope) return undefined;
  try {
    const c = await (await getStore()).getMeta<Cache>(CACHE_KEY);
    return c?.scope === scope ? c : undefined;
  } catch {
    return undefined;
  }
}

async function writeCache(patch: Partial<Cache>) {
  const scope = getScope();
  if (!scope) return;
  try {
    const store = await getStore();
    const prev = await store.getMeta<Cache>(CACHE_KEY);
    const base = prev?.scope === scope ? prev : { scope };
    await store.setMeta(CACHE_KEY, { ...base, ...patch, scope });
  } catch {
    // The cache is a convenience; the dashboard works without it.
  }
}

const useConnectivity = () =>
  useSyncExternalStore(subscribe, getConnectivity, getConnectivity);

// ── Config and layout ───────────────────────────────────────────────────────

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "queued" | "error">(
    "idle",
  );
  /** Bumped when the server confirms a layout, so widget data refetches with the saved settings. */
  const [savedVersion, setSavedVersion] = useState(0);
  const connectivity = useConnectivity();
  const pending = useRef<LayoutEntry[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.get(DASHBOARD_ENDPOINTS.CONFIG);
      const next = unwrap<DashboardConfig>(res);
      setConfig(next);
      setStale(false);
      void writeCache({ config: next });
    } catch (err) {
      if (isCanceled(err)) return;
      const cached = await readCache();
      if (cached?.config) {
        setConfig(cached.config);
        setStale(true);
      } else setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back online: refresh, so access changes made meanwhile apply.
  useEffect(() => {
    if (connectivity === "online" && stale) void load();
  }, [connectivity, stale, load]);

  const flush = useCallback(async () => {
    const widgets = pending.current;
    if (!widgets) return;
    pending.current = null;
    setSaving("saving");
    try {
      const result = await sendOrQueue({
        kind: "dashboard.layout",
        label: "Dashboard layout",
        method: "PUT",
        url: DASHBOARD_ENDPOINTS.PREFERENCES,
        body: { version: 1, widgets },
      });
      if (result.queued) {
        setSaving("queued");
        return;
      }
      // The server's sanitized copy is the truth (it may drop a widget the
      // person lost access to in the meantime).
      const saved = result.data?.data?.layout as LayoutEntry[] | undefined;
      if (saved)
        setConfig((c) => {
          if (!c) return c;
          const next = { ...c, layout: saved, customized: true };
          void writeCache({ config: next });
          return next;
        });
      setSavedVersion((v) => v + 1);
      setSaving("idle");
    } catch {
      setSaving("error");
    }
  }, []);

  /** Apply a layout change now and save it shortly after (edits are batched). */
  const update = useCallback(
    (layout: LayoutEntry[]) => {
      setConfig((c) => (c ? { ...c, layout, customized: true } : c));
      pending.current = layout;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  const reset = useCallback(async () => {
    clearTimeout(timer.current);
    pending.current = null;
    const res = await apiClient.delete(DASHBOARD_ENDPOINTS.PREFERENCES);
    const layout = res.data?.data?.layout as LayoutEntry[];
    setConfig((c) => {
      if (!c) return c;
      const next = { ...c, layout, customized: false };
      void writeCache({ config: next });
      return next;
    });
    setSavedVersion((v) => v + 1);
    setSaving("idle");
  }, []);

  return {
    config,
    error,
    stale,
    saving,
    savedVersion,
    reload: load,
    update,
    reset,
    flush,
  };
}

// ── Widget data ─────────────────────────────────────────────────────────────

const MINUTE = 60_000;

/**
 * Fetches server widgets in two groups so each refreshes at its own pace:
 * live (who's in today) every 2 minutes, everything else every 15. Both
 * refresh when the tab regains focus (at most once a minute) and pause while
 * the tab is hidden. Each group is one request (GET /dashboard/data?ids=…).
 */
export function useWidgetData(
  live: string[],
  slow: string[],
  layoutKey: string,
) {
  const [results, setResults] = useState<Record<string, WidgetResult>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const lastFetch = useRef<Record<string, number>>({});
  const connectivity = useConnectivity();

  const fetchGroup = useCallback(async (ids: string[], background: boolean) => {
    if (ids.length === 0) return;
    const key = ids.join(",");
    lastFetch.current[key] = Date.now();
    const mark = (set: typeof setLoading, on: boolean) =>
      set((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
        return next;
      });
    mark(background ? setRefreshing : setLoading, true);
    try {
      const res = await apiClient.get(DASHBOARD_ENDPOINTS.DATA(ids));
      const body = unwrap<{
        widgets: Record<string, WidgetResult>;
        generatedAt: string;
      }>(res);
      setResults((prev) => {
        const next = { ...prev, ...body.widgets };
        void writeCache({ data: next, dataAt: body.generatedAt });
        return next;
      });
      setFailed((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setStaleAt(null);
    } catch (err) {
      if (isCanceled(err)) return;
      const cached = await readCache();
      const fromCache = ids.filter((id) => cached?.data?.[id]);
      if (fromCache.length) {
        setResults((prev) => {
          const next = { ...prev };
          for (const id of fromCache)
            if (!next[id]) next[id] = cached!.data![id];
          return next;
        });
        setStaleAt(cached!.dataAt ?? null);
      }
      setFailed((prev) => new Set([...prev, ...ids]));
    } finally {
      mark(background ? setRefreshing : setLoading, false);
    }
  }, []);

  const liveKey = live.join(",");
  const slowKey = slow.join(",");

  // Initial load, and whenever the visible set or a setting changes.
  useEffect(() => {
    void fetchGroup(live, false);
    void fetchGroup(slow, false);
  }, [liveKey, slowKey, layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = (ids: string[], every: number) => {
      if (document.visibilityState !== "visible") return;
      const at = lastFetch.current[ids.join(",")] ?? 0;
      if (Date.now() - at >= every) void fetchGroup(ids, true);
    };
    const t = setInterval(() => {
      tick(live, 2 * MINUTE);
      tick(slow, 15 * MINUTE);
    }, 30_000);
    const onFocus = () => {
      tick(live, MINUTE);
      tick(slow, MINUTE);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [liveKey, slowKey, fetchGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back online after showing saved data: refresh everything.
  useEffect(() => {
    if (connectivity === "online" && staleAt) {
      void fetchGroup(live, true);
      void fetchGroup(slow, true);
    }
  }, [connectivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(
    (id: string) => {
      const group = live.includes(id) ? live : slow;
      void fetchGroup(group, false);
    },
    [liveKey, slowKey, fetchGroup], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return useMemo(
    () => ({ results, loading, refreshing, failed, staleAt, retry }),
    [results, loading, refreshing, failed, staleAt, retry],
  );
}
