const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  return {
    instance,
    axiosCreate: vi.fn(() => instance),
    axiosGet: vi.fn(),
    axiosPost: vi.fn(),
  };
});

vi.mock("axios", () => ({
  default: {
    create: mocks.axiosCreate,
    get: mocks.axiosGet,
    post: mocks.axiosPost,
  },
}));

import apiClient, {
  setAccessToken,
  getAccessToken,
  isExpiringSoon,
  fetchCsrfToken,
  invalidateCsrfToken,
  performRefresh,
  setUnauthorizedHandler,
  setPaymentRequiredHandler,
  cancelAllPendingRequests,
} from "@web/core/http/axiosConfig";

function makeJwt(expiresInSec: number) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expiresInSec };
  const b64 = btoa(JSON.stringify(payload));
  return `header.${b64}.sig`;
}

const requestInterceptor =
  mocks.instance.interceptors.request.use.mock.calls[0][0];
const responseSuccessInterceptor =
  mocks.instance.interceptors.response.use.mock.calls[0][0];
const responseErrorInterceptor =
  mocks.instance.interceptors.response.use.mock.calls[0][1];
// axios.create() only ever runs once, at module import time, before any
// test's beforeEach (and its vi.clearAllMocks()) has a chance to run —
// capture the call now so later tests can still assert on it.
const axiosCreateCallArgs = mocks.axiosCreate.mock.calls[0][0];

describe("token state helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken("");
    invalidateCsrfToken();
  });

  it("stores and retrieves the access token", () => {
    setAccessToken("tok-1");
    expect(getAccessToken()).toBe("tok-1");
  });

  it("isExpiringSoon is true for a token expiring within the buffer window", () => {
    expect(isExpiringSoon(makeJwt(30), 60)).toBe(true);
  });

  it("isExpiringSoon is false for a token expiring well outside the buffer window", () => {
    expect(isExpiringSoon(makeJwt(3600), 60)).toBe(false);
  });

  it("isExpiringSoon is true for an unparseable token (fails safe)", () => {
    expect(isExpiringSoon("not-a-jwt")).toBe(true);
  });

  it("invalidates the cached CSRF token the first time an access token is set (session identity change)", async () => {
    // Needs a truly fresh module instance: _accessToken starts null only at
    // first load, and the exported API has no way to get back to null once
    // any test has called setAccessToken (setAccessToken("") leaves it as
    // "", not null, so "was this the first login" can't be re-triggered
    // through the public surface on the already-loaded module).
    vi.resetModules();
    const fresh = await import("@web/core/http/axiosConfig");
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    await fresh.fetchCsrfToken(); // warms the cache
    fresh.setAccessToken("tok-1"); // first-ever login -> invalidates
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-2" } });
    const token = await fresh.fetchCsrfToken();
    expect(token).toBe("csrf-2");
  });
});

describe("fetchCsrfToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCsrfToken();
  });

  it("fetches and caches the CSRF token", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    const a = await fetchCsrfToken();
    const b = await fetchCsrfToken();
    expect(a).toBe("csrf-1");
    expect(b).toBe("csrf-1");
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent in-flight fetches into a single request", async () => {
    let resolveFn: (v: any) => void;
    mocks.axiosGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const p1 = fetchCsrfToken();
    const p2 = fetchCsrfToken();
    resolveFn!({ data: { csrfToken: "csrf-1" } });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe("csrf-1");
    expect(b).toBe("csrf-1");
    expect(mocks.axiosGet).toHaveBeenCalledTimes(1);
  });
});

