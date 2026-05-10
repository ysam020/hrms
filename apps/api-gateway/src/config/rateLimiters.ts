import rateLimit from "express-rate-limit";
import { Application } from "express";
import jwt from "jsonwebtoken";

// Use the authenticated user's ID when available, fall back to IP.
// Prevents a single corporate NAT address from exhausting the pool for an entire office.
// jwt.decode (not verify) is intentional here — we're only partitioning rate-limit
// buckets, not trusting the payload for authorization decisions.
const userOrIpKey = (req: any): string => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
  if (token) {
    try {
      const payload = jwt.decode(token) as { userId?: string } | null;
      if (payload?.userId) return `user:${payload.userId}`;
    } catch {}
  }
  return `ip:${req.ip ?? "unknown"}`;
};

const AUTH_ROUTES_REGEX =
  /^\/api\/v1\/(webauthn-login|webauthn-verify-login|webauthn-login-options|webauthn-credential-check|auth\/google)/;

const PUBLIC_ROUTES_REGEX =
  /^\/api\/v1\/(public\/careers|get-job-titles|apply-for-job)/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// Profile returns full PII — apply a dedicated limit instead of exempting it.
const profileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10000,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2500,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export function applyRateLimiters(app: Application) {
  app.use(AUTH_ROUTES_REGEX, authLimiter);
  app.use("/api/v1/refresh-token", authLimiter);
  app.use("/api/v1/profile", profileLimiter);
  app.use(PUBLIC_ROUTES_REGEX, publicLimiter);
  app.use("/api", generalLimiter);
}
