import jwt from "jsonwebtoken";

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

import { authLimiter, applyRateLimiters } from "../config/rateLimiters";

function makeReq(overrides: Partial<any> = {}) {
  return { headers: {}, cookies: {}, ip: "1.2.3.4", ...overrides };
}

describe("rateLimiters key generator (userOrIpKey)", () => {
  // authLimiter is the first limiter constructed, so its captured options
  // hold the shared `userOrIpKey` keyGenerator every limiter in this module uses.
  const keyGenerator = (authLimiter as any).__options.keyGenerator;

  it("uses the JWT payload's userId when a valid Bearer token is present", () => {
    const token = jwt.sign({ userId: "u123" }, "any-secret");
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    expect(keyGenerator(req)).toBe("user:u123");
  });

  it("uses the JWT payload's userId when the token comes from a cookie", () => {
    const token = jwt.sign({ userId: "u456" }, "any-secret");
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
    const token = jwt.sign({ someOtherField: true }, "any-secret");
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    expect(keyGenerator(req)).toBe("ip:normalized:1.2.3.4");
  });

  it("falls back to 'ip:unknown' when there is neither a token nor an IP", () => {
    const req = makeReq({ ip: undefined });
    expect(keyGenerator(req)).toBe("ip:unknown");
  });

  it("does not use the JWT signature for trust — decodes without verifying", () => {
    // jwt.decode (not verify) is used intentionally to partition rate-limit
    // buckets only, so an unsigned/forged token still yields a stable key.
    const forged = jwt.sign({ userId: "attacker" }, "wrong-secret-entirely");
    const req = makeReq({ headers: { authorization: `Bearer ${forged}` } });
    expect(keyGenerator(req)).toBe("user:attacker");
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
        "/api",
      ]),
    );
    expect(app.use).toHaveBeenCalledTimes(5);
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
});
