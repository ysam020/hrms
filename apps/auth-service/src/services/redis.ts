import Redis from "ioredis";
import { logger } from "@hrms/logger";

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    redis.on("error", (err) => logger.error("Redis error:", { err }));
    redis.on("connect", () => logger.info("Redis connected"));
  }
  return redis;
};

export const storeRefreshToken = async (
  userId: string,
  token: string,
): Promise<void> => {
  const client = getRedisClient();
  const expiry = 7 * 24 * 60 * 60; // 7 days
  await client.setex(`refresh:${userId}`, expiry, token);
};

export const validateRefreshToken = async (
  userId: string,
  token: string,
): Promise<boolean> => {
  const client = getRedisClient();
  const stored = await client.get(`refresh:${userId}`);
  return stored === token;
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  const client = getRedisClient();
  await client.del(`refresh:${userId}`);
};
