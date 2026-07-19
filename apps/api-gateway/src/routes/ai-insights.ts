import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, authorize } from "../middleware/authenticate";
import * as h from "../handlers/ai-insights";
import { redisStore } from "../config/rateLimiters";

// Redis-backed — this guards an LLM-backed endpoint where an in-process
// counter would let real usage scale to max × replica-count instead of the
// intended per-window ceiling, straight into API cost.
const aiInsightsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  store: redisStore("rl:ai-insights:"),
});

export const aiInsightsRouter: Router = Router();

aiInsightsRouter.post(
  "/ai-insights",
  aiInsightsLimiter,
  authenticate,
  authorize("owner", "admin", "hr"),
  h.generateInsights,
);
