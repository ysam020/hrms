import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  createCycleSchema,
  updateCycleSchema,
  updateCycleStatusSchema,
  submitSelfAssessmentSchema,
  submitManagerReviewSchema,
} from "../schemas";
import * as h from "../handlers/performanceReview";

export const performanceReviewRouter: Router = Router();

// ── Cycles ───────────────────────────────────────────────────────────────────
performanceReviewRouter.post(
  "/cycles",
  authenticate,
  validate(createCycleSchema),
  h.createCycle,
);
performanceReviewRouter.get("/cycles", authenticate, h.listCycles);
performanceReviewRouter.get("/cycles/:cycleId", authenticate, h.getCycle);
performanceReviewRouter.patch(
  "/cycles/:cycleId",
  authenticate,
  validate(updateCycleSchema),
  h.updateCycle,
);
performanceReviewRouter.patch(
  "/cycles/:cycleId/status",
  authenticate,
  validate(updateCycleStatusSchema),
  h.updateCycleStatus,
);

// ── Reviews ──────────────────────────────────────────────────────────────────
performanceReviewRouter.get("/", authenticate, h.listReviews);
performanceReviewRouter.get("/:reviewId", authenticate, h.getReview);
performanceReviewRouter.post(
  "/:reviewId/self-assessment",
  authenticate,
  validate(submitSelfAssessmentSchema),
  h.submitSelfAssessment,
);
performanceReviewRouter.post(
  "/:reviewId/manager-review",
  authenticate,
  validate(submitManagerReviewSchema),
  h.submitManagerReview,
);
