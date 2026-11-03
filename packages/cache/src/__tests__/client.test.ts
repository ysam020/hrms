const mockOn = jest.fn();
const mockRedisInstances: any[] = [];

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(function (
    this: any,
    url: string,
    options: any,
  ) {
    this.__url = url;
    this.__options = options;
    this.on = mockOn;
    mockRedisInstances.push(this);
    return this;
  });
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

describe("getRedisClient", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRedisInstances.length = 0;
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns the same singleton instance on repeated calls", () => {
    const { getRedisClient } = require("../client");
    const a = getRedisClient();
    const b = getRedisClient();
    expect(a).toBe(b);
    expect(mockRedisInstances).toHaveLength(1);
  });

  it("connects using REDIS_URL when set", () => {
    process.env.REDIS_URL = "redis://custom-host:6380";
    const { getRedisClient } = require("../client");
    getRedisClient();
    expect(mockRedisInstances[0].__url).toBe("redis://custom-host:6380");
  });

  it("falls back to localhost when REDIS_URL is unset", () => {
    const { getRedisClient } = require("../client");
    getRedisClient();
    expect(mockRedisInstances[0].__url).toBe("redis://localhost:6379");
  });

  it("configures maxRetriesPerRequest, disabled ready-check, and eager connect", () => {
    const { getRedisClient } = require("../client");
    getRedisClient();
    expect(mockRedisInstances[0].__options).toMatchObject({
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
  });

  it("registers error/connect/reconnecting listeners", () => {
    const { getRedisClient } = require("../client");
    getRedisClient();
    const events = mockOn.mock.calls.map(([event]: any[]) => event);
    expect(events).toEqual(
      expect.arrayContaining(["error", "connect", "reconnecting"]),
    );
  });

  it("logs on the error/connect/reconnecting events", () => {
    const { logger } = require("@hrms/logger");
    const { getRedisClient } = require("../client");
    getRedisClient();

    const handlers: Record<string, any> = {};
    mockOn.mock.calls.forEach(([event, fn]: any[]) => {
      handlers[event] = fn;
    });

    handlers.error(new Error("conn refused"));
    expect(logger.error).toHaveBeenCalledWith("Cache Redis error:", {
      err: expect.any(Error),
    });

    handlers.connect();
    expect(logger.info).toHaveBeenCalledWith("Cache Redis connected");

    handlers.reconnecting();
    expect(logger.warn).toHaveBeenCalledWith("Cache Redis reconnecting");
  });

  describe("retryStrategy (exponential backoff, capped at 5s)", () => {
    it("scales linearly with the retry count before the cap", () => {
      const { getRedisClient } = require("../client");
      getRedisClient();
      const { retryStrategy } = mockRedisInstances[0].__options;
      expect(retryStrategy(1)).toBe(200);
      expect(retryStrategy(3)).toBe(600);
      expect(retryStrategy(10)).toBe(2000);
    });

    it("caps the delay at 5000ms for large retry counts", () => {
      const { getRedisClient } = require("../client");
      getRedisClient();
      const { retryStrategy } = mockRedisInstances[0].__options;
      expect(retryStrategy(100)).toBe(5000);
    });
  });
});

describe("getCacheRedisClient", () => {
  beforeEach(() => {
    jest.resetModules();
    mockRedisInstances.length = 0;
    delete process.env.CACHE_REDIS_TIMEOUT_MS;
  });

  it("is a separate connection that fails fast instead of queueing and retrying", () => {
    const { getRedisClient, getCacheRedisClient } = require("../client");
    const shared = getRedisClient();
    const cache = getCacheRedisClient();

    expect(cache).not.toBe(shared);
    expect(getCacheRedisClient()).toBe(cache);
    expect(cache.__options).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 100,
    });
    // The shared client (refresh tokens, rate limits, invalidations) keeps
    // its queueing and retries.
    expect(shared.__options.maxRetriesPerRequest).toBe(3);
    expect(shared.__options.enableOfflineQueue).toBeUndefined();
  });

  it("takes its command timeout from CACHE_REDIS_TIMEOUT_MS", () => {
    process.env.CACHE_REDIS_TIMEOUT_MS = "250";
    const { getCacheRedisClient } = require("../client");
    expect(getCacheRedisClient().__options.commandTimeout).toBe(250);
  });
});
