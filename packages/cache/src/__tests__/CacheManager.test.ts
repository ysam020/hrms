import { CacheManager, cacheFamilyOf } from "../CacheManager";
import { getRedisClient } from "../client";

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  cacheInvalidationSubscriberReconnectsTotal: { inc: jest.fn() },
  cacheOperationsTotal: { inc: jest.fn() },
  cacheLoaderDuration: { observe: jest.fn() },
  cacheRedisDuration: { observe: jest.fn() },
}));

// Reads and fills use the fail-fast cache client; in these tests it is the
// same fake Redis as the shared client.
jest.mock("../client", () => {
  const getRedisClient = jest.fn();
  return {
    getRedisClient,
    getCacheRedisClient: jest.fn(() => getRedisClient()),
  };
});

const mockGetRedisClient = getRedisClient as jest.Mock;

// A fake Redis whose duplicate() returns a second fake client with its own
// listener list — enough to simulate N separate processes (N CacheManager
// instances, each with its own subscriber connection) sharing one Redis.
function makeFakeRedis() {
  const store = new Map<string, string>();
  // Backs the "idx:<prefix>" SADD/SMEMBERS index set() maintains so
  // invalidatePattern() can look keys up instead of scanning for them.
  const sets = new Map<string, Set<string>>();
  const listenersByClient: Array<Map<string, Array<(...args: any[]) => void>>> =
    [];

  function makeClient(): any {
    const listeners = new Map<string, Array<(...args: any[]) => void>>();
    listenersByClient.push(listeners);
    const client: any = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve("OK");
      }),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((k) => {
          store.delete(k);
          sets.delete(k);
        });
        return Promise.resolve(keys.length);
      }),
      scan: jest.fn(() => Promise.resolve(["0", []])),
      sadd: jest.fn((key: string, member: string) => {
        if (!sets.has(key)) sets.set(key, new Set());
        sets.get(key)!.add(member);
        return Promise.resolve(1);
      }),
      smembers: jest.fn((key: string) =>
        Promise.resolve(Array.from(sets.get(key) ?? [])),
      ),
      expire: jest.fn(() => Promise.resolve(1)),
      // Minimal fluent multi() covering just what CacheManager.set() calls.
      multi: jest.fn(() => {
        const ops: Array<() => Promise<unknown>> = [];
        const chain: any = {
          set: (...args: any[]) => {
            ops.push(() => client.set(...args));
            return chain;
          },
          sadd: (...args: any[]) => {
            ops.push(() => client.sadd(...args));
            return chain;
          },
          expire: (...args: any[]) => {
            ops.push(() => client.expire(...args));
            return chain;
          },
          exec: async () => {
            for (const op of ops) {
              await op();
            }
            return [];
          },
        };
        return chain;
      }),
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
    return client;
  }

  return { base: makeClient(), store, sets };
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

    it("resolves TTL by entity type (±10% jitter), falling back to the default for an unknown type", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();
      const ttlOf = (key: string) =>
        (base.set as jest.Mock).mock.calls.find((c: any[]) => c[0] === key)[3];

      await manager.set("k1", { a: 1 }, "salary");
      expect(ttlOf("k1")).toBeGreaterThanOrEqual(14400 * 0.9);
      expect(ttlOf("k1")).toBeLessThanOrEqual(14400 * 1.1);

      await manager.set("k2", { a: 2 }, "totally-unknown-entity");
      expect(ttlOf("k2")).toBeGreaterThanOrEqual(3600 * 0.9);
      expect(ttlOf("k2")).toBeLessThanOrEqual(3600 * 1.1);
    });

    it("keeps prefix index sets alive at least as long as any jittered member", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();
      await manager.set("t:x:leaves:1", { a: 1 }, "salary");
      for (const call of (base.expire as jest.Mock).mock.calls)
        expect(call[1]).toBe(Math.ceil(14400 * 1.1));
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
    // Regression coverage for: invalidatePattern() used to SCAN the entire
    // Redis keyspace on every call regardless of how narrow the pattern was
    // (SCAN's MATCH filter is applied after iterating every key — Redis has
    // no prefix index of its own). Under real write volume that meant a
    // single mutation could cost O(every key across every tenant, every
    // rate limiter, every BullMQ job), confirmed via `INFO commandstats`
    // showing 43M+ SCAN calls and Redis pegged at ~190% CPU. For any
    // pattern of the simple "<prefix>:*" shape (every real call site in
    // this codebase), set() now maintains a per-prefix index set so
    // invalidatePattern() can look keys up directly instead.
    it("deletes exactly the keys indexed under that prefix, without calling SCAN", async () => {
      const { base, store } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.set("t:t1:employees:1", { a: 1 }, "employee");
      await manager.set("t:t1:employees:2", { a: 2 }, "employee");
      // A key under an unrelated prefix must survive.
      await manager.set("t:t1:users:1", { a: 3 }, "user");

      await manager.invalidatePattern("t:t1:employees:*");

      expect(base.scan).not.toHaveBeenCalled();
      expect(store.has("t:t1:employees:1")).toBe(false);
      expect(store.has("t:t1:employees:2")).toBe(false);
      expect(store.has("t:t1:users:1")).toBe(true);
    });

    it("is a no-op (not an error) when nothing was ever indexed under that prefix", async () => {
      const { base } = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(
        manager.invalidatePattern("t:t1:nomatch:*"),
      ).resolves.toBeUndefined();
      expect(base.scan).not.toHaveBeenCalled();
    });

    it("logs (but does not throw) when the index lookup itself fails", async () => {
      const { base } = makeFakeRedis();
      base.smembers.mockRejectedValue(new Error("redis down"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(
        manager.invalidatePattern("t:t1:employees:*"),
      ).resolves.toBeUndefined();
    });

    // Any pattern that ISN'T the simple "<prefix>:*" shape falls back to
    // the original SCAN sweep, so a future caller using a different glob
    // shape can't silently under-invalidate.
    it("falls back to SCAN for a pattern with a wildcard that isn't a single trailing one", async () => {
      const { base, store } = makeFakeRedis();
      store.set("t:t1:employees:1", "x");
      store.set("t:t2:employees:1", "x");
      base.scan
        .mockResolvedValueOnce(["17", ["t:t1:employees:1"]])
        .mockResolvedValueOnce(["0", ["t:t2:employees:1"]]);
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.invalidatePattern("t:*:employees:1");

      expect(base.scan).toHaveBeenCalledTimes(2);
      expect(base.del).toHaveBeenCalledWith("t:t1:employees:1");
      expect(base.del).toHaveBeenCalledWith("t:t2:employees:1");
    });

    it("skips the del() call for a SCAN page with no matches (fallback path)", async () => {
      const { base } = makeFakeRedis();
      base.scan.mockResolvedValue(["0", []]);
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await manager.invalidatePattern("t:*:nomatch:1");

      expect(base.del).not.toHaveBeenCalled();
    });

    it("logs (but does not throw) when SCAN itself fails (fallback path)", async () => {
      const { base } = makeFakeRedis();
      base.scan.mockRejectedValue(new Error("redis down"));
      mockGetRedisClient.mockReturnValue(base);
      const manager = new CacheManager();

      await expect(
        manager.invalidatePattern("t:*:broken:1"),
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

  describe("getOrSet()", () => {
    const setup = () => {
      const fake = makeFakeRedis();
      mockGetRedisClient.mockReturnValue(fake.base);
      return { ...fake, manager: new CacheManager() };
    };

    it("loads once on a miss, then serves the cached value without loading", async () => {
      const { manager } = setup();
      const load = jest.fn().mockResolvedValue({ n: 1 });

      expect(await manager.getOrSet("t:t1:settings:active", load)).toEqual({
        n: 1,
      });
      expect(await manager.getOrSet("t:t1:settings:active", load)).toEqual({
        n: 1,
      });
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("shares one load between concurrent misses on the same key", async () => {
      const { manager } = setup();
      let release!: (v: number) => void;
      const load = jest.fn(() => new Promise<number>((r) => (release = r)));

      const all = Promise.all([
        manager.getOrSet("k", load),
        manager.getOrSet("k", load),
        manager.getOrSet("k", load),
      ]);
      await new Promise((r) => setImmediate(r));
      release(7);

      expect(await all).toEqual([7, 7, 7]);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("loads different keys independently", async () => {
      const { manager } = setup();
      const load = jest.fn((v: string) => Promise.resolve(v));

      const [a, b] = await Promise.all([
        manager.getOrSet("a", () => load("A")),
        manager.getOrSet("b", () => load("B")),
      ]);

      expect([a, b]).toEqual(["A", "B"]);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it.each([0, false, null, "", []])(
      "caches the falsy value %p and serves it as a hit",
      async (value) => {
        const { manager, store } = setup();
        const load = jest.fn().mockResolvedValue(value);

        expect(await manager.getOrSet("k", load)).toEqual(value);
        expect(store.has("k")).toBe(true);
        // A second instance (another process) reads it from Redis.
        const other = new CacheManager();
        expect(await other.getOrSet("k", load)).toEqual(value);
        expect(load).toHaveBeenCalledTimes(1);
      },
    );

    it("does not cache undefined", async () => {
      const { manager, store } = setup();
      await manager.getOrSet("k", async () => undefined);
      expect(store.has("k")).toBe(false);
    });

    it("rejects every waiter when the load fails, caches nothing, and retries next time", async () => {
      const { manager, store } = setup();
      const load = jest
        .fn()
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce("ok");

      const results = await Promise.allSettled([
        manager.getOrSet("k", load),
        manager.getOrSet("k", load),
      ]);
      expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
      expect(store.has("k")).toBe(false);

      expect(await manager.getOrSet("k", load)).toBe("ok");
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("falls back to the loader when Redis reads fail, and still returns the value", async () => {
      const { base, manager } = setup();
      base.get.mockRejectedValue(new Error("Command timed out"));
      base.set.mockRejectedValue(new Error("Command timed out"));

      expect(await manager.getOrSet("k", async () => 3)).toBe(3);
      // Kept in this process's memory, so the next read doesn't load again.
      const load = jest.fn().mockResolvedValue(4);
      expect(await manager.getOrSet("k", load)).toBe(3);
      expect(load).not.toHaveBeenCalled();
    });

    it("uses an explicit ttlSeconds exactly (no jitter)", async () => {
      const { base, manager } = setup();
      await manager.getOrSet("k", async () => 1, { ttlSeconds: 42 });
      expect(base.set).toHaveBeenCalledWith("k", "1", "EX", 42);
    });

    it("fresh: true skips the cached value and re-caches the loaded one", async () => {
      const { manager } = setup();
      await manager.getOrSet("k", async () => "old");

      expect(
        await manager.getOrSet("k", async () => "new", { fresh: true }),
      ).toBe("new");
      expect(await manager.getOrSet("k", async () => "unused")).toBe("new");
    });

    it("fresh loads coalesce with each other, not with a normal in-flight load", async () => {
      const { manager } = setup();
      let releaseNormal!: (v: string) => void;
      const normal = manager.getOrSet(
        "k",
        () => new Promise<string>((r) => (releaseNormal = r)),
      );
      const freshLoad = jest.fn().mockResolvedValue("fresh");
      const fresh = Promise.all([
        manager.getOrSet("k", freshLoad, { fresh: true }),
        manager.getOrSet("k", freshLoad, { fresh: true }),
      ]);

      expect(await fresh).toEqual(["fresh", "fresh"]);
      expect(freshLoad).toHaveBeenCalledTimes(1);
      releaseNormal("normal");
      expect(await normal).toBe("normal");
    });

    it("does not cache a load that an invalidation overtook", async () => {
      const { manager, store } = setup();
      let release!: (v: string) => void;
      const pending = manager.getOrSet(
        "t:t1:users:roster",
        () => new Promise<string>((r) => (release = r)),
      );
      await new Promise((r) => setImmediate(r));
      // A write elsewhere invalidates while the (pre-write) read is in flight.
      await manager.invalidatePattern("t:t1:users:*");
      release("pre-write");

      expect(await pending).toBe("pre-write");
      expect(store.has("t:t1:users:roster")).toBe(false);
    });

    it("an invalidation from another process evicts this process's copy", async () => {
      const { manager } = setup();
      const other = new CacheManager();
      await manager.getOrSet("t:t1:settings:active", async () => "v1");

      await other.delete("t:t1:settings:active");

      expect(
        await manager.getOrSet("t:t1:settings:active", async () => "v2"),
      ).toBe("v2");
    });

    it("labels metrics with the key family only, never an id", async () => {
      const { cacheOperationsTotal } = jest.requireMock("@hrms/logger");
      const { manager } = setup();
      await manager.getOrSet("t:tenant-123:settings:active", async () => 1);
      await manager.getOrSet("t:tenant-123:settings:active", async () => 1);

      const labels = cacheOperationsTotal.inc.mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ family: "settings", result: "miss" }),
          expect.objectContaining({ family: "settings", result: "set" }),
          expect.objectContaining({ family: "settings", result: "hit_memory" }),
        ]),
      );
      expect(JSON.stringify(labels)).not.toContain("tenant-123");
    });
  });

  describe("cacheFamilyOf()", () => {
    it.each([
      ["t:abc:dashboard:v1:workforce", "dashboard"],
      ["tenantSettings:leave:abc", "tenantSettings"],
      ["t:abc:user:v6:42", "user"],
      ["t:abc:*", "other"],
      ["6553f0a1b2c3d4e5f6a7b8c9:x", "other"],
    ])("%s → %s", (key, family) => {
      expect(cacheFamilyOf(key)).toBe(family);
    });
  });
});
