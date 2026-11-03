import Redis from "ioredis";
import { logger } from "@hrms/logger";

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      // Exponential backoff: 200ms, 400ms, 800ms … capped at 5 s.
      retryStrategy: (times) => Math.min(times * 200, 5000),
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    redis.on("error", (err) => logger.error("Cache Redis error:", { err }));
    redis.on("connect", () => logger.info("Cache Redis connected"));
    redis.on("reconnecting", () => logger.warn("Cache Redis reconnecting"));
  }
  return redis;
};

let cacheRedis: Redis | null = null;

/**
 * A second connection for cache reads and fills only. The shared client
 * above queues commands while disconnected and retries each one, so during
 * a Redis outage every cache read waited ~1 s before giving up — a cache
 * must instead fail fast and let the caller go to the database. Kept
 * separate so refresh tokens, rate limits, idempotency and invalidations
 * (which must not be dropped) keep the retrying client.
 */
export const getCacheRedisClient = (): Redis => {
  if (!cacheRedis) {
    cacheRedis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      retryStrategy: (times) => Math.min(times * 200, 5000),
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      commandTimeout: Number(process.env.CACHE_REDIS_TIMEOUT_MS) || 100,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    cacheRedis.on("error", (err) =>
      logger.warn("Cache read Redis error:", { err }),
    );
  }
  return cacheRedis;
};
