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

// Atomically checks the presented token against the current record (and the
// grace-period record) and, if it's the current one, rotates it — all as a
// single Redis script execution. This used to be two separate round-trips
// (validateRefreshToken, then storeRefreshToken) with a gap in between where
// two concurrent refreshes presenting the same still-valid token could BOTH
// read "I'm current" before either wrote, then each mint and store their own
// new token — the second write clobbers the first everywhere it's recorded
// (the current-token key *and* the one grace slot), permanently orphaning the
// first caller's new token with nothing left to validate it against. Its very
// next use then fails as "revoked" even though it was never actually
// compromised — just a normal race between two tabs/components refreshing
// around the same moment. Doing the compare-and-rotate inside one atomic
// script closes the gap: Redis serializes script executions, so whichever
// request runs second sees the *other's* already-rotated record and correctly
// defers to it via the grace slot instead of racing to overwrite it.
//
// Return shape (via EVAL): [flag, token, meta]
//   flag  1 -> presented token was current; rotated, `token`/`meta` are new
//   flag  0 -> presented token matched the grace slot; rotation already
//              happened elsewhere, `token`/`meta` are whatever that was
//   flag -1 -> no current record cached (missing or unparseable) — caller
//              should try the Mongo fallback and retry once
//   flag -2 -> a current record exists but the token matches neither it nor
//              the grace slot — genuinely invalid, no Mongo retry
const ROTATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return {-1, '', ''}
end
local ok, meta = pcall(cjson.decode, raw)
if not ok then
  return {-1, '', ''}
end
if meta.tokenHash == ARGV[1] then
  meta.tokenHash = ARGV[2]
  local newMetaJson = cjson.encode(meta)
  redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), newMetaJson)
  local grace = cjson.encode({prevTokenHash = ARGV[1], newToken = ARGV[4]})
  redis.call('SETEX', KEYS[2], tonumber(ARGV[5]), grace)
  return {1, ARGV[4], newMetaJson}
end
local graceRaw = redis.call('GET', KEYS[2])
if graceRaw then
  local gok, grace2 = pcall(cjson.decode, graceRaw)
  if gok and grace2.prevTokenHash == ARGV[1] then
    return {0, grace2.newToken, raw}
  end
end
return {-2, '', ''}
`;

const evalRotate = (
  client: ReturnType<typeof getRedisClient>,
  userId: string,
  presentedHash: string,
  newHash: string,
  newToken: string,
) =>
  client.eval(
    ROTATE_SCRIPT,
    2,
    `refresh:${userId}`,
    `refresh-prev:${userId}`,
    presentedHash,
    newHash,
    String(REFRESH_TTL),
    newToken,
    String(PREV_TOKEN_GRACE_SECONDS),
  ) as Promise<[number, string, string]>;

export const rotateRefreshToken = async (
  userId: string,
  presentedToken: string,
  newToken: string,
): Promise<TokenValidation> => {
  const client = getRedisClient();
  const presentedHash = hashToken(presentedToken);
  const newHash = hashToken(newToken);

  let [flag, tokenOut, metaJson] = await evalRotate(
    client,
    userId,
    presentedHash,
    newHash,
    newToken,
  );

  if (flag === -1) {
    // No usable cache entry — fall back to MongoDB once (cold cache, or a
    // pre-hash-migration miss), warm the cache, then retry the atomic rotate.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true, tenantId: true },
    });
    if (user?.refreshToken) {
      const seedMeta: RefreshTokenMeta = {
        tokenHash: user.refreshToken,
        tenantId: user.tenantId ?? null,
        tenantRole: null,
        dbName: null,
      };
      await client
        .setex(`refresh:${userId}`, REFRESH_TTL, JSON.stringify(seedMeta))
        .catch(() => {});
      [flag, tokenOut, metaJson] = await evalRotate(
        client,
        userId,
        presentedHash,
        newHash,
        newToken,
      );
    }
  }

  if (flag !== 1 && flag !== 0) return { ok: false };

  const meta = JSON.parse(metaJson) as RefreshTokenMeta;
  meta.dbName ??= null;
  meta.orgSetupComplete ??= true;

  if (flag === 1) {
    // We won the rotation — mirror the new hash onto the Mongo fallback column.
    await prisma.user
      .update({ where: { id: userId }, data: { refreshToken: newHash } })
      .catch(() => {});
  }

  return {
    ok: true,
    currentToken: tokenOut,
    tenantId: meta.tenantId,
    tenantRole: meta.tenantRole,
    dbName: meta.dbName,
    orgSetupComplete: meta.orgSetupComplete,
  };
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
