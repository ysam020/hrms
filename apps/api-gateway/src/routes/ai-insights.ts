import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, authorize } from "../middleware/authenticate";
import * as h from "../handlers/ai-insights";

const aiInsightsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const aiInsightsRouter: Router = Router();

aiInsightsRouter.post(
  "/ai-insights",
  aiInsightsLimiter,
  authenticate,
  authorize("owner", "admin", "hr"),
  h.generateInsights,
);