describe("performRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken("");
    invalidateCsrfToken();
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
  });

  it("posts to refresh-token with the CSRF header and sets the new access token on success", async () => {
    mocks.axiosPost.mockResolvedValue({
      data: { success: true, data: { accessToken: "new-tok" } },
    });
    const token = await performRefresh();
    expect(token).toBe("new-tok");
    expect(getAccessToken()).toBe("new-tok");
    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expect.stringContaining("/refresh-token"),
      {},
      expect.objectContaining({
        headers: expect.objectContaining({ "x-csrf-token": "csrf-1" }),
      }),
    );
  });

  it("throws when the server reports failure", async () => {
    mocks.axiosPost.mockResolvedValue({
      data: { success: false, message: "Session expired" },
    });
    await expect(performRefresh()).rejects.toThrow("Session expired");
  });

  it("deduplicates concurrent refresh calls into a single in-flight request", async () => {
    let resolveFn: (v: any) => void;
    mocks.axiosPost.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const p1 = performRefresh();
    const p2 = performRefresh();
    resolveFn!({ data: { success: true, data: { accessToken: "new-tok" } } });
    await Promise.all([p1, p2]);
    expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
  });
});

describe("request interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken("");
    invalidateCsrfToken();
    cancelAllPendingRequests();
  });

  it("attaches the Authorization header when an access token is set", async () => {
    setAccessToken(makeJwt(3600));
    const config = await requestInterceptor({ method: "get", headers: {} });
    expect(config.headers["Authorization"]).toBe(`Bearer ${getAccessToken()}`);
  });

  it("sets protobuf-specific headers when isProto is set", async () => {
    const config = await requestInterceptor({
      method: "get",
      headers: {},
      isProto: true,
    });
    expect(config.headers["Content-Type"]).toBe("application/x-protobuf");
    expect(config.responseType).toBe("arraybuffer");
  });

  it("omits Content-Type for FormData payloads (browser sets the multipart boundary)", async () => {
    const config = await requestInterceptor({
      method: "post",
      headers: { "Content-Type": "application/json" },
      data: new FormData(),
    });
    expect(config.headers["Content-Type"]).toBeUndefined();
  });

  it("defaults to application/json for a plain request", async () => {
    const config = await requestInterceptor({ method: "get", headers: {} });
    expect(config.headers["Content-Type"]).toBe("application/json");
  });

  it("attaches a CSRF header for mutating methods but not for GET", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    const postConfig = await requestInterceptor({
      method: "post",
      headers: {},
    });
    expect(postConfig.headers["x-csrf-token"]).toBe("csrf-1");

    const getConfig = await requestInterceptor({ method: "get", headers: {} });
    expect(getConfig.headers["x-csrf-token"]).toBeUndefined();
  });

  it("assigns an Idempotency-Key to POST/PUT/PATCH but not GET/DELETE", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    const post = await requestInterceptor({ method: "post", headers: {} });
    expect(post.headers["Idempotency-Key"]).toEqual(expect.any(String));

    const del = await requestInterceptor({ method: "delete", headers: {} });
    expect(del.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("preserves an existing Idempotency-Key on a retried request instead of assigning a new one", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    const config = await requestInterceptor({
      method: "post",
      headers: { "Idempotency-Key": "existing-key" },
    });
    expect(config.headers["Idempotency-Key"]).toBe("existing-key");
  });

  it("aborts the previous in-flight GET to the same endpoint (dedup by URL+params)", async () => {
    const first = await requestInterceptor({
      method: "get",
      headers: {},
      url: "/leaves",
      params: {},
    });

    // Re-issuing the same GET should abort the first one's signal.
    const second = await requestInterceptor({
      method: "get",
      headers: {},
      url: "/leaves",
      params: {},
    });
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("does not dedup/abort a retried GET against itself", async () => {
    const first = await requestInterceptor({
      method: "get",
      headers: {},
      url: "/leaves",
      params: {},
    });
    const retry = await requestInterceptor({
      method: "get",
      headers: {},
      url: "/leaves",
      params: {},
      _authRetried: true,
    });
    expect(first.signal.aborted).toBe(false);
    expect(retry.signal.aborted).toBe(false);
  });
});

describe("response interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken("");
    invalidateCsrfToken();
    cancelAllPendingRequests();
    setUnauthorizedHandler(() => {});
    setPaymentRequiredHandler(() => {});
  });

  it("passes through a successful response unchanged", () => {
    const response = { config: {}, data: { ok: true } };
    expect(responseSuccessInterceptor(response)).toBe(response);
  });

  it("retries once on a 403 by refreshing the CSRF token", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "fresh-csrf" } });
    mocks.instance.mockResolvedValue({ data: { ok: true } });
    const error = {
      response: { status: 403 },
      config: { headers: {}, _csrfRetried: false },
    };

    await responseErrorInterceptor(error);

    expect(error.config._csrfRetried).toBe(true);
    expect(error.config.headers["x-csrf-token"]).toBe("fresh-csrf");
    expect(mocks.instance).toHaveBeenCalledWith(error.config);
  });

  it("does not retry a second 403 on an already-retried request", async () => {
    const error = {
      response: { status: 403 },
      config: { headers: {}, _csrfRetried: true },
    };
    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(mocks.instance).not.toHaveBeenCalled();
  });

  it("invokes the payment-required handler on 402 and rejects", async () => {
    const onPaymentRequired = vi.fn();
    setPaymentRequiredHandler(onPaymentRequired);
    const error = { response: { status: 402 }, config: {} };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(onPaymentRequired).toHaveBeenCalled();
  });

  it("refreshes the token and retries once on a 401", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    mocks.axiosPost.mockResolvedValue({
      data: { success: true, data: { accessToken: "new-tok" } },
    });
    mocks.instance.mockResolvedValue({ data: { ok: true } });
    const error = {
      response: { status: 401 },
      config: { headers: {}, _authRetried: false },
    };

    await responseErrorInterceptor(error);

    expect(error.config._authRetried).toBe(true);
    expect(error.config.headers["Authorization"]).toBe("Bearer new-tok");
    expect(mocks.instance).toHaveBeenCalledWith(error.config);
  });

  it("forces logout when refresh fails on a 401", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    // The refresh endpoint itself definitively rejecting (401) is what makes
    // this a real logout — see isDefiniteAuthFailure.
    mocks.axiosPost.mockRejectedValue({
      response: { status: 401 },
      message: "refresh failed",
    });
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken(makeJwt(3600));
    const error = {
      response: { status: 401 },
      config: { headers: {}, _authRetried: false },
    };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);

    expect(onUnauthorized).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it("does not force logout when the refresh call fails transiently (no definitive 401)", async () => {
    mocks.axiosGet.mockResolvedValue({ data: { csrfToken: "csrf-1" } });
    // A network blip/timeout on the refresh call itself says nothing about
    // whether the session is still valid — must not be treated as a logout
    // signal, only surfaced as this request's own failure.
    mocks.axiosPost.mockRejectedValue(new Error("network error"));
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAccessToken(makeJwt(3600));
    const error = {
      response: { status: 401 },
      config: { headers: {}, _authRetried: false },
    };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getAccessToken()).not.toBeNull();
  });

  it("forces logout immediately on a second 401 without retrying again", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const error = {
      response: { status: 401 },
      config: { headers: {}, _authRetried: true },
    };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(onUnauthorized).toHaveBeenCalled();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
  });

  it("retries a superseded-cancellation exactly once without treating it as a real error", async () => {
    mocks.instance.mockResolvedValue({ data: { ok: true } });
    const error = {
      code: "ERR_CANCELED",
      config: {
        headers: {},
        signal: { reason: "superseded" },
        _supersededRetried: false,
      },
    };

    await responseErrorInterceptor(error);

    expect(error.config._supersededRetried).toBe(true);
    expect(mocks.instance).toHaveBeenCalledWith(error.config);
  });

  it("does not retry a caller-initiated cancellation (different abort reason)", async () => {
    const error = {
      code: "ERR_CANCELED",
      config: { headers: {}, signal: { reason: "component-unmount" } },
    };
    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(mocks.instance).not.toHaveBeenCalled();
  });

  it("rejects with the original error for any other status", async () => {
    const error = { response: { status: 500 }, config: {} };
    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
  });
});

describe("apiClient export", () => {
  it("is the axios instance created via axios.create", () => {
    expect(apiClient).toBe(mocks.instance);
    expect(axiosCreateCallArgs).toEqual(
      expect.objectContaining({ withCredentials: true, timeout: 30000 }),
    );
  });
});
