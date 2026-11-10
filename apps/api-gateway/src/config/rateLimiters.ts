import rateLimit, {
  ipKeyGenerator,
  MemoryStore,
  type IncrementResponse,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Application } from "express";
import jwt from "jsonwebtoken";
import { getRedisClient } from "@hrms/cache";
import { recordExternal } from "@hrms/db";
import {
  logger,
  rateLimitStoreDegraded,
  rateLimitStoreFailoversTotal,
} from "@hrms/logger";
import { timed } from "../middleware/timed";

// Every limiter shares one Redis-backed store (prefixed per limiter so
// their counters don't collide) instead of express-rate-limit's default
// in-process Map. In-process counters are meaningless the moment the
// gateway runs more than one replica: with N replicas each enforces `max`
// independently, so the real effective limit is max × N, and every deploy
// silently resets every counter to zero. Redis makes the limit actually
// shared and durable across the fleet.
//
// But Redis must not be a hard dependency of every request.
// express-rate-limit forwards a store error to next(err), so with Redis down
// EVERY /api request returned 500. redisStore() therefore returns a
// FailoverStore: Redis first; on an error or a slow answer, the SAME limit
// (same window, same max, same key) is enforced by an in-process
// MemoryStore until Redis is healthy again. Nothing is ever unlimited —
// auth, refresh, public and draft-recovery limits keep holding — the limit
// just becomes per gateway process (max × processes) for the outage.
export function redisStore(prefix: string): Store {
  return new FailoverStore(prefix, rawRedisStore(prefix));
}

function rawRedisStore(prefix: string): Store {
  return new RedisStore({
    prefix,
    sendCommand: async (...args: string[]) => {
      const [command, ...rest] = args;
      const started = performance.now();
      try {
        return (await getRedisClient().call(command, ...rest)) as any;
      } finally {
        recordExternal(
          "redis",
          `redis:ratelimit:${command.toLowerCase()}`,
          started,
          performance.now(),
        );
      }
    },
  });
}

// Per-limiter `max` override for the isolated load-testing stack
// (load-testing/README.md): RATE_LIMIT_MAX_<NAME>=<positive integer>, read
// once at startup. Ignored when NODE_ENV=production so a stray variable can
// never loosen production limits; anything that isn't a positive integer
// falls back to the coded default. Every override in effect is logged.
// ─── Failover ────────────────────────────────────────────────────

const METRIC_SERVICE = process.env.SERVICE_NAME || "api-gateway";
const REDIS_TIMEOUT_MS = Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS) || 200;
// After a failure, skip Redis for this long (one shared breaker — every
// limiter talks to the same Redis), then let the next call probe it.
const BREAKER_OPEN_MS = Number(process.env.RATE_LIMIT_BREAKER_MS) || 5_000;

interface StoreHealth {
  mode: "redis" | "memory";
  degradedSince: number | null;
  openUntil: number;
  failures: number;
  lastError: string | null;
}
const health: StoreHealth = {
  mode: "redis",
  degradedSince: null,
  openUntil: 0,
  failures: 0,
  lastError: null,
};

/** For /health and tests: whether limits are currently Redis-backed. */
export function rateLimitStoreHealth(): Readonly<StoreHealth> {
  return { ...health };
}
/** Test hook. */
export function resetRateLimitStoreHealth(): void {
  Object.assign(health, {
    mode: "redis",
    degradedSince: null,
    openUntil: 0,
    failures: 0,
    lastError: null,
  });
}

function recordFailure(err: unknown, prefix: string): void {
  const now = Date.now();
  health.failures++;
  health.openUntil = now + BREAKER_OPEN_MS;
  health.lastError = err instanceof Error ? err.message : String(err);
  if (health.mode === "redis") {
    health.mode = "memory";
    health.degradedSince = now;
    rateLimitStoreFailoversTotal?.inc?.({ service: METRIC_SERVICE });
    rateLimitStoreDegraded?.set?.({ service: METRIC_SERVICE }, 1);
    // Once per outage, not once per request.
    logger.warn(
      "rate limiting degraded to per-process memory: Redis unavailable",
      { limiter: prefix, error: health.lastError },
    );
  }
}

function recordSuccess(): void {
  if (health.mode === "memory") {
    logger.info("rate limiting restored to Redis", {
      degradedForMs: Date.now() - (health.degradedSince ?? Date.now()),
      failures: health.failures,
    });
  }
  if (health.mode === "memory")
    rateLimitStoreDegraded?.set?.({ service: METRIC_SERVICE }, 0);
  health.mode = "redis";
  health.degradedSince = null;
  health.failures = 0;
  health.lastError = null;
}

function withTimeout<T>(work: Promise<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`rate-limit store timeout after ${ms} ms`)),
      ms,
    );
    timer.unref?.();
    Promise.resolve(work).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class FailoverStore implements Store {
  readonly prefix: string;
  // Counters are shared across processes while Redis is up.
  readonly localKeys = false;
  private readonly fallback = new MemoryStore();

  constructor(
    prefix: string,
    /** The Redis store; public so wiring tests can check it is primary. */
    readonly primary: Store,
    private readonly timeoutMs = REDIS_TIMEOUT_MS,
  ) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    // The fallback gets the limiter's own window, so it enforces the same
    // limit. Primary init failures (e.g. script load with Redis down) are
    // the primary's own concern; increment() fails over regardless.
    this.fallback.init(options);
    try {
      const r = this.primary.init?.(options);
      if (r && typeof (r as Promise<void>).catch === "function")
        (r as Promise<void>).catch((err) => recordFailure(err, this.prefix));
    } catch (err) {
      recordFailure(err, this.prefix);
    }
  }

  private redisAvailable(): boolean {
    return Date.now() >= health.openUntil;
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (this.redisAvailable()) {
      try {
        const result = await withTimeout(
          this.primary.increment(key),
          this.timeoutMs,
        );
        recordSuccess();
        return result;
      } catch (err) {
        recordFailure(err, this.prefix);
      }
    }
    return this.fallback.increment(key);
  }

  async decrement(key: string): Promise<void> {
    // Best effort on both: the hit may have been counted by either store.
    this.fallback.decrement(key);
    if (!this.redisAvailable()) return;
    try {
      await withTimeout(this.primary.decrement(key), this.timeoutMs);
    } catch (err) {
      recordFailure(err, this.prefix);
    }
  }

  async resetKey(key: string): Promise<void> {
    this.fallback.resetKey(key);
    if (!this.redisAvailable()) return;
    try {
      await withTimeout(this.primary.resetKey(key), this.timeoutMs);
    } catch (err) {
      recordFailure(err, this.prefix);
    }
  }

  async shutdown(): Promise<void> {
    this.fallback.shutdown();
    await this.primary.shutdown?.();
  }
}

