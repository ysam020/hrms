import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiClient, errorMessage, isCanceled, unwrap } from "./api";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Size classes, decided by available width (not device). */
export const useIsCompact = () => useMediaQuery("(max-width: 639px)");
export const useIsRegular = () => useMediaQuery("(min-width: 1024px)");
export const useIsWide = () => useMediaQuery("(min-width: 1280px)");

/**
 * GET with abort-on-change/unmount and stale-response protection.
 * (Classic's useFetchData also works here; this variant returns the raw
 * unwrapped payload and never toasts, which suits read-only panels.)
 */
export function useGet<T = any>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const id = ++req.current;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    apiClient
      .get(url, { signal: ctrl.signal })
      .then((res) => {
        if (id === req.current) setData(unwrap<T>(res));
      })
      .catch((err) => {
        if (!isCanceled(err) && id === req.current) setError(errorMessage(err));
      })
      .finally(() => {
        if (id === req.current) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refetch, setData };
}
