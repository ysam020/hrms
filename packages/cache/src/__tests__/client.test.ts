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
