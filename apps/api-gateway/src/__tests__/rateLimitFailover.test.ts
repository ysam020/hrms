/**
 * A Redis outage must not take the API down, and must not turn
 * rate limiting off.
 *
 * HTTP layer: real Express + real express-rate-limit with the gateway's
 * FailoverStore wrapping a Redis store that fails (or hangs) on demand.
 * The "no 500 while Redis is down" assertions FAIL on the pre-fix code
 * (364d2fb), where every limiter used the Redis store directly — that
 * behaviour is reproduced as the first test, for reference.
 */
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@hrms/cache", () => ({ getRedisClient: jest.fn() }));
jest.mock("@hrms/db", () => ({ recordExternal: jest.fn() }));

import express from "express";
import { AddressInfo } from "net";
import rateLimit, { MemoryStore, type Store } from "express-rate-limit";
import { logger } from "@hrms/logger";
import {
  FailoverStore,
  rateLimitStoreHealth,
  resetRateLimitStoreHealth,
} from "../config/rateLimiters";

/** A stand-in for the Redis store: a real counter, plus an outage switch. */
class FlakyRedisStore implements Store {
  readonly prefix = "flaky:";
  mode: "up" | "down" | "hang" = "up";
  calls = 0;
  private readonly inner = new MemoryStore();
  init(o: any) {
    this.inner.init(o);
  }
  private gate() {
    this.calls++;
    if (this.mode === "down")
      throw new Error("connect ECONNREFUSED redis:6379");
    if (this.mode === "hang") return new Promise<never>(() => {});
    return null;
  }
  async increment(k: string) {
    await this.gate();
    return this.inner.increment(k);
  }
  async decrement(k: string) {
    await this.gate();
    return this.inner.decrement(k);
  }
  async resetKey(k: string) {
    await this.gate();
    return this.inner.resetKey(k);
  }
}

async function serve(store: Store, max: number) {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 60_000,
      max,
      store,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
      keyGenerator: () => "same-client",
    }),
  );
  app.get("/x", (_q, r) => r.json({ ok: true }));
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(500).json({ err: e.message }),
  );
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const hit = async () => (await fetch(`${base}/x`)).status;
  return { hit, close: () => new Promise((r) => server.close(r)) };
}

beforeEach(() => {
  resetRateLimitStoreHealth();
  jest.clearAllMocks();
});

describe("Rate limiting during a Redis outage", () => {
  it("reference — the old wiring (Redis store used directly) returns 500 on every request", async () => {
    const redis = new FlakyRedisStore();
    redis.mode = "down";
    const app = await serve(redis, 100);
    try {
      expect(await app.hit()).toBe(500);
    } finally {
      await app.close();
    }
  });

  it("keeps serving (no 500) when Redis errors", async () => {
    const redis = new FlakyRedisStore();
    redis.mode = "down";
    const app = await serve(new FailoverStore("rl:t:", redis, 50), 100);
    try {
      for (let i = 0; i < 5; i++) expect(await app.hit()).toBe(200);
      expect(rateLimitStoreHealth().mode).toBe("memory");
    } finally {
      await app.close();
    }
  });

  it("still ENFORCES the limit while degraded (strict limiters stay strict)", async () => {
    const redis = new FlakyRedisStore();
    redis.mode = "down";
    const app = await serve(new FailoverStore("rl:auth:", redis, 50), 3);
    try {
      expect([await app.hit(), await app.hit(), await app.hit()]).toEqual([
        200, 200, 200,
      ]);
      expect(await app.hit()).toBe(429); // not unlimited
      expect(await app.hit()).toBe(429);
    } finally {
      await app.close();
    }
  });

  it("fails over on a HANGING Redis within the timeout instead of stalling requests", async () => {
    const redis = new FlakyRedisStore();
    redis.mode = "hang";
    const app = await serve(new FailoverStore("rl:t:", redis, 50), 100);
    try {
      const t0 = Date.now();
      expect(await app.hit()).toBe(200);
      expect(Date.now() - t0).toBeLessThan(1000);
    } finally {
      await app.close();
    }
  });

  it("opens a breaker: Redis is not called again until the breaker window passes", async () => {
    const redis = new FlakyRedisStore();
    redis.mode = "down";
    const app = await serve(new FailoverStore("rl:t:", redis, 50), 100);
    try {
      await app.hit();
      const after1 = redis.calls;
      for (let i = 0; i < 5; i++) await app.hit();
      expect(redis.calls).toBe(after1); // no hammering a dead Redis
    } finally {
      await app.close();
    }
  });

  it("recovers to Redis after the outage, logging degradation and recovery once each", async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    const redis = new FlakyRedisStore();
    redis.mode = "down";
    const app = await serve(new FailoverStore("rl:t:", redis, 50), 100);
    try {
      await app.hit();
      await app.hit();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      redis.mode = "up";
      now += 5_001; // breaker window (RATE_LIMIT_BREAKER_MS default 5 s)
      expect(await app.hit()).toBe(200);
      expect(rateLimitStoreHealth().mode).toBe("redis");
      expect(logger.info).toHaveBeenCalledWith(
        "rate limiting restored to Redis",
        expect.objectContaining({ degradedForMs: expect.any(Number) }),
      );
      const before = redis.calls;
      await app.hit();
      expect(redis.calls).toBe(before + 1); // counting in Redis again
    } finally {
      Date.now = realNow;
      await app.close();
    }
  });

  it("uses Redis normally when it is healthy (fallback untouched)", async () => {
    const redis = new FlakyRedisStore();
    const app = await serve(new FailoverStore("rl:t:", redis, 50), 2);
    try {
      expect([await app.hit(), await app.hit(), await app.hit()]).toEqual([
        200, 200, 429,
      ]);
      expect(redis.calls).toBe(3);
      expect(rateLimitStoreHealth().mode).toBe("redis");
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
