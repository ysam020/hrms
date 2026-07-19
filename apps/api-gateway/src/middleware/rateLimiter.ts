import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { redisStore } from "../config/rateLimiters";

// Previously used express-rate-limit's default in-process MemoryStore.
// These two guard nearly every authenticated business route (see
// subscriptionGuard in routes/index.ts) — an in-process counter there is
// meaningless the moment the gateway runs more than one replica: each
// replica enforces `max` independently, so the real effective limit is
// max × replica count, and every deploy silently resets every counter to
// zero. Sharing config/rateLimiters.ts's Redis-backed store fixes both.
// Distinct prefixes from that module's own limiters, since these guard a
// different (broader, authenticated-route) layer and must not share counters
// with it.
export const defaultLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:mw-default:"),
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:mw-auth:"),
});
