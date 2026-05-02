import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";

export const defaultLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  // /profile is called on every page load and tab focus — exempt it
  skip: (req) => req.path === "/profile",
});
