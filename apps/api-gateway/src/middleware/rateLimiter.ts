import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { redisStore } from "../config/rateLimiters";

// Previously used express-rate-limit's default in-process MemoryStore.
// Guards nearly every authenticated business route (see subscriptionGuard
// in routes/index.ts) — an in-process counter there is meaningless the
// moment the gateway runs more than one replica: each replica enforces
// `max` independently, so the real effective limit is max × replica count,
// and every deploy silently resets every counter to zero. Sharing
// config/rateLimiters.ts's Redis-backed store fixes both. Distinct prefix
// from that module's own limiters, since this guards a different (broader,
// authenticated-route) layer and must not share counters with it.
//
// A second limiter (authLimiter) used to live here too, mounted via
// rootRouter.use(authLimiter, authRouter) in routes/index.ts — note no path
// prefix, so despite the name it ran on literally every /api/v1 request,
// not just auth ones. That duplicated config/rateLimiters.ts's own
// properly-scoped authLimiter + generalLimiter, adding a third Redis
// round-trip to every single request. Under load-testing that stacked
// nicely with generalLimiter to keep Redis (single-threaded) pegged at
// ~190% CPU and became a shared source of latency across unrelated routes.
// Removed as pure duplication — see routes/index.ts.
export const defaultLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:mw-default:"),
});
