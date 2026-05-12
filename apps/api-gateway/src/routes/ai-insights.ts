import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/ai-insights";

export const aiInsightsRouter: Router = Router();

aiInsightsRouter.post("/ai-insights", authenticate, h.generateInsights);
