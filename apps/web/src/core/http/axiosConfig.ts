import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

declare module "axios" {
  interface InternalAxiosRequestConfig {
    isProto?: boolean;
    _authRetried?: boolean;
    _csrfRetried?: boolean;
    _requestId?: string;
  }
}

let _onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (fn: () => void) => {
  _onUnauthorized = fn;
};

const TOKEN_KEY = "hrms_access_token";

// Access token stored in memory for fast access + localStorage for persistence
// across hard refreshes and new tabs.
let _accessToken: string | null = localStorage.getItem(TOKEN_KEY);

export const getAccessToken = () => _accessToken;

export const setAccessToken = (token: string) => {
  _accessToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem("hrms_explicit_logout");
};

const clearAccessToken = () => {
  _accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
  invalidateCsrfToken();
};

// Decode JWT expiry
const getTokenExpiry = (token: string) => {
  try {
    return JSON.parse(atob(token.split(".")[1])).exp || 0;
  } catch {
    return 0;
  }
};

const isExpiringSoon = (token: string, bufferSec = 60) => {
  const exp = getTokenExpiry(token);
  if (!exp) return true;
  return exp - Date.now() / 1000 < bufferSec;
};

const API_URL = import.meta.env.VITE_API_STRING;

// CSRF token — fetched lazily on the first mutating request and cached.
// Must be invalidated after logout (session identifier changes).
let _csrfToken: string | null = null;
// Deduplication: concurrent callers share a single in-flight fetch so the
// server only ever sets one csrf-token cookie per logical fetch, avoiding a
// race where two different cookie values are set and one request ends up
// holding a token that doesn't match the cookie the browser kept.
let _csrfPromise: Promise<string> | null = null;

const fetchCsrfToken = async (): Promise<string> => {
  if (_csrfToken) return _csrfToken;
  if (_csrfPromise) return _csrfPromise;

  // Mirror the Authorization header so the server's getSessionIdentifier
  // produces the same session key here as on subsequent mutating requests.
  const token = getAccessToken();
  _csrfPromise = axios
    .get<{ csrfToken: string }>(`${API_URL}/csrf-token`, {
      withCredentials: true,
      ...(token && { headers: { Authorization: `Bearer ${token}` } }),
    })
    .then((res) => {
      _csrfToken = res.data.csrfToken;
      return _csrfToken;
    })
    .finally(() => {
      _csrfPromise = null;
    });

  return _csrfPromise;
};

export const invalidateCsrfToken = () => {
  _csrfToken = null;
  _csrfPromise = null;
};

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

// ─── AbortController registry ─────────────────────────────────────────────────
// Every in-flight request is tracked here.  GET requests are keyed by their
// canonical URL+params so a new call to the same endpoint automatically
// supersedes the previous one.  All other requests are keyed by a UUID.
// cancelAllPendingRequests() is meant to be called on logout.
const pendingRequests = new Map<string, AbortController>();

const buildRequestKey = (config: InternalAxiosRequestConfig): string => {
  const params = config.params ? JSON.stringify(config.params) : "";
  return `${config.method?.toUpperCase()}:${config.url}:${params}`;
};

export const cancelAllPendingRequests = (reason = "cancelled") => {
  pendingRequests.forEach((ctrl) => ctrl.abort(reason));
  pendingRequests.clear();
};

// ─── Token refresh ────────────────────────────────────────────────────────────
// Shared refresh promise — deduplicated so concurrent requests don't
// trigger multiple simultaneous refresh calls.
let _refreshPromise: Promise<string> | null = null;

export const performRefresh = () => {
  if (_refreshPromise) return _refreshPromise;

  // Capture the current (possibly expiring) token before fetchCsrfToken runs,
  // so the POST carries the same Authorization value that was used to generate
  // the CSRF token (getSessionIdentifier uses jwt.decode, not jwt.verify, so
  // an expired token still yields the correct userId as the session key).
  const currentToken = getAccessToken();

  _refreshPromise = fetchCsrfToken()
    .then((csrfToken) =>
      axios.post(
        `${API_URL}/refresh-token`,
        {},
        {
          withCredentials: true,
          headers: {
            "x-csrf-token": csrfToken,
            ...(currentToken && { Authorization: `Bearer ${currentToken}` }),
          },
        },
      ),
    )
    .then((res) => {
      if (res.data?.success) {
        const newToken = res.data.data.accessToken;
        setAccessToken(newToken);
        return newToken;
      }
      throw new Error("Refresh failed");
    })
    .finally(() => {
      _refreshPromise = null;
    });

  return _refreshPromise;
};

