import Redis from "ioredis";
import { logger } from "@hrms/logger";
import { prisma } from "@hrms/db";

let redis: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    redis.on("error", (err) => logger.error("Redis error:", { err }));
    redis.on("connect", () => logger.info("Redis connected"));
  }
  return redis;
};

const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export const storeRefreshToken = async (
  userId: string,
  token: string,
): Promise<void> => {
  await Promise.all([
    getRedisClient().setex(`refresh:${userId}`, REFRESH_TTL, token),
    prisma.user.update({
      where: { id: userId },
      data: { refreshToken: token },
    }),
  ]);
};

export const validateRefreshToken = async (
  userId: string,
  token: string,
): Promise<boolean> => {
  const client = getRedisClient();
  let stored = await client.get(`refresh:${userId}`);

  if (stored === null) {
    // Redis miss (e.g. after a restart) — fall back to MongoDB
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true },
    });
    stored = user?.refreshToken ?? null;

    // Warm the cache so subsequent calls hit Redis
    if (stored) {
      await client
        .setex(`refresh:${userId}`, REFRESH_TTL, stored)
        .catch(() => {});
    }
  }

  return stored === token;
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  await Promise.all([
    getRedisClient().del(`refresh:${userId}`),
    prisma.user.update({ where: { id: userId }, data: { refreshToken: null } }),
  ]);
};
