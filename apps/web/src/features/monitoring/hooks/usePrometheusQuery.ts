import { useState, useEffect, useRef, useCallback } from "react";

export type PrometheusRange = "15m" | "1h" | "6h" | "24h";

export interface Series {
  name: string;
  data: { x: number; y: number }[];
}

const RANGE_SECONDS: Record<PrometheusRange, number> = {
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
};

const STEP: Record<PrometheusRange, string> = {
  "15m": "30s",
  "1h": "60s",
  "6h": "300s",
  "24h": "900s",
};

function toSeriesName(metric: Record<string, string>): string {
  return (
    metric.service ||
    metric.instance ||
    metric.job ||
    Object.entries(metric)
      .filter(([k]) => k !== "__name__")
      .map(([k, v]) => `${k}="${v}"`)
      .join(", ") ||
    "value"
  );
}

function transformResult(result: any[]): Series[] {
  return result.map((r) => ({
    name: toSeriesName(r.metric),
    data: r.values.map(([ts, val]: [number, string]) => ({
      x: ts * 1000,
      y: parseFloat(val),
    })),
  }));
}

export function usePrometheusQuery(
  query: string,
  range: PrometheusRange = "1h",
  refreshMs = 30_000,
) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(
    async (isInitial: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (isInitial) setLoading(true);
      const now = Math.floor(Date.now() / 1000);
      const start = now - RANGE_SECONDS[range];
      const step = STEP[range];
      const url = `/prometheus/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=${step}`;

      try {
        const res = await window.fetch(url, { signal: ctrl.signal });
        const json = await res.json();
        if (json.status === "success") {
          setSeries(transformResult(json.data.result));
          setError(null);
        } else {
          setError(json.error || "Prometheus query failed");
        }
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [query, range],
  );

  useEffect(() => {
    fetch(true);
    const timer = setInterval(() => fetch(false), refreshMs);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetch, refreshMs]);

  return { series, loading, error };
}

export function usePrometheusInstant(query: string, refreshMs = 30_000) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const url = `/prometheus/api/v1/query?query=${encodeURIComponent(query)}`;
    try {
      const res = await window.fetch(url, { signal: ctrl.signal });
      const json = await res.json();
      if (json.status === "success" && json.data.result.length > 0) {
        setValue(parseFloat(json.data.result[0].value[1]));
      } else {
        setValue(null);
      }
    } catch {
      // ignore aborts
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetch();
    const timer = setInterval(fetch, refreshMs);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetch, refreshMs]);

  return { value, loading };
}
