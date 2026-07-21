import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { API_URL } from "../config";
import {
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "../auth/secureStorage";

declare module "axios" {
  interface InternalAxiosRequestConfig {
    _authRetried?: boolean;
    _csrfRetried?: boolean;
  }
}

// Mirrors apps/web/src/core/http/axiosConfig.ts: access token in memory only,
// refreshed via /refresh-token. The web app relies on an httpOnly cookie for
// the refresh token; mobile has no cookie jar shared with the OAuth browser
// session, so it carries the refresh token explicitly (SecureStore) and
// sends it in the request body instead — see the refreshToken handler in
// apps/api-gateway/src/handlers/auth.ts, which accepts either.
let _accessToken: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export const getAccessToken = () => _accessToken;
export const setAccessToken = (token: string | null) => {
  _accessToken = token;
};
export const setUnauthorizedHandler = (fn: () => void) => {
  _onUnauthorized = fn;
};

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

let _csrfToken: string | null = null;
let _csrfPromise: Promise<string> | null = null;

const fetchCsrfToken = async (): Promise<string> => {
  if (_csrfToken) return _csrfToken;
  if (_csrfPromise) return _csrfPromise;

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

const invalidateCsrfToken = () => {
  _csrfToken = null;
  _csrfPromise = null;
};

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

let _refreshPromise: Promise<string> | null = null;

const performRefresh = (): Promise<string> => {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) throw new Error("No refresh token stored");

    const csrfToken = await fetchCsrfToken();
    const res = await axios.post(
      `${API_URL}/refresh-token`,
      { refreshToken },
      { withCredentials: true, headers: { "x-csrf-token": csrfToken } },
    );

    if (!res.data?.success) {
      throw new Error(res.data?.message || "Refresh failed");
    }

    const { accessToken, refreshToken: rotatedRefreshToken } = res.data.data;
    setAccessToken(accessToken);
    if (rotatedRefreshToken) {
      await setStoredRefreshToken(rotatedRefreshToken);
    }
    return accessToken as string;
  })().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
};

const forceLogout = () => {
  setAccessToken(null);
  invalidateCsrfToken();
  _onUnauthorized?.();
};

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000,
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let token = getAccessToken();

    if (token && isExpiringSoon(token, 60)) {
      try {
        token = await performRefresh();
      } catch {}
    }

    config.headers = config.headers || {};
    config.headers["Content-Type"] = "application/json";
    config.headers["Accept"] = "application/json";

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    if (MUTATING_METHODS.has(config.method?.toLowerCase() ?? "")) {
      config.headers["x-csrf-token"] = await fetchCsrfToken();
    }

    return config;
  },
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig;

    if (error.response?.status === 403 && !originalRequest._csrfRetried) {
      originalRequest._csrfRetried = true;
      invalidateCsrfToken();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers["x-csrf-token"] = await fetchCsrfToken();
      return apiClient(originalRequest);
    }

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

export { performRefresh };
export default apiClient;
