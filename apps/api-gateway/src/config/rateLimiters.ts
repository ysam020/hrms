import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Application } from "express";
import jwt from "jsonwebtoken";
import { getRedisClient } from "@hrms/cache";

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
    sendCommand: (...args: string[]) => {
      const [command, ...rest] = args;
      return getRedisClient().call(command, ...rest) as any;
    },
  });
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
  max: 1000,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:auth:"),
});

// Profile returns full PII — apply a dedicated limit instead of exempting it.
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:profile:"),
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10000,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:general:"),
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2500,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:public:"),
});

export function applyRateLimiters(app: Application) {
  app.use(AUTH_ROUTES_REGEX, authLimiter);
  app.use("/api/v1/refresh-token", authLimiter);
  app.use("/api/v1/profile", profileLimiter);
  app.use(PUBLIC_ROUTES_REGEX, publicLimiter);
  app.use("/api", generalLimiter);
}
