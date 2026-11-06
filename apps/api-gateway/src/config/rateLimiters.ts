import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Application } from "express";
import jwt from "jsonwebtoken";
import { getRedisClient } from "@hrms/cache";
import { recordExternal } from "@hrms/db";
import { timed } from "../middleware/timed";

// Every limiter shares one Redis-backed store (prefixed per limiter so
// their counters don't collide) instead of express-rate-limit's default
// in-process Map. In-process counters are meaningless the moment the
// gateway runs more than one replica: with N replicas each enforces `max`
// independently, so the real effective limit is max × N, and every deploy
// silently resets every counter to zero. Redis makes the limit actually
// shared and durable across the fleet.
export function redisStore(prefix: string): Store {
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
  app.use((req, res, next) =>
    isApplicationWrite(req.method, req.originalUrl)
      ? applicationWriteLimiter(req, res, next)
      : next(),
  );
  app.use("/api", timed("rateLimit:general", generalLimiter));
}

export const isApplicationWrite = (method: string, url: string) =>
  method === "POST" && APPLICATION_WRITE_REGEX.test(url.split("?")[0]);
