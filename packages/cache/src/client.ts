import Redis from "ioredis";
import { logger } from "@hrms/logger";

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    redis.on("error", (err) => logger.error("Cache Redis error:", { err }));
    redis.on("connect", () => logger.info("Cache Redis connected"));
  }
  return redis;
};