const forceLogout = () => {
  clearAccessToken();
  _onUnauthorized?.();
};

// Proactively refresh when the tab becomes visible and the token is close
// to expiry, so the user never hits a 401 mid-session.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const token = getAccessToken();
  if (token && isExpiringSoon(token, 5 * 60)) {
    performRefresh().catch(forceLogout);
  }
});

// ─── Request interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // ── Token refresh ──────────────────────────────────────────────
    let token = getAccessToken();

    if (token && isExpiringSoon(token, 60)) {
      try {
        token = await performRefresh();
      } catch {}
    }

    config.headers = config.headers || {};

    if (config.isProto) {
      config.headers["Content-Type"] = "application/x-protobuf";
      config.headers["Accept"] = "application/x-protobuf, application/json";
      config.headers["X-Response-Format"] = "protobuf";
      config.responseType = "arraybuffer";
    } else if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
      config.headers["Accept"] = "application/json";
    } else {
      config.headers["Content-Type"] = "application/json";
      config.headers["Accept"] = "application/json";
    }

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    if (MUTATING_METHODS.has(config.method?.toLowerCase() ?? "")) {
      config.headers["x-csrf-token"] = await fetchCsrfToken();
    }

    // ── AbortController ────────────────────────────────────────────
    const method = config.method?.toLowerCase() ?? "";
    const isRetry = config._authRetried || config._csrfRetried;

    const controller = new AbortController();

    // If the caller supplied a signal (e.g. from a component's useEffect
    // cleanup), link it so either side can abort the request.
    if (config.signal instanceof AbortSignal) {
      const callerSignal = config.signal;
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener(
          "abort",
          () => controller.abort(callerSignal.reason),
          { once: true },
        );
      }
    }
    config.signal = controller.signal;

    // GET deduplication: cancel the previous in-flight call to the same
    // endpoint so the UI always reflects the latest data.  Retried requests
    // are exempt — they must not cancel the fresh call that triggered them.
    const requestId =
      method === "get" && !isRetry
        ? buildRequestKey(config)
        : crypto.randomUUID();

    if (method === "get" && !isRetry) {
      pendingRequests.get(requestId)?.abort("superseded");
    }

    pendingRequests.set(requestId, controller);
    config._requestId = requestId;

    // ── Idempotency key ────────────────────────────────────────────
    // Assign a stable UUID to POST / PUT / PATCH so the server can detect
    // duplicate submissions caused by network retries.  The key is preserved
    // on _authRetried / _csrfRetried retries so all attempts carry the same key.
    if (
      ["post", "put", "patch"].includes(method) &&
      !config.headers["Idempotency-Key"]
    ) {
      config.headers["Idempotency-Key"] = crypto.randomUUID();
    }

    return config;
  },
);

// ─── Response interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    if (response.config._requestId) {
      pendingRequests.delete(response.config._requestId);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig;

    // Always clean up the registry for the failed request.
    if (originalRequest?._requestId) {
      pendingRequests.delete(originalRequest._requestId);
    }

    if (error.response?.status === 403 && !originalRequest._csrfRetried) {
      originalRequest._csrfRetried = true;
      // Clear the old signal so the interceptor assigns a fresh AbortController
      // — the original signal may already be in an aborted state.
      originalRequest.signal = undefined;
      invalidateCsrfToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers["x-csrf-token"] = await fetchCsrfToken();
      return apiClient(originalRequest);
    }

    if (error.response?.status === 401) {
      if (!originalRequest._authRetried) {
        originalRequest._authRetried = true;
        originalRequest.signal = undefined;

        try {
          const newToken = await performRefresh();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch {}
      }

      forceLogout();
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
