import { createHash } from "crypto";
import { Response, NextFunction } from "express";
import { getRedisClient } from "@hrms/cache";
import { logger } from "@hrms/logger";
import { AuthRequest } from "./authenticate";

// Idempotency-Key support for mutations (used by the web app's offline
// queue, which may retry a request whose response never arrived).
//
// A client sends `Idempotency-Key: <random id>` on a POST/PUT/PATCH/DELETE.
// The first request with that key claims it in Redis and runs normally; its
// response is stored for 24 hours. A retry with the same key and the same
// request (method, path and body) gets the stored response back without the
// handler running again. The key is scoped to the authenticated tenant and
// user, so one user's key can never replay another user's response.
//
//  - A retry while the first request is still running gets 409 + Retry-After.
//  - The same key with a different request gets 422 (a client bug).
//  - Responses that a later retry could legitimately change (5xx, 401, 403,
//    408, 429) are not stored: the key is released so the retry runs.
//  - Requests without the header are untouched.
//
// If Redis is unavailable the middleware fails open (logs and continues), the
// same posture as the rest of the gateway's Redis-backed features; the
// offline queue then falls back to at-least-once delivery for that request.

export const IDEMPOTENCY_HEADER = "idempotency-key";
const RECORD_TTL_SECONDS = 24 * 60 * 60;
// A request that crashes mid-flight frees its key after this long.
const PENDING_TTL_SECONDS = 120;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
// Bodies larger than this are not stored; the replay then returns only the
// status and a minimal body.
const MAX_STORED_BODY_BYTES = 64 * 1024;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const TRANSIENT = new Set([401, 403, 408, 429]);

interface StoredRecord {
  state: "pending" | "done";
  fp: string;
  status?: number;
  body?: unknown;
}

function fingerprint(req: AuthRequest): string {
  return createHash("sha256")
    .update(req.method)
    .update(" ")
    .update(req.originalUrl.split("?")[0])
    .update(" ")
    .update(JSON.stringify(req.body ?? null))
    .digest("hex");
}

export function idempotency(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const key = req.get(IDEMPOTENCY_HEADER);
  if (!key || !MUTATING.has(req.method)) return next();
  // The subscription guard is mounted once per router (routes/index.ts), so
  // a request can pass through here several times; only the first counts.
  const marked = req as AuthRequest & { idempotencyChecked?: boolean };
  if (marked.idempotencyChecked) return next();
  marked.idempotencyChecked = true;
  if (!KEY_PATTERN.test(key)) {
    return res.status(400).json({
      success: false,
      code: "IDEMPOTENCY_KEY_INVALID",
      message: "Idempotency-Key must be 16–128 letters, digits, - or _.",
    });
  }
  const user = req.user;
  if (!user?.userId) return next();

  const redisKey = `idem:${user.tenantId ?? "none"}:${user.userId}:${key}`;
  const fp = fingerprint(req);

  let redis: ReturnType<typeof getRedisClient>;
  try {
    redis = getRedisClient();
  } catch (err) {
    logger.warn("idempotency: redis unavailable, continuing", { err });
    return next();
  }

  (async () => {
    const pending: StoredRecord = { state: "pending", fp };
    const claimed = await redis.set(
      redisKey,
      JSON.stringify(pending),
      "EX",
      PENDING_TTL_SECONDS,
      "NX",
    );

    if (!claimed) {
      const raw = await redis.get(redisKey);
      const rec: StoredRecord | null = raw ? JSON.parse(raw) : null;
      if (!rec) {
        // Expired between the two calls: ask the client to try again.
        res.set("Retry-After", "1");
        return res.status(409).json({
          success: false,
          code: "IDEMPOTENCY_IN_PROGRESS",
          message: "This request is already being processed. Try again.",
        });
      }
      if (rec.fp !== fp) {
        return res.status(422).json({
          success: false,
          code: "IDEMPOTENCY_KEY_REUSED",
          message:
            "This Idempotency-Key was already used for a different request.",
        });
      }
      if (rec.state === "pending") {
        res.set("Retry-After", "2");
        return res.status(409).json({
          success: false,
          code: "IDEMPOTENCY_IN_PROGRESS",
          message: "This request is already being processed. Try again.",
        });
      }
      res.set("Idempotent-Replayed", "true");
      return res
        .status(rec.status ?? 200)
        .json(rec.body ?? { success: true, replayed: true });
    }

    // We own the key: run the handler and remember what it answered.
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      redis
        .del(redisKey)
        .catch((err) => logger.warn("idempotency: release failed", { err }));
    };
    const store = (status: number, body: unknown) => {
      if (settled) return;
      settled = true;
      if (status >= 500 || TRANSIENT.has(status)) {
        redis.del(redisKey).catch(() => {});
        return;
      }
      let stored: unknown = body;
      try {
        if (JSON.stringify(body ?? null).length > MAX_STORED_BODY_BYTES)
          stored = undefined;
      } catch {
        stored = undefined;
      }
      const rec: StoredRecord = { state: "done", fp, status, body: stored };
      redis
        .set(redisKey, JSON.stringify(rec), "EX", RECORD_TTL_SECONDS)
        .catch((err) => logger.warn("idempotency: store failed", { err }));
    };

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      store(res.statusCode, body);
      return originalJson(body);
    };
    // Responses that bypass res.json (send/end/stream) are not replayable:
    // free the key once they finish so a retry runs normally.
    res.on("finish", release);
    res.on("close", release);
    next();
  })().catch((err) => {
    logger.warn("idempotency: check failed, continuing", { err });
    if (!res.headersSent) next();
  });
}
