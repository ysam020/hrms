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
// How long a just-rotated token remains accepted (handles network retries where
// the client sent the request but never received the rotated response).
const PREV_TOKEN_GRACE_SECONDS = 60;

export type TokenValidation =
  | { ok: false }
  | { ok: true; currentToken: string };

export const storeRefreshToken = async (
  userId: string,
  token: string,
  previousToken?: string,
): Promise<void> => {
  const client = getRedisClient();
  const ops: Promise<any>[] = [
    client.setex(`refresh:${userId}`, REFRESH_TTL, token),
    prisma.user.update({
      where: { id: userId },
      data: { refreshToken: token },
    }),
  ];
  if (previousToken) {
    ops.push(
      client
        .setex(
          `refresh-prev:${userId}`,
          PREV_TOKEN_GRACE_SECONDS,
          previousToken,
        )
        .catch(() => {}),
    );
  }
  await Promise.all(ops);
};

export const validateRefreshToken = async (
  userId: string,
  token: string,
): Promise<TokenValidation> => {
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

  if (stored === token) return { ok: true, currentToken: token };

  // Grace-period check: the client may have sent this token just before it was
  // rotated, then failed to receive the response. Allow retries for
  // PREV_TOKEN_GRACE_SECONDS after rotation by returning the current valid token.
  if (stored !== null) {
    const prev = await client.get(`refresh-prev:${userId}`);
    if (prev === token) return { ok: true, currentToken: stored };
  }

  return { ok: false };
};

export const revokeRefreshToken = async (userId: string): Promise<void> => {
  await Promise.all([
    getRedisClient().del(`refresh:${userId}`),
    getRedisClient().del(`refresh-prev:${userId}`),
    prisma.user.update({ where: { id: userId }, data: { refreshToken: null } }),
  ]);
};
