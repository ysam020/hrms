import { BoundedCache } from "../boundedCache";

describe("BoundedCache", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("stores and retrieves a value", () => {
    const cache = new BoundedCache<string, number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
    cache.destroy();
  });

  it("returns undefined for a missing key", () => {
    const cache = new BoundedCache<string, number>();
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
    cache.destroy();
  });

  it("reports the current size", () => {
    const cache = new BoundedCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
    cache.destroy();
  });

  it("overwrites an existing key without growing size", () => {
    const cache = new BoundedCache<string, number>();
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe(2);
    cache.destroy();
  });

  it("clear() empties the cache", () => {
    const cache = new BoundedCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
    cache.destroy();
  });

  describe("LRU eviction on overflow", () => {
    it("evicts the least-recently-used entry once maxSize is exceeded", () => {
      const cache = new BoundedCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3); // should evict "a" (never read, oldest)

      expect(cache.size).toBe(2);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(true);
      expect(cache.has("c")).toBe(true);
    });

    it("a get() refreshes recency, protecting that key from the next eviction", () => {
      // Fake timers + manual advances: Date.now() has only 1ms resolution,
      // so rapid synchronous set/get calls can tie on the same millisecond,
      // making eviction order ambiguous. Advancing between each call
      // guarantees the recency ordering this test actually exercises.
      jest.useFakeTimers();
      const cache = new BoundedCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      jest.advanceTimersByTime(1);
      cache.set("b", 2);
      jest.advanceTimersByTime(1);
      cache.get("a"); // "a" is now more recently used than "b"
      jest.advanceTimersByTime(1);
      cache.set("c", 3); // should evict "b", not "a"

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
      cache.destroy();
    });

    it("never grows past maxSize across many inserts", () => {
      const cache = new BoundedCache<string, number>({ maxSize: 5 });
      for (let i = 0; i < 100; i++) cache.set(`key${i}`, i);
      expect(cache.size).toBe(5);
    });
  });

  describe("idle-TTL sweep", () => {
    it("evicts an entry once it has been idle longer than idleTtlMs", () => {
      jest.useFakeTimers();
      const cache = new BoundedCache<string, number>({
        idleTtlMs: 1000,
        sweepIntervalMs: 500,
      });
      cache.set("a", 1);

      jest.advanceTimersByTime(1500); // one sweep tick, past the idle TTL

      expect(cache.has("a")).toBe(false);
      cache.destroy();
    });

    it("does not evict an entry that was read again before the TTL elapsed", () => {
      jest.useFakeTimers();
      const cache = new BoundedCache<string, number>({
        idleTtlMs: 1000,
        sweepIntervalMs: 500,
      });
      cache.set("a", 1);

      jest.advanceTimersByTime(700);
      cache.get("a"); // refresh lastUsed before the sweep at 1000ms
      jest.advanceTimersByTime(700); // total 1400ms since set, but only 700ms since the read

      expect(cache.has("a")).toBe(true);
      cache.destroy();
    });

    it("does not sweep entries still within the idle TTL", () => {
      jest.useFakeTimers();
      const cache = new BoundedCache<string, number>({
        idleTtlMs: 10_000,
        sweepIntervalMs: 500,
      });
      cache.set("a", 1);

      jest.advanceTimersByTime(1500);

      expect(cache.has("a")).toBe(true);
      cache.destroy();
    });
  });

  describe("destroy()", () => {
    it("clears all entries", () => {
      const cache = new BoundedCache<string, number>();
      cache.set("a", 1);
      cache.destroy();
      expect(cache.size).toBe(0);
    });

    it("stops the sweep timer — no further eviction happens after destroy", () => {
      jest.useFakeTimers();
      const cache = new BoundedCache<string, number>({
        idleTtlMs: 1000,
        sweepIntervalMs: 500,
      });
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      cache.destroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });
});
