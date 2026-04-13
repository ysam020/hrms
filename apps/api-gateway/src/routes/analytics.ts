import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate";
import { makeRedisStore } from "../middleware/rateLimiter";
import rateLimit from "express-rate-limit";
import * as h from "../handlers/analytics";

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore(60 * 1000, "rl:analytics:"),
  message: { message: "Too many requests, please try again later" },
});

export const analyticsRouter: Router = Router();

analyticsRouter.use(analyticsLimiter);

analyticsRouter.get(
  "/dashboard",
  authenticate,
  authorize("admin", "hr"),
  h.validateDashboardStats,
  h.getDashboardStats,
);
analyticsRouter.get(
  "/headcount",
  authenticate,
  authorize("admin", "hr"),
  h.validateHeadcount,
  h.getHeadcount,
);
analyticsRouter.get(
  "/attendance",
  authenticate,
  authorize("admin", "hr"),
  h.validateAttendanceAnalytics,
  h.getAttendanceAnalytics,
);
analyticsRouter.get(
  "/leave",
  authenticate,
  authorize("admin", "hr"),
  h.validateLeaveAnalytics,
  h.getLeaveAnalytics,
);
analyticsRouter.get(
  "/recruitment",
  authenticate,
  authorize("admin", "hr"),
  h.validateRecruitmentAnalytics,
  h.getRecruitmentAnalytics,
);
analyticsRouter.get(
  "/salary",
  authenticate,
  authorize("admin", "hr"),
  h.validateSalaryAnalytics,
  h.getSalaryAnalytics,
);
analyticsRouter.get(
  "/turnover",
  authenticate,
  authorize("admin", "hr"),
  h.validateTurnoverAnalytics,
  h.getTurnoverAnalytics,
);
analyticsRouter.get(
  "/performance",
  authenticate,
  authorize("admin", "hr"),
  h.validatePerformanceAnalytics,
  h.getPerformanceAnalytics,
);
