import {
  checkAccountAccess,
  isAccountAccessUnavailable,
  AccountAccessUnavailableError,
  type AccountAccess,
} from "@hrms/db";
import {
  logger,
  accountAccessChecksTotal,
  accountAccessCheckDuration,
} from "@hrms/logger";

/**
 * Per-process cache in front of the authoritative
 * `checkAccountAccess` (@hrms/db), consulted by `authenticate` on every
 * request and by Socket.IO (handshake + re-validation).
 *
 * Cache: the TTL is an ABSOLUTE age, not an idle timeout, so a revocation
 * written anywhere is honoured by every gateway worker within
 * ACCOUNT_ACCESS_TTL_MS; one written by this process immediately
 * (invalidateAccountAccess). It caches DECISIONS (allowed or denied) —
 * never a failure, and it never extends a decision past its TTL.
 *
 * Availability without failing open:
 *   - every uncached check is bounded (ACCOUNT_CHECK_TIMEOUT_MS, @hrms/db);
 *   - an infrastructure failure is surfaced as AccountAccessUnavailableError
 *     (callers answer 503 / "retry"), never as a denial and never as access;
 *   - after BREAKER_THRESHOLD consecutive failures the breaker opens for
 *     BREAKER_OPEN_MS: misses fail fast instead of piling abandoned reads
 *     onto a struggling database's connection pool. Fresh cached decisions
 *     are still served (they are within their normal TTL).
 */
const TTL_MS = Number(process.env.ACCOUNT_ACCESS_TTL_MS) || 30_000;
const MAX_ENTRIES = Number(process.env.ACCOUNT_ACCESS_CACHE_MAX) || 50_000;
const BREAKER_THRESHOLD =
  Number(process.env.ACCOUNT_ACCESS_BREAKER_THRESHOLD) || 5;
const BREAKER_OPEN_MS = Number(process.env.ACCOUNT_ACCESS_BREAKER_MS) || 5_000;
const SERVICE = process.env.SERVICE_NAME || "api-gateway";

interface Entry {
  loadedAt: number;
  result: Promise<AccountAccess>;
}

// Insertion-ordered Map used as a small LRU (no timers, so nothing keeps a
// process or a test alive). Bounded so a long-running gateway can't grow it
// without limit; see CACHE_AND_RATE_LIMIT_ANALYSIS.md for the sizing.
const cache = new Map<string, Entry>();

const breaker = { consecutiveFailures: 0, openUntil: 0 };

function count(result: string): void {
  accountAccessChecksTotal?.inc?.({ result, service: SERVICE });
}

const keyFor = (userId: string, tenantId: string | null | undefined) =>
  `${userId}:${tenantId ?? "-"}`;

function onSuccess(): void {
  if (breaker.consecutiveFailures >= BREAKER_THRESHOLD) {
    logger.info("account access checks recovered", {
      afterFailures: breaker.consecutiveFailures,
    });
  }
  breaker.consecutiveFailures = 0;
  breaker.openUntil = 0;
}

function onFailure(err: unknown): void {
  const kind =
    (err as { kind?: string })?.kind === "timeout" ? "timeout" : "error";
  count(`unavailable_${kind}`);
  breaker.consecutiveFailures++;
  if (breaker.consecutiveFailures === BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
    logger.warn("account access breaker OPEN: database checks failing", {
      consecutiveFailures: breaker.consecutiveFailures,
      openMs: BREAKER_OPEN_MS,
      kind,
    });
  } else if (breaker.consecutiveFailures > BREAKER_THRESHOLD) {
    // A failed probe after the window: keep it open.
    breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
  }
}

export function resolveAccountAccess(
  userId: string,
  tenantId: string | null | undefined,
): Promise<AccountAccess> {
  const key = keyFor(userId, tenantId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) {
    count("hit");
    return hit.result;
  }
  if (Date.now() < breaker.openUntil) {
    count("breaker_open");
    return Promise.reject(new AccountAccessUnavailableError("error"));
  }

  const started = performance.now();
  const result = checkAccountAccess(userId, tenantId).then(
    (access) => {
      accountAccessCheckDuration?.observe?.(
        { service: SERVICE },
        performance.now() - started,
      );
      onSuccess();
      count(access.ok ? "miss_allowed" : "miss_denied");
      return access;
    },
    (err) => {
      if (isAccountAccessUnavailable(err)) onFailure(err);
      throw err;
    },
  );
  const entry: Entry = { loadedAt: Date.now(), result };
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  // Failures are never cached.
  result.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return result;
}

/** Drops every cached decision for this user (all tenants) in this process. */
export function invalidateAccountAccess(userId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

/** Diagnostics for /health (no ids). */
export function accountAccessHealth() {
  return {
    cachedDecisions: cache.size,
    maxEntries: MAX_ENTRIES,
    breakerOpen: Date.now() < breaker.openUntil,
    consecutiveFailures: breaker.consecutiveFailures,
  };
}

/** Test hook. */
export function clearAccountAccessCache(): void {
  cache.clear();
  breaker.consecutiveFailures = 0;
  breaker.openUntil = 0;
}
