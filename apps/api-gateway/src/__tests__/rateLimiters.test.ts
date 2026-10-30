import jwt from "jsonwebtoken";

process.env.ACCESS_JWT_TOKEN = "test-jwt-secret";

const capturedOptions: any[] = [];

jest.mock("express-rate-limit", () => {
  const rateLimit = jest.fn((options: any) => {
    capturedOptions.push(options);
    const middleware: any = jest.fn();
    middleware.__options = options;
    return middleware;
  });
  return {
    __esModule: true,
    default: rateLimit,
    ipKeyGenerator: jest.fn((req: any) => `normalized:${req.ip}`),
  };
});

// Without these mocks, constructing rateLimiters.ts's module-level
// RedisStore instances would call the real getRedisClient(), which
// attempts an actual network connection to Redis and hangs the test file
// (there's no Redis reachable in this environment). RedisStore's own
// correctness is rate-limit-redis's responsibility, not this module's.
const capturedStoreOptions: any[] = [];
jest.mock("rate-limit-redis", () => ({
  RedisStore: jest.fn((options: any) => {
    capturedStoreOptions.push(options);
    return { __options: options };
  }),
}));
jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(() => ({ call: jest.fn() })),
}));

import {
  authLimiter,
  applyRateLimiters,
  DRAFT_RECOVERY_REGEX,
  isApplicationWrite,
} from "../config/rateLimiters";

function makeReq(overrides: Partial<any> = {}) {
  return { headers: {}, cookies: {}, ip: "1.2.3.4", ...overrides };
}

