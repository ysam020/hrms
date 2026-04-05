import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate";
import * as h from "../handlers/analytics";

export const analyticsRouter: Router = Router();

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
