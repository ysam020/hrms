jest.mock("express-rate-limit", () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn()),
  ipKeyGenerator: jest.fn(),
}));
jest.mock("rate-limit-redis", () => ({ RedisStore: jest.fn() }));
jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(() => ({ call: jest.fn() })),
}));

import { limitMax } from "../config/rateLimiters";

describe("limitMax (load-testing rate-limit overrides)", () => {
  const saved = { ...process.env };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.RATE_LIMIT_MAX_GENERAL;
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env = { ...saved };
    warn.mockRestore();
  });

  it("returns the coded default when no override is set", () => {
    expect(limitMax("GENERAL", 10000)).toBe(10000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("applies a positive integer override and logs it", () => {
    process.env.RATE_LIMIT_MAX_GENERAL = "500000";
    expect(limitMax("GENERAL", 10000)).toBe(500000);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("RATE_LIMIT_MAX_GENERAL=500000"),
    );
  });

  it("never applies an override in production", () => {
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_MAX_GENERAL = "500000";
    expect(limitMax("GENERAL", 10000)).toBe(10000);
  });

  it.each(["0", "-5", "1.5", "abc", ""])(
    "falls back to the default for invalid value %p",
    (raw) => {
      process.env.RATE_LIMIT_MAX_GENERAL = raw;
      expect(limitMax("GENERAL", 10000)).toBe(10000);
    },
  );
});
