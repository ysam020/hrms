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
jest.mock("jsonwebtoken", () => ({ verify: jest.fn() }));
jest.mock("../middleware/authenticate", () => ({
  authenticate: jest.fn(),
  authorize: jest.fn(() => jest.fn()),
}));
// Proxy so any handler name the router references resolves to a stub
// middleware function, without hardcoding (and having to keep in sync) the
// full handler export list of each module.
const handlerProxy = () => new Proxy({}, { get: () => jest.fn() });
jest.mock("../handlers/analytics", () => handlerProxy());
jest.mock("../handlers/ai-insights", () => handlerProxy());
jest.mock("../mcp/oauth", () => handlerProxy());
jest.mock("../mcp/principal", () => handlerProxy());
jest.mock("../mcp/tools", () => ({ TOOLS: [], ToolError: class {} }));
jest.mock("../mcp/audit", () => handlerProxy());
jest.mock("@hrms/logger", () => ({
  apiRequestLogger: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  mcpToolCallsTotal: { inc: jest.fn() },
  mcpToolCallDuration: { observe: jest.fn() },
}));

// Regression coverage for three rate limiters the platform audit found were
// never caught by the original migration of config/rateLimiters.ts to a
// Redis-backed store: these three routers each built their own
// express-rate-limit instance directly, still on the in-process default.
describe("router-level Redis-backed limiters", () => {
  const findLimiterPrefix = (prefixPattern: RegExp) => {
    const match = capturedOptions.find((o) =>
      prefixPattern.test(o.store?.__options?.prefix ?? ""),
    );
    return match?.store?.__options?.prefix;
  };

  it("routes/analytics.ts's limiter is Redis-backed under rl:analytics:", () => {
    jest.isolateModules(() => {
      require("../routes/analytics");
    });
    expect(findLimiterPrefix(/^rl:analytics:$/)).toBe("rl:analytics:");
  });

  it("mcp/router.ts's limiters are all Redis-backed under rl:mcp: / rl:oauth:", () => {
    jest.isolateModules(() => {
      require("../mcp/router");
    });
    const prefixes = capturedOptions
      .map((o) => o.store?.__options?.prefix)
      .filter((p) => /^rl:(mcp|oauth):/.test(p ?? ""));
    expect(prefixes.sort()).toEqual([
      "rl:mcp:grant:",
      "rl:mcp:ip:",
      "rl:mcp:public:",
      "rl:oauth:authorize:",
      "rl:oauth:register:",
      "rl:oauth:token:",
    ]);
  });

  it("routes/ai-insights.ts's limiter is Redis-backed under rl:ai-insights:", () => {
    jest.isolateModules(() => {
      require("../routes/ai-insights");
    });
    expect(findLimiterPrefix(/^rl:ai-insights:$/)).toBe("rl:ai-insights:");
  });

  it("the three router-level prefixes are mutually distinct and namespaced separately from config/rateLimiters.ts's own limiters", () => {
    const routerPrefixes = [
      findLimiterPrefix(/^rl:analytics:$/),
      findLimiterPrefix(/^rl:mcp:grant:$/),
      findLimiterPrefix(/^rl:ai-insights:$/),
    ];
    expect(new Set(routerPrefixes).size).toBe(3);
    for (const prefix of routerPrefixes) {
      expect(prefix).not.toEqual(
        expect.stringMatching(/^rl:(auth|profile|general|public|mw-)/),
      );
    }
  });
});
