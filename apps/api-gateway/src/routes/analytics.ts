import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, authorize } from "../middleware/authenticate";
import * as h from "../handlers/analytics";

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const analyticsRouter: Router = Router();

analyticsRouter.use(analyticsLimiter);

analyticsRouter.get(
  "/dashboard",
  authenticate,
  authorize("admin", "hr"),
  h.getDashboardStats,
);
analyticsRouter.get(
  "/headcount",
  authenticate,
  authorize("admin", "hr"),
  h.getHeadcount,
);
analyticsRouter.get(
  "/attendance",
  authenticate,
  authorize("admin", "hr"),
  h.getAttendanceAnalytics,
);
analyticsRouter.get(
  "/leave",
  authenticate,
  authorize("admin", "hr"),
  h.getLeaveAnalytics,
);
analyticsRouter.get(
  "/recruitment",
  authenticate,
  authorize("admin", "hr"),
  h.getRecruitmentAnalytics,
);
analyticsRouter.get(
  "/salary",
  authenticate,
  authorize("admin", "hr"),
  h.getSalaryAnalytics,
);
analyticsRouter.get(
  "/turnover",
  authenticate,
  authorize("admin", "hr"),
  h.getTurnoverAnalytics,
);
analyticsRouter.get(
  "/performance",
  authenticate,
  authorize("admin", "hr"),
  h.getPerformanceAnalytics,
);
