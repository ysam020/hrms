import apiClient from "@web/core/http/axiosConfig";

// Thin helpers over Classic's shared axios client. All auth, refresh, CSRF,
// idempotency, and request de-duplication stay in @web/core/http/axiosConfig.

export { apiClient };

/** Unwrap the gateway's `{ success, data }` envelope. */
export const unwrap = <T = any>(res: { data?: any }): T =>
  (res?.data?.data ?? res?.data) as T;

export const errorMessage = (
  err: any,
  fallback = "Something went wrong. Try again.",
) => {
  // No response at all: say so plainly instead of axios's "Network Error".
  if (err && !err.response && !isCanceled(err) && err.isAxiosError)
    return typeof navigator !== "undefined" && !navigator.onLine
      ? "You’re offline. This needs a connection."
      : "Praesto can’t be reached right now. Try again in a moment.";
  return err?.response?.data?.message || err?.message || fallback;
};

export function isCanceled(err: any) {
  return err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
}

/** Pull a list out of the many list response shapes the gateway returns. */
export function asList<T = any>(data: any, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data;
  for (const k of [...keys, "items", "data", "results", "rows", "list"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

export const totalOf = (data: any, fallback = 0): number =>
  Number(
    data?.totalCount ??
      data?.total ??
      data?.total_count ??
      data?.pagination?.total ??
      data?.pagination?.totalCount ??
      fallback,
  ) || fallback;
