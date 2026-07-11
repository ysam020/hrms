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
});
