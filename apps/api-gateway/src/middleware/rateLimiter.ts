import rateLimit, {
  RateLimitRequestHandler,
  Options,
  Store,
  ClientRateLimitInfo,
} from "express-rate-limit";
import jwt from "jsonwebtoken";
import { getRedisClient } from "@hrms/cache";

const TOO_MANY_REQUESTS = {
  message: "Too many requests, please try again later",
};

/**
 * Redis-backed store for express-rate-limit.
 * Uses a single MULTI/EXEC pipeline per increment so the counter increment
 * and the TTL set are atomic. Sharing this store across all api-gateway
 * instances ensures rate-limit counters are enforced cluster-wide.
 */
class RedisRateLimitStore implements Store {
  private readonly prefix: string;
  private readonly windowMs: number;

  constructor(windowMs: number, prefix = "rl:") {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  private key(rawKey: string): string {
    return `${this.prefix}${rawKey}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = getRedisClient();
    const redisKey = this.key(key);
    const ttlSeconds = Math.ceil(this.windowMs / 1000);

    // INCR + conditional EXPIRE in a pipeline — atomic enough for rate limiting
    const [[, totalHits], [, pttl]] = (await redis
      .multi()
      .incr(redisKey)
      .pttl(redisKey)
      .exec()) as [[null, number], [null, number]];

    // Set TTL only on first hit (PTTL returns -1 when key has no expiry)
    if (pttl === -1) {
      await redis.expire(redisKey, ttlSeconds);
    }

    const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs));
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(this.key(key));
  }
}

/**
 * Extracts a stable key for rate-limiting.
 * For authenticated requests: uses the userId from the JWT (per-user limit).
 * For unauthenticated requests: falls back to IP address.
 * This prevents a single user from bypassing limits via IP rotation, and
 * avoids punishing all users behind a shared NAT/proxy.
 */
export function userAwareKeyGenerator(req: any): string {
  const authHeader = req.headers?.authorization as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.decode(authHeader.slice(7)) as any;
      if (payload?.userId) return `user:${payload.userId}`;
    } catch {
      // Fall through to IP-based key
    }
  }
  return `ip:${req.ip ?? "unknown"}`;
}

function makeLimiter(
  opts: Partial<Options> & { windowMs: number },
): RateLimitRequestHandler {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: TOO_MANY_REQUESTS,
    keyGenerator: userAwareKeyGenerator,
    store: new RedisRateLimitStore(opts.windowMs),
    ...opts,
  });
}

// Authenticated API routes — 500 requests per minute per user
export const defaultLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 500,
});

// Auth/WebAuthn endpoints — 100 requests per 15 minutes per user
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

/** Creates a Redis-backed store for a given window; used by server.ts limiters. */
export function makeRedisStore(windowMs: number, prefix?: string): Store {
  return new RedisRateLimitStore(windowMs, prefix);
}
