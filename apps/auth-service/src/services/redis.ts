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
const PREV_TOKEN_GRACE_SECONDS = 60;

export interface RefreshTokenMeta {
  token: string;
  tenantId: string | null;
  tenantRole: string | null;
  dbName: string | null;
}

export type TokenValidation =
  | { ok: false }
  | {
      ok: true;
      currentToken: string;
      tenantId: string | null;
      tenantRole: string | null;
      dbName: string | null;
    };

export const storeRefreshToken = async (
  userId: string,
  token: string,
  tenantId: string | null,
  tenantRole: string | null,
  previousToken?: string,
  dbName: string | null = null,
): Promise<void> => {
  const client = getRedisClient();
  const meta: RefreshTokenMeta = { token, tenantId, tenantRole, dbName };
  const ops: Promise<any>[] = [
    client.setex(`refresh:${userId}`, REFRESH_TTL, JSON.stringify(meta)),
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
  const raw = await client.get(`refresh:${userId}`);

  let meta: RefreshTokenMeta | null = null;

  if (raw !== null) {
    try {
      // Support both legacy plain-string tokens and new JSON format.
      const parsed = JSON.parse(raw);
      meta = parsed as RefreshTokenMeta;
      meta.dbName ??= null;
    } catch {
      // Legacy: raw value is the token string itself (no tenant info yet).
      meta = { token: raw, tenantId: null, tenantRole: null, dbName: null };
    }
  }

  if (meta === null) {
    // Redis miss — fall back to MongoDB
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true, tenantId: true },
    });
    if (user?.refreshToken) {
      meta = {
        token: user.refreshToken,
        tenantId: user.tenantId ?? null,
        tenantRole: null,
        dbName: null,
      };
      await client
        .setex(`refresh:${userId}`, REFRESH_TTL, JSON.stringify(meta))
        .catch(() => {});
    }
  }

  if (!meta) return { ok: false };

  if (meta.token === token) {
    return {
      ok: true,
      currentToken: token,
      tenantId: meta.tenantId,
      tenantRole: meta.tenantRole,
      dbName: meta.dbName,
    };
  }

  // Grace-period check
  if (meta.token !== null) {
    const prev = await client.get(`refresh-prev:${userId}`);
    if (prev === token) {
      return {
        ok: true,
        currentToken: meta.token,
        tenantId: meta.tenantId,
        tenantRole: meta.tenantRole,
        dbName: meta.dbName,
      };
    }
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
