import Redis from "ioredis";
import { logger } from "@hrms/logger";
import { getRedisClient } from "./client";

/**
 * Cluster-wide account revocation signal.
 *
 * Any service that ends someone's access (termination, resignation taking
 * effect, deletion, membership removal, organisation suspension) publishes
 * here. Every API-gateway worker subscribes and, on receipt, immediately:
 *   - drops its cached account decisions for that person / tenant, and
 *   - closes that person's / tenant's sockets ("session-expired").
 *
 * The periodic re-validation and the cache TTL remain as the backstop for
 * changes made outside the application (direct database edits) and for a
 * lost pub/sub message. A subscriber that reconnects after an outage flushes
 * every cached decision, because revocations sent meanwhile were missed.
 */
export const ACCOUNT_REVOCATION_CHANNEL = "hrms:account:revoked";

export interface AccountRevocation {
  /** One person (all tenants unless tenantId is given). */
  userId?: string;
  /** One tenant (every member when userId is absent). */
  tenantId?: string | null;
  reason: string;
  at: number;
}

/**
 * Best-effort: never throws (the change that caused it is already
 * committed; the TTL backstop still applies). Returns whether Redis
 * accepted the publish.
 */
export async function publishAccountRevocation(
  r: Omit<AccountRevocation, "at">,
): Promise<boolean> {
  if (!r.userId && !r.tenantId) {
    logger.error("publishAccountRevocation: userId or tenantId required");
    return false;
  }
  try {
    await getRedisClient().publish(
      ACCOUNT_REVOCATION_CHANNEL,
      JSON.stringify({ ...r, at: Date.now() } satisfies AccountRevocation),
    );
    return true;
  } catch (err) {
    logger.error("publishAccountRevocation failed (TTL backstop applies)", {
      err,
      reason: r.reason,
    });
    return false;
  }
}

/**
 * Subscribes on a dedicated connection. `onResync` runs after every
 * RE-connect (not the first connect): revocations published while this
 * subscriber was disconnected were lost, so cached decisions must go.
 * Returns an unsubscribe/close function.
 */
export function subscribeAccountRevocations(
  onRevocation: (r: AccountRevocation) => void,
  onResync: () => void,
): () => Promise<void> {
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    retryStrategy: (times) => Math.min(times * 200, 5000),
    enableReadyCheck: false,
  });
  let connectedBefore = false;
  sub.on("error", (err) =>
    logger.warn("account revocation subscriber error", { err }),
  );
  sub.on("ready", () => {
    if (connectedBefore) {
      logger.warn(
        "account revocation subscriber reconnected — flushing cached decisions",
      );
      onResync();
    }
    connectedBefore = true;
  });
  sub.on("message", (_channel: string, message: string) => {
    try {
      const r = JSON.parse(message) as AccountRevocation;
      if (r && (r.userId || r.tenantId)) onRevocation(r);
    } catch (err) {
      logger.error("account revocation: bad message", { err });
    }
  });
  sub
    .subscribe(ACCOUNT_REVOCATION_CHANNEL)
    .catch((err) =>
      logger.error("account revocation subscribe failed", { err }),
    );
  return async () => {
    await sub.quit().catch(() => sub.disconnect());
  };
}
