import Redis from "ioredis";
import crypto from "crypto";
import { logger } from "@hrms/logger";
import { prisma } from "@hrms/db";

/**
 * One-way hash for persisting a refresh token in MongoDB.
 * The raw JWT is high-entropy so SHA-256 (rather than bcrypt) is appropriate —
 * the same approach used by GitHub, Stripe, and Vercel for API tokens.
 * Redis always stores the raw token; only the MongoDB fallback needs the hash.
 */
const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

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
    // Redis: store raw token — direct comparison on the hot path
    getRedisClient().setex(`refresh:${userId}`, REFRESH_TTL, token),
    // MongoDB: store SHA-256 hash — plaintext never reaches the DB
    prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashToken(token) },
    }),
  ]);
};

export const validateRefreshToken = async (
  userId: string,
  token: string,
): Promise<boolean> => {
  const client = getRedisClient();
  const stored = await client.get(`refresh:${userId}`);

  if (stored !== null) {
    // Hot path: Redis holds the raw token — direct constant-time comparison
    return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(token));
  }

  // Redis miss (e.g. after a restart) — fall back to MongoDB hash comparison
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { refreshToken: true },
  });
  const storedHash = user?.refreshToken ?? null;
  if (!storedHash) return false;

  const tokenHash = hashToken(token);
  const valid = crypto.timingSafeEqual(
    Buffer.from(storedHash),
    Buffer.from(tokenHash),
  );

  // Warm Redis with the raw token on a successful DB-fallback hit
  if (valid) {
    await client.setex(`refresh:${userId}`, REFRESH_TTL, token).catch(() => {});
  }

  return valid;
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  await Promise.all([
    getRedisClient().del(`refresh:${userId}`),
    prisma.user.update({ where: { id: userId }, data: { refreshToken: null } }),
  ]);
};
