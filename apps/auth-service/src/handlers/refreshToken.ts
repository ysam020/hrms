import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import {
  peekRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../services/redis";
import { checkAccountAccess, isAccountAccessUnavailable } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const PEEK_TIMEOUT_MS = Number(process.env.REFRESH_PEEK_TIMEOUT_MS) || 2_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error("timeout"), { kind: "timeout" })),
        ms,
      );
      timer.unref?.();
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

export const refreshToken = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { refreshToken: token } = call.request;
    const t0 = performance.now();
    const rotationTimings = { redisMs: 0, mongoMs: 0 };

    const payload = verifyRefreshToken(token);
    if (!payload) {
      return callback(null, {
        message: MESSAGES.INVALID_REFRESH_TOKEN,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    // Every step that can fail for INFRASTRUCTURE reasons runs before
    // the irreversible rotation. Order:
    //   1. peek (read-only): is the token current/grace, and whose tenant?
    //   2. authoritative account check (bounded) for that tenant
    //   3. only then rotate (atomic Lua; concurrent refreshes resolved there)
    // A Redis/Mongo failure or timeout in 1–2 answers UNAVAILABLE and leaves
    // the session exactly as it was — the client retries with the same,
    // still-valid token. Nothing is granted without a completed check.
    const unavailable = (stage: string, err: unknown) => {
      logger.warn("RefreshToken: dependency unavailable; session untouched", {
        stage,
        kind: (err as { kind?: string })?.kind ?? "error",
      });
      return callback(null, {
        message: MESSAGES.SERVICE_UNAVAILABLE,
        status: status.UNAVAILABLE,
        accessToken: "",
        refreshToken: "",
      });
    };

    let peek: Awaited<ReturnType<typeof peekRefreshToken>>;
    try {
      // Bounded: the shared ioredis client has no command timeout, so a
      // stalled (not refusing) Redis would otherwise hang this call.
      peek = await withTimeout(
        peekRefreshToken(payload.userId, token),
        PEEK_TIMEOUT_MS,
      );
    } catch (err) {
      return unavailable("peek", err);
    }
    if (peek.state === "invalid") {
      return callback(null, {
        message: MESSAGES.REFRESH_TOKEN_REVOKED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    // The refresh record's claims are
    // a login-time snapshot. Renewal re-checks the person against the
    // database: blocked status, removed membership or a deactivated
    // organisation ends the session; the new access token carries the
    // CURRENT role and database.
    let access: Awaited<ReturnType<typeof checkAccountAccess>>;
    try {
      access = await checkAccountAccess(payload.userId, peek.tenantId);
    } catch (err) {
      if (isAccountAccessUnavailable(err)) return unavailable("account", err);
      throw err;
    }
    if (!access.ok) {
      // A real denial (not an outage): kill the refresh token too.
      await revokeRefreshToken(payload.userId).catch((err) =>
        logger.warn("RefreshToken: revoke after denied renewal failed", {
          err,
        }),
      );
      logger.info("RefreshToken: renewal refused", { reason: access.reason });
      return callback(null, {
        message: MESSAGES.ACCESS_DENIED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    // The candidate token is generated up front and handed to
    // rotateRefreshToken(), which atomically decides whether this request
    // is the one that actually gets to rotate (see refreshTokenStore.ts) —
    // a concurrent refresh (another tab, a retried request) presenting the
    // same token can't race this into two independently-stored tokens with
    // one left orphaned. If this call loses that race, the candidate below
    // is simply discarded and the winner's token is returned instead.
    const candidateRefreshToken = signRefreshToken(payload.userId);
    const tSigned = performance.now();
    const rotation = await rotateRefreshToken(
      payload.userId,
      token,
      candidateRefreshToken,
      rotationTimings,
    );
    if (!rotation.ok) {
      // Superseded between peek and rotation (logout, tenant switch).
      return callback(null, {
        message: MESSAGES.REFRESH_TOKEN_REVOKED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }
    if ((rotation.tenantId ?? null) !== (peek.tenantId ?? null)) {
      // Defensive: the record can only change tenant through a new login /
      // tenant switch, which replaces the token (so rotation above would
      // have failed). If it ever happens, the access token must not be
      // signed with a check made for a different organisation.
      logger.error("RefreshToken: tenant changed during renewal", {});
      return callback(null, {
        message: MESSAGES.REFRESH_TOKEN_REVOKED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    const newAccessToken = signAccessToken({
      userId: payload.userId,
      tenantId: rotation.tenantId,
      tenantRole: access.tenantRole,
      pendingSetup: !rotation.tenantId,
      orgSetupComplete: rotation.orgSetupComplete ?? true,
      dbName: access.dbName,
    });

    if (process.env.REQUEST_TIMING_LOG === "true") {
      // Phase durations only — never the tokens or their hashes.
      logger.info("refresh timing", {
        verifyAndSignMs: Math.round(tSigned - t0),
        redisMs: Math.round(rotationTimings.redisMs),
        mongoMs: Math.round(rotationTimings.mongoMs),
        totalMs: Math.round(performance.now() - t0),
      });
    }

    return callback(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: newAccessToken,
      refreshToken: rotation.currentToken,
    });
  } catch (err) {
    logger.error("RefreshToken error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
      refreshToken: "",
    });
  }
};