export function limitMax(name: string, fallback: number): number {
  const raw = process.env[`RATE_LIMIT_MAX_${name}`];
  if (raw === undefined || process.env.NODE_ENV === "production") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  console.warn(
    `[rate-limit] RATE_LIMIT_MAX_${name}=${value} overrides the default ${fallback}`,
  );
  return value;
}

// Use the authenticated user's ID when available, fall back to IP.
// Prevents a single corporate NAT address from exhausting the pool for an entire office.
// Must be jwt.verify, not jwt.decode: these limiters guard unauthenticated
// routes (login, credential-check, public job applications), so the
// Authorization header is fully attacker-controlled. Trusting an unverified
// payload lets an attacker mint a fresh, syntactically-valid-looking JWT
// with a rotating fake userId on every request and land in a brand-new
// rate-limit bucket each time — a complete bypass of the abuse control.
const userOrIpKey = (req: any): string => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
        algorithms: ["HS256"],
      }) as { userId?: string };
      if (payload?.userId) return `user:${payload.userId}`;
    } catch {}
  }
  return req.ip ? `ip:${ipKeyGenerator(req)}` : "ip:unknown";
};

const AUTH_ROUTES_REGEX =
  /^\/api\/v1\/(webauthn-login|webauthn-verify-login|webauthn-login-options|webauthn-credential-check|auth\/google)/;

const PUBLIC_ROUTES_REGEX =
  /^\/api\/v1\/(public\/careers|get-job-titles|apply-for-job)/;

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitMax("AUTH", 1000),
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:auth:"),
});

// Profile returns full PII — apply a dedicated limit instead of exempting it.
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: limitMax("PROFILE", 300),
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:profile:"),
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: limitMax("GENERAL", 10000),
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:general:"),
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitMax("PUBLIC", 2500),
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:public:"),
});

// Draft recovery sends email and checks 6-digit codes, so it gets a far
// tighter budget than the rest of the careers page: per IP, 10 requests per
// 15 minutes across both the "send code" and "verify code" calls. (Each code
// also dies after 5 wrong guesses — see services/careerApplications.ts.)
const draftRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitMax("DRAFT_RECOVERY", 10),
  keyGenerator: (req: any) =>
    req.ip ? `ip:${ipKeyGenerator(req)}` : "ip:unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in a few minutes." },
  store: redisStore("rl:draft-recovery:"),
});

// Creating drafts and submitting applications writes to the tenant's DB, so
// they're held well below the general public budget.
const applicationWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: limitMax("APPLY_WRITE", 60),
  keyGenerator: (req: any) =>
    req.ip ? `ip:${ipKeyGenerator(req)}` : "ip:unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:apply-write:"),
});

// The website's sales enquiry form stores personal details and sends two
// emails per new lead, so it gets the tightest budget: 5 per IP per hour.
const leadWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: limitMax("LEAD_WRITE", 5),
  keyGenerator: (req: any) =>
    req.ip ? `ip:${ipKeyGenerator(req)}` : "ip:unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Too many requests from this network. Try again later, or email hello@praesto.in.",
  },
  store: redisStore("rl:lead-write:"),
});
export const LEAD_WRITE_PATH = "/api/v1/public/leads";

export const DRAFT_RECOVERY_REGEX =
  /^\/api\/v1\/public\/careers\/[^/]+\/jobs\/[^/]+\/drafts\/recover/;
const APPLICATION_WRITE_REGEX =
  /^\/api\/v1\/(apply-for-job\/|public\/careers\/[^/]+\/(jobs\/[^/]+\/drafts$|drafts\/[^/]+\/submit$))/;

export function applyRateLimiters(app: Application) {
  app.use(AUTH_ROUTES_REGEX, authLimiter);
  app.use("/api/v1/refresh-token", authLimiter);
  app.use("/api/v1/profile", profileLimiter);
  app.use(PUBLIC_ROUTES_REGEX, publicLimiter);
  // Stricter budgets on top of the public one for the careers routes that
  // write or send email.
  app.use(DRAFT_RECOVERY_REGEX, draftRecoveryLimiter);
  app.use(LEAD_WRITE_PATH, (req, res, next) =>
    req.method === "POST" ? leadWriteLimiter(req, res, next) : next(),
  );
  app.use((req, res, next) =>
    isApplicationWrite(req.method, req.originalUrl)
      ? applicationWriteLimiter(req, res, next)
      : next(),
  );
  app.use("/api", timed("rateLimit:general", generalLimiter));
}

export const isApplicationWrite = (method: string, url: string) =>
  method === "POST" && APPLICATION_WRITE_REGEX.test(url.split("?")[0]);
