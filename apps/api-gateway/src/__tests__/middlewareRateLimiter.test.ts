const capturedOptions: any[] = [];

jest.mock("express-rate-limit", () => {
  const rateLimit = jest.fn((options: any) => {
    capturedOptions.push(options);
    const middleware: any = jest.fn();
    middleware.__options = options;
    return middleware;
  });
  return { __esModule: true, default: rateLimit };
});

// Without these mocks, constructing config/rateLimiters.ts's module-level
// RedisStore instances would call the real getRedisClient(), which attempts
// an actual network connection to Redis and hangs the test file.
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

import { defaultLimiter, authLimiter } from "../middleware/rateLimiter";

// Regression coverage for the gap the platform audit found: this module
// (mounted via subscriptionGuard in routes/index.ts, which guards nearly
// every authenticated business route) used express-rate-limit's default
// in-process MemoryStore. In-process counters are meaningless once the
// gateway runs more than one replica — each replica enforces `max`
// independently, multiplying the real effective limit by replica count.
describe("middleware/rateLimiter — Redis-backed store", () => {
  // This module re-exports config/rateLimiters.ts's redisStore helper, so
  // importing it also evaluates that module's own 4 module-level limiters —
  // capturedOptions/__options therefore holds those too. Filter down to this
  // module's own prefix (rl:mw-*) rather than asserting a raw count.
  const mwOptions = () =>
    capturedOptions.filter((o) =>
      /^rl:mw-/.test(o.store?.__options?.prefix ?? ""),
    );

  it("gives defaultLimiter and authLimiter a RedisStore instance, not the in-process default", () => {
    const options = mwOptions();
    expect(options.length).toBe(2);
    for (const o of options) {
      expect(o.store).toBeDefined();
      expect(o.store.__options).toBeDefined();
    }
  });

  it("uses a distinct key prefix from every other rate limiter in the app so counters can't collide", () => {
    const prefixes = capturedStoreOptions.map((o) => o.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length); // all distinct across every limiter constructed
    const mwPrefixes = mwOptions().map((o) => o.store.__options.prefix);
    expect(mwPrefixes).toEqual(
      expect.arrayContaining(["rl:mw-default:", "rl:mw-auth:"]),
    );
  });

  it("exports usable middleware handlers", () => {
    expect(typeof defaultLimiter).toBe("function");
    expect(typeof authLimiter).toBe("function");
  });
});