describe("rateLimiters key generator (userOrIpKey)", () => {
  // authLimiter is the first limiter constructed, so its captured options
  // hold the shared `userOrIpKey` keyGenerator every limiter in this module uses.
  const keyGenerator = (authLimiter as any).__options.keyGenerator;

  const sign = (payload: object) =>
    jwt.sign(payload, "test-jwt-secret", { algorithm: "HS256" });

  it("uses the JWT payload's userId when a valid, correctly-signed Bearer token is present", () => {
    const token = sign({ userId: "u123" });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    expect(keyGenerator(req)).toBe("user:u123");
  });

  it("uses the JWT payload's userId when the token comes from a cookie", () => {
    const token = sign({ userId: "u456" });
    const req = makeReq({ cookies: { access_token: token } });
    expect(keyGenerator(req)).toBe("user:u456");
  });

  it("falls back to IP when there is no token", () => {
    const req = makeReq();
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to IP when the token is malformed", () => {
    const req = makeReq({ headers: { authorization: "Bearer not-a-jwt" } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to IP when the decoded payload has no userId", () => {
    const token = sign({ someOtherField: true });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to 'ip:unknown' when there is neither a token nor an IP", () => {
    const req = makeReq({ ip: undefined });
    expect(keyGenerator(req)).toBe("ip:unknown");
  });

  // Regression coverage for a real vulnerability: these limiters guard
  // unauthenticated routes (login, credential-check, public job
  // applications), so an attacker fully controls the Authorization header.
  // The key generator must verify the signature — a forged token with a
  // rotating fake userId must NOT be trusted into its own rate-limit
  // bucket, or it defeats the limiter entirely.
  it("falls back to IP for a token signed with the wrong secret (forged)", () => {
    const forged = jwt.sign({ userId: "attacker" }, "wrong-secret-entirely", {
      algorithm: "HS256",
    });
    const req = makeReq({ headers: { authorization: `Bearer ${forged}` } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to IP for an unsigned (alg: none) token", () => {
    const unsigned = jwt.sign({ userId: "attacker" }, "", {
      algorithm: "none",
    });
    const req = makeReq({ headers: { authorization: `Bearer ${unsigned}` } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to IP for an expired token", () => {
    const expired = jwt.sign({ userId: "u789" }, "test-jwt-secret", {
      algorithm: "HS256",
      expiresIn: -10,
    });
    const req = makeReq({ headers: { authorization: `Bearer ${expired}` } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });
});

describe("Redis-backed store", () => {
  // Regression coverage: in-process counters are meaningless the moment
  // the gateway scales past one replica (max × N effective limit, reset
  // on every deploy). Every limiter must share a durable, Redis-backed
  // store instead of express-rate-limit's default in-memory Map.
  it("gives every limiter a RedisStore instance with a distinct key prefix", () => {
    expect(capturedStoreOptions.length).toBeGreaterThanOrEqual(4);
    const prefixes = capturedStoreOptions.map((o) => o.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length); // all distinct
    for (const options of capturedOptions) {
      expect(options.store).toBeDefined();
      expect(options.store.__options.prefix).toEqual(
        expect.stringMatching(/^rl:/),
      );
    }
  });
});

describe("applyRateLimiters", () => {
  it("wires each limiter to its expected route(s)", () => {
    const app: any = { use: jest.fn() };
    applyRateLimiters(app);

    const calls = app.use.mock.calls;
    expect(calls).toContainEqual([expect.any(RegExp), expect.any(Function)]);
    expect(calls.map((c: any[]) => c[0])).toEqual(
      expect.arrayContaining([
        expect.any(RegExp), // AUTH_ROUTES_REGEX
        "/api/v1/refresh-token",
        "/api/v1/profile",
        expect.any(RegExp), // PUBLIC_ROUTES_REGEX
        expect.any(RegExp), // DRAFT_RECOVERY_REGEX
        "/api",
      ]),
    );
    // + the application-write limiter, mounted as plain middleware.
    expect(app.use).toHaveBeenCalledTimes(7);
    // The catch-all general limiter stays last.
    expect(calls[calls.length - 1][0]).toBe("/api");
  });

  it("applies the auth limiter's regex to a known webauthn login route", () => {
    const app: any = { use: jest.fn() };
    applyRateLimiters(app);
    const [authRegex] = app.use.mock.calls[0];
    expect(authRegex.test("/api/v1/webauthn-login")).toBe(true);
    expect(authRegex.test("/api/v1/employee")).toBe(false);
  });

  it("applies the public limiter's regex to known public routes only", () => {
    const app: any = { use: jest.fn() };
    applyRateLimiters(app);
    const publicRegexCall = app.use.mock.calls.find(
      ([arg]: any[]) =>
        arg instanceof RegExp && arg.test("/api/v1/public/careers"),
    );
    expect(publicRegexCall).toBeDefined();
    expect(publicRegexCall[0].test("/api/v1/employee")).toBe(false);
  });

  it("gives draft recovery its own tight limiter", () => {
    expect(
      DRAFT_RECOVERY_REGEX.test(
        "/api/v1/public/careers/acme/jobs/abc/drafts/recover",
      ),
    ).toBe(true);
    expect(
      DRAFT_RECOVERY_REGEX.test(
        "/api/v1/public/careers/acme/jobs/abc/drafts/recover/verify",
      ),
    ).toBe(true);
    expect(DRAFT_RECOVERY_REGEX.test("/api/v1/public/careers/acme")).toBe(
      false,
    );
  });

  it("limits only the POSTs that create drafts or applications", () => {
    expect(isApplicationWrite("POST", "/api/v1/apply-for-job/acme")).toBe(true);
    expect(
      isApplicationWrite("POST", "/api/v1/public/careers/acme/jobs/abc/drafts"),
    ).toBe(true);
    expect(
      isApplicationWrite(
        "POST",
        "/api/v1/public/careers/acme/drafts/d1/submit",
      ),
    ).toBe(true);
    // Autosaves and reads stay on the ordinary public budget.
    expect(
      isApplicationWrite("PUT", "/api/v1/public/careers/acme/drafts/d1"),
    ).toBe(false);
    expect(isApplicationWrite("GET", "/api/v1/public/careers/acme")).toBe(
      false,
    );
    expect(
      isApplicationWrite(
        "POST",
        "/api/v1/public/careers/acme/jobs/abc/drafts/recover",
      ),
    ).toBe(false);
  });
});
