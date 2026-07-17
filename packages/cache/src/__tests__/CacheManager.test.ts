import { CacheManager } from "../CacheManager";
import { getRedisClient } from "../client";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../client", () => ({
  getRedisClient: jest.fn(),
}));

const mockGetRedisClient = getRedisClient as jest.Mock;

// A fake Redis whose duplicate() returns a second fake client with its own
// listener list — enough to simulate N separate processes (N CacheManager
// instances, each with its own subscriber connection) sharing one Redis.
function makeFakeRedis() {
  const store = new Map<string, string>();
  const listenersByClient: Array<Map<string, Array<(...args: any[]) => void>>> =
    [];

  function makeClient(): any {
    const listeners = new Map<string, Array<(...args: any[]) => void>>();
    listenersByClient.push(listeners);
    return {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve("OK");
      }),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve(keys.length);
      }),
      scan: jest.fn(() => Promise.resolve(["0", []])),
      publish: jest.fn((channel: string, message: string) => {
        // Deliver synchronously to every subscribed client's "message"
        // listeners, simulating Redis fanning a publish out to every
        // subscriber — including other processes' CacheManager instances.
        for (const l of listenersByClient) {
          for (const fn of l.get("message") ?? []) fn(channel, message);
        }
        return Promise.resolve(1);
      }),
      subscribe: jest.fn(() => Promise.resolve(1)),
      on: jest.fn((event: string, fn: (...args: any[]) => void) => {
        const arr = listeners.get(event) ?? [];
        arr.push(fn);
        listeners.set(event, arr);
      }),
      duplicate: jest.fn(() => makeClient()),
    };
  }

  return { base: makeClient(), store };
}

