import { useEffect, useState, useContext, useRef, useCallback } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { getAnalyticsCache, setAnalyticsCache } from "@web/core/db";

const ANALYTICS_URI_PATTERN = /^\/?(get-)/;

type FetchError = {
  message: string;
  status?: number;
  raw?: any;
};

type UseFetchDataReturn<T> = {
  data: T;
  loading: boolean;
  error: FetchError | null;
  refetch: () => void;
};

function useFetchData<T = any>(
  uri: string | null,
  method: "get" | "post" | "put" | "delete",
  deps: any[] = [],
  successMessage?: string | null,
  errMessage?: string | null,
  cacheOptions?: { ttl?: number },
): UseFetchDataReturn<T> {
  const [data, setData] = useState<T>([] as T);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FetchError | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const { setAlert } = useContext(AlertContext);

  // request identity to avoid stale updates
  const requestIdRef = useRef(0);

  const effectiveTtl =
    cacheOptions?.ttl !== undefined
      ? cacheOptions.ttl
      : method === "get" && ANALYTICS_URI_PATTERN.test(uri || "")
        ? 5 * 60 * 1000
        : null;

  const shouldCache = Boolean(effectiveTtl) && method === "get";

  const fetchData = useCallback(() => {
    if (!uri) {
      setData([] as T);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const currentRequestId = ++requestIdRef.current;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ stale-while-revalidate
        if (shouldCache) {
          const cached = await getAnalyticsCache(uri);
          if (cached && currentRequestId === requestIdRef.current) {
            setData(cached);
            setLoading(false);
          }
        }

        const res = await apiClient[method](uri, { signal });

        // ✅ ignore stale responses
        if (currentRequestId !== requestIdRef.current) return;

        const responseData = res.data?.data ?? res.data;

        setData(responseData);

        if (shouldCache) {
          setAnalyticsCache(uri, responseData, effectiveTtl!).catch(
            console.error,
          );
        }

        setLoading(false);

        if (successMessage) {
          setAlert({
            open: true,
            message: successMessage,
            severity: "success",
          });
        }
      } catch (err: any) {
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
          return; // request aborted
        }

        if (currentRequestId !== requestIdRef.current) return;

        const normalizedError: FetchError = {
          message:
            err?.response?.data?.message ||
            err.message ||
            "Something went wrong",
          status: err?.response?.status,
          raw: err,
        };

        setError(normalizedError);
        setLoading(false);

        if (errMessage) {
          setAlert({
            open: true,
            message: normalizedError.message,
            severity: "error",
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    uri,
    method,
    shouldCache,
    effectiveTtl,
    successMessage,
    errMessage,
    setAlert,
  ]);

  useEffect(() => {
    const cleanup = fetchData();
    return () => {
      if (cleanup) cleanup();
    };
  }, [...deps, refetchCount, fetchData]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { data, loading, error, refetch };
}

export default useFetchData;
