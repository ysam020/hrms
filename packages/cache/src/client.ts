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
