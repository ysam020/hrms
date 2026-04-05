import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

declare module "axios" {
  interface InternalAxiosRequestConfig {
    isProto?: boolean;
    _authRetried?: boolean;
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
};

const clearAccessToken = () => {
  _accessToken = null;
  localStorage.removeItem(TOKEN_KEY);
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

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

// Shared refresh promise — deduplicated so concurrent requests don't
// trigger multiple simultaneous refresh calls.
let _refreshPromise: Promise<string> | null = null;

export const performRefresh = () => {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = axios
    .post(`${API_URL}/refresh-token`, {}, { withCredentials: true })
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

// Request interceptor — attaches the token and proactively refreshes if
// it's about to expire.
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
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

    return config;
  },
);

// Response interceptor — on 401, attempt one token refresh then retry.
// If the refresh also fails, force logout.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig;

    if (error.response?.status === 401) {
      if (!originalRequest._authRetried) {
        originalRequest._authRetried = true;

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
