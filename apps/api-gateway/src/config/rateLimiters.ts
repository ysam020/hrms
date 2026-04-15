import rateLimit from "express-rate-limit";
import { Application } from "express";

const AUTH_ROUTES_REGEX =
  /^\/api\/(webauthn-login|webauthn-verify-login|webauthn-login-options|webauthn-credential-check|auth\/google)/;

const PUBLIC_ROUTES_REGEX =
  /^\/api\/(public\/careers|get-job-titles|apply-for-job)/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export function applyRateLimiters(app: Application) {
  app.use(AUTH_ROUTES_REGEX, authLimiter);
  app.use("/api/refresh-token", authLimiter);
  app.use(PUBLIC_ROUTES_REGEX, publicLimiter);
  app.use("/api", generalLimiter);
}
