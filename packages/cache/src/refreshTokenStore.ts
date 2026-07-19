import { createHash } from "node:crypto";
import { prisma } from "@hrms/db";
import { getRedisClient } from "./client";

// Single source of truth for refresh-token storage/validation, shared by
// auth-service (issues/rotates tokens) and api-gateway (issues tokens on
// tenant-switch/onboarding flows). Previously hand-copied in both services
// with drifted signatures — the gateway's copy took 6 params (dbName in
// position 5) while this one takes 7 (previousToken in position 5, dbName
// shifted to 6) — a call using the other's calling convention would
// silently corrupt dbName rather than throw.
//
// Tokens are stored as a SHA-256 hash, never the raw JWT: a read-only
// compromise of Redis, the Mongo mirror field, or a leaked backup must not
// yield a directly-replayable 30-day session. The client still holds and
// presents the real token; the server only ever needs to check that its
// hash matches what was issued, exactly like a password hash.

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days — matches REFRESH_TOKEN_EXPIRE default
const PREV_TOKEN_GRACE_SECONDS = 60;

export interface RefreshTokenMeta {
  tokenHash: string;
  tenantId: string | null;
  tenantRole: string | null;
  dbName: string | null;
  orgSetupComplete?: boolean;
}

// Grace-period record: a client that raced the rotation (concurrent tab, a
// retried request) may still present the just-rotated-out token for up to
// PREV_TOKEN_GRACE_SECONDS. It needs the ACTUAL new token back, not just a
// "yes it's fine" — a hash alone can't provide that, so this one record
// necessarily holds a raw value. The exposure window this trades for is
// deliberately narrow: 60 seconds, versus the token's full 30-day life in
// the hash-only record above, and the value is one the caller already
// received directly from the request that performed the rotation.
interface PrevTokenGrace {
  prevTokenHash: string;
  newToken: string;
}

export type TokenValidation =
  | { ok: false }
  | {
      ok: true;
      currentToken: string;
      tenantId: string | null;
      tenantRole: string | null;
      dbName: string | null;
      orgSetupComplete: boolean;
    };

export const storeRefreshToken = async (
  userId: string,
  token: string,
  tenantId: string | null,
  tenantRole: string | null,
  previousToken?: string,
  dbName: string | null = null,
  orgSetupComplete: boolean = true,
): Promise<void> => {
  const client = getRedisClient();
  const meta: RefreshTokenMeta = {
    tokenHash: hashToken(token),
    tenantId,
    tenantRole,
    dbName,
    orgSetupComplete,
  };
  const ops: Promise<any>[] = [
    client.setex(`refresh:${userId}`, REFRESH_TTL, JSON.stringify(meta)),
    prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashToken(token) },
    }),
  ];
  if (previousToken) {
    const grace: PrevTokenGrace = {
      prevTokenHash: hashToken(previousToken),
      newToken: token,
    };
    ops.push(
      client
        .setex(
          `refresh-prev:${userId}`,
          PREV_TOKEN_GRACE_SECONDS,
          JSON.stringify(grace),
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
  const tokenHash = hashToken(token);

  let meta: RefreshTokenMeta | null = null;

  if (raw !== null) {
    try {
      meta = JSON.parse(raw) as RefreshTokenMeta;
      meta.dbName ??= null;
      meta.orgSetupComplete ??= true;
    } catch {
      // Unparseable entry (or a pre-hash-migration plaintext value) — never
      // trust it as a token match. Treated as a cache miss below rather
      // than falling through to Mongo, since Mongo's own refreshToken
      // column is keyed by this same migration and would fail identically.
      meta = null;
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
        tokenHash: user.refreshToken,
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

  if (meta.tokenHash === tokenHash) {
    return {
      ok: true,
      currentToken: token,
      tenantId: meta.tenantId,
      tenantRole: meta.tenantRole,
      dbName: meta.dbName,
      orgSetupComplete: meta.orgSetupComplete ?? true,
    };
  }

  // Grace-period check
  const graceRaw = await client.get(`refresh-prev:${userId}`);
  if (graceRaw) {
    try {
      const grace = JSON.parse(graceRaw) as PrevTokenGrace;
      if (grace.prevTokenHash === tokenHash) {
        return {
          ok: true,
          currentToken: grace.newToken,
          tenantId: meta.tenantId,
          tenantRole: meta.tenantRole,
          dbName: meta.dbName,
          orgSetupComplete: meta.orgSetupComplete ?? true,
        };
      }
    } catch {
      // Unparseable grace record — fall through to rejection.
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

export const markOrgSetupComplete = async (userId: string): Promise<void> => {
  const client = getRedisClient();
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
};
