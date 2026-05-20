import Redis from "ioredis";
import { logger } from "@hrms/logger";
import { prisma } from "@hrms/db";

let redis: Redis | null = null;

function getClient(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    redis.on("error", (err) => logger.error("Redis error (gateway):", { err }));
  }
  return redis;
}

const REFRESH_TTL = 7 * 24 * 60 * 60;
const PENDING_SUB_TTL = 7 * 24 * 60 * 60;

// Keeps refresh token metadata in sync with what the auth-service stores so
// that token rotation in the auth-service picks up the correct tenantId.
export async function storeRefreshToken(
  userId: string,
  token: string,
  tenantId: string,
  tenantRole: string,
  dbName: string | null = null,
  orgSetupComplete: boolean = true,
): Promise<void> {
  const meta = JSON.stringify({
    token,
    tenantId,
    tenantRole,
    dbName,
    orgSetupComplete,
  });
  await Promise.all([
    getClient().setex(`refresh:${userId}`, REFRESH_TTL, meta),
    prisma.user.update({
      where: { id: userId },
      data: { refreshToken: token },
    }),
  ]);
}

export async function storePendingSubscription(
  userId: string,
  subscriptionId: string,
  billing: string,
): Promise<void> {
  await getClient().setex(
    `pending_sub:${userId}`,
    PENDING_SUB_TTL,
    JSON.stringify({ subscriptionId, billing }),
  );
}

export async function getPendingSubscription(
  userId: string,
): Promise<{ subscriptionId: string; billing: string } | null> {
  const raw = await getClient().get(`pending_sub:${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearPendingSubscription(userId: string): Promise<void> {
  await getClient().del(`pending_sub:${userId}`);
}

export async function markOrgSetupComplete(userId: string): Promise<void> {
  const client = getClient();
  const raw = await client.get(`refresh:${userId}`);
  if (!raw) return;
  let meta: any;
  try {
    meta = JSON.parse(raw);
  } catch {
    return;
  }
  meta.orgSetupComplete = true;
  await client.setex(`refresh:${userId}`, REFRESH_TTL, JSON.stringify(meta));
}