describe("CacheManager", () => {
  it("get() returns a value written by set()", async () => {
    const { base } = makeFakeRedis();
    mockGetRedisClient.mockReturnValue(base);
    const manager = new CacheManager();

    await manager.set("k1", { a: 1 }, "default");

    expect(await manager.get("k1")).toEqual({ a: 1 });
  });

  it("delete() removes the key so a subsequent get() returns null", async () => {
    const { base } = makeFakeRedis();
    mockGetRedisClient.mockReturnValue(base);
    const manager = new CacheManager();

    await manager.set("k1", { a: 1 }, "default");
    await manager.delete("k1");

    expect(await manager.get("k1")).toBeNull();
  });

  it("does not throw when a subscribed invalidation message is malformed", async () => {
    const { base } = makeFakeRedis();
    mockGetRedisClient.mockReturnValue(base);
    new CacheManager();

    // The "message" listener is registered on the duplicated subscriber
    // connection, not on the base client — see subscribeToInvalidations().
    const subscriber = base.duplicate.mock.results[0].value;
    const messageHandlers = subscriber.on.mock.calls
      .filter(([event]: [string]) => event === "message")
      .map(([, fn]: [string, any]) => fn);
    expect(messageHandlers.length).toBeGreaterThan(0);
    expect(() =>
      messageHandlers.forEach((fn: any) =>
        fn("hrms:cache:invalidate", "not valid json"),
      ),
    ).not.toThrow();
  });

  describe("cross-process invalidation", () => {
    // Regression coverage for: editing KYC (or any write in one service)
    // invalidated Redis, but another service's process kept serving its own
    // stale in-memory copy — because delete()/invalidatePattern() only ever
    // evicted the memory of the process that called them.

    it("deleting a key in one instance evicts it from another instance's memory cache, not just Redis", async () => {
      const { base, store } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);

      const instanceA = new CacheManager(); // e.g. employee-service
      const instanceB = new CacheManager(); // e.g. user-service

      await instanceA.set("t:t1:user:v3:alice", { name: "old" }, "user");
      // instanceB independently warms its own memory cache for the same key
      // (as if it had served a GetUser read before instanceA's write).
      expect(await instanceB.get("t:t1:user:v3:alice")).toEqual({
        name: "old",
      });

      await instanceA.delete("t:t1:user:v3:alice");

      // Simulate fresh data already sitting in Redis (e.g. written by a
      // third process) so the assertion actually distinguishes "instanceB
      // fell through to Redis" from "instanceB served its stale memory
      // copy" — if the cross-process eviction didn't work, this would
      // still incorrectly return { name: "old" }.
      store.set("t:t1:user:v3:alice", JSON.stringify({ name: "new" }));

      expect(await instanceB.get("t:t1:user:v3:alice")).toEqual({
        name: "new",
      });
    });

    it("invalidatePattern in one instance evicts matching keys from another instance's memory cache", async () => {
      const { base, store } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);

      const instanceA = new CacheManager();
      const instanceB = new CacheManager();

      await instanceB.set("t:t1:employees:page1", { data: "old" }, "employee");
      expect(await instanceB.get("t:t1:employees:page1")).toEqual({
        data: "old",
      });

      await instanceA.invalidatePattern("t:t1:employees:*");

      store.set("t:t1:employees:page1", JSON.stringify({ data: "new" }));

      expect(await instanceB.get("t:t1:employees:page1")).toEqual({
        data: "new",
      });
    });

    it("does not evict unrelated keys from another instance's memory cache", async () => {
      const { base, store } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);

      const instanceA = new CacheManager();
      const instanceB = new CacheManager();

      await instanceB.set("t:t1:user:v3:bob", { name: "bob" }, "user");
      await instanceA.delete("t:t1:user:v3:alice");

      // If instanceB's copy of an unrelated key were wrongly evicted too,
      // this get() would fall through to Redis instead of memory — make
      // that distinguishable the same way as above.
      store.set("t:t1:user:v3:bob", JSON.stringify({ name: "corrupted" }));

      expect(await instanceB.get("t:t1:user:v3:bob")).toEqual({
        name: "bob",
      });
    });
  });

  describe("Redis failure fallback", () => {
    it("get() returns null (not throw) and logs when Redis errors", async () => {
      const { base } = makeFakeRedis();
      base.get.mockRejectedValue(new Error("redis down"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(manager.get("k1")).resolves.toBeNull();
    });

    it("set() falls back to memory-only when Redis errors, and get() still serves it", async () => {
      const { base } = makeFakeRedis();
      base.set.mockRejectedValue(new Error("redis down"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.set("k1", { a: 1 }, "default");

      expect(await manager.get("k1")).toEqual({ a: 1 });
    });

    it("delete() evicts memory even when the Redis call fails", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();
      await manager.set("k1", { a: 1 }, "default");

      base.del.mockRejectedValue(new Error("redis down"));
      await expect(manager.delete("k1")).resolves.toBeUndefined();

      // Memory eviction happens before the Redis call, unconditionally.
      base.get.mockResolvedValue(null);
      expect(await manager.get("k1")).toBeNull();
    });

    it("healthCheck() reports redis:false with an error message when ping fails", async () => {
      const { base } = makeFakeRedis();
      base.ping = jest.fn().mockRejectedValue(new Error("connection refused"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(manager.healthCheck()).resolves.toEqual({
        redis: false,
        memory: true,
        error: "connection refused",
      });
    });

    it("healthCheck() reports redis:true when ping returns PONG", async () => {
      const { base } = makeFakeRedis();
      base.ping = jest.fn().mockResolvedValue("PONG");
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(manager.healthCheck()).resolves.toEqual({
        redis: true,
        memory: true,
      });
    });

    it("logs (but does not throw) when subscriber setup itself fails", () => {
      mockGetRedisClient.mockImplementation(() => {
        throw new Error("no redis available");
      });
      expect(() => new CacheManager()).not.toThrow();
    });

    it("logs (but does not throw) when the subscribe() call rejects", async () => {
      const { base } = makeFakeRedis();
      const subscriberClient = {
        ...base,
        subscribe: jest.fn().mockRejectedValue(new Error("subscribe failed")),
      };
      base.duplicate.mockReturnValue(subscriberClient);
      mockGetRedisClient.mockReturnValue(base);

      expect(() => new CacheManager()).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe("in-memory LRU + TTL behavior", () => {
    it("evicts the least-recently-used entry once at MAX_MEMORY_SIZE (1000)", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      for (let i = 0; i < 1000; i++) {
        await manager.set(`k${i}`, i, "default");
      }
      // Force every read to come from memory by breaking the Redis fallback.
      base.get.mockResolvedValue(null);

      await manager.set("k1000", 1000, "default");

      // k0 was least-recently-used (never read since insertion) and
      // should have been evicted to make room for k1000.
      expect(await manager.get("k0")).toBeNull();
      expect(await manager.get("k1000")).toBe(1000);
    });

    it("promotes a key to most-recently-used on read, saving it from LRU eviction", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();
      base.get.mockResolvedValue(null);

      for (let i = 0; i < 1000; i++) {
        await manager.set(`k${i}`, i, "default");
      }
      // Touch k1 so it's no longer the LRU entry (k0 still is).
      await manager.get("k1");
      await manager.set("k1000", 1000, "default");

      expect(await manager.get("k1")).toBe(1);
      expect(await manager.get("k0")).toBeNull();
    });

    it("expires a memory entry after its TTL and falls through to Redis", async () => {
      const { base, store } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      const now = Date.now();
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now);
      await manager.set("k1", { a: 1 }, undefined, 10); // 10s custom TTL

      nowSpy.mockReturnValue(now + 11_000);
      store.set("k1", JSON.stringify({ a: 2 }));

      expect(await manager.get("k1")).toEqual({ a: 2 });
      nowSpy.mockRestore();
    });

    it("resolves TTL by entity type, falling back to the default for an unknown type", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.set("k1", { a: 1 }, "salary");
      expect(base.set).toHaveBeenCalledWith(
        "k1",
        JSON.stringify({ a: 1 }),
        "EX",
        14400,
      );

      await manager.set("k2", { a: 2 }, "totally-unknown-entity");
      expect(base.set).toHaveBeenCalledWith(
        "k2",
        JSON.stringify({ a: 2 }),
        "EX",
        3600,
      );
    });

    it("prefers an explicit custom TTL over the entity-type default", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.set("k1", { a: 1 }, "salary", 99);
      expect(base.set).toHaveBeenCalledWith(
        "k1",
        JSON.stringify({ a: 1 }),
        "EX",
        99,
      );
    });

    it("cleanup() purges only expired entries from memory", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      const now = Date.now();
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(now);
      await manager.set("expiring", { a: 1 }, undefined, 10);
      await manager.set("fresh", { a: 2 }, undefined, 1000);

      nowSpy.mockReturnValue(now + 11_000);
      manager.cleanup();

      expect(manager.getCacheStats().memoryEntries).toBe(1);
      base.get.mockResolvedValue(null);
      expect(await manager.get("fresh")).toEqual({ a: 2 });
      nowSpy.mockRestore();
    });

    it("getCacheStats() reports the current memory entry count and max size", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.set("k1", { a: 1 }, "default");
      await manager.set("k2", { a: 2 }, "default");

      expect(manager.getCacheStats()).toEqual({
        memoryEntries: 2,
        maxSize: 1000,
      });
    });
  });

  describe("invalidatePattern", () => {
    it("pages through SCAN cursors and deletes every matched key", async () => {
      const { base, store } = makeFakeRedis();
      store.set("t:t1:employees:1", "x");
      store.set("t:t1:employees:2", "x");
      base.scan
        .mockResolvedValueOnce(["17", ["t:t1:employees:1"]])
        .mockResolvedValueOnce(["0", ["t:t1:employees:2"]]);
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.invalidatePattern("t:t1:employees:*");

      expect(base.scan).toHaveBeenCalledTimes(2);
      expect(base.del).toHaveBeenCalledWith("t:t1:employees:1");
      expect(base.del).toHaveBeenCalledWith("t:t1:employees:2");
    });

    it("skips the del() call for a SCAN page with no matches", async () => {
      const { base } = makeFakeRedis();
      base.scan.mockResolvedValue(["0", []]);
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.invalidatePattern("t:t1:nomatch:*");

      expect(base.del).not.toHaveBeenCalled();
    });

    it("logs (but does not throw) when SCAN itself fails", async () => {
      const { base } = makeFakeRedis();
      base.scan.mockRejectedValue(new Error("redis down"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(
        manager.invalidatePattern("t:t1:*"),
      ).resolves.toBeUndefined();
    });

    it("evicts memory entries matching a mid-string glob, not just a trailing :* prefix", async () => {
      const { base } = makeFakeRedis();
      base.scan.mockResolvedValue(["0", []]);
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();
      base.get.mockResolvedValue(null);

      await manager.set("t:t1:employee:v3:alice", { a: 1 }, "default");
      await manager.invalidatePattern("t:*:employee:v3:alice");

      expect(await manager.get("t:t1:employee:v3:alice")).toBeNull();
    });
  });
});
