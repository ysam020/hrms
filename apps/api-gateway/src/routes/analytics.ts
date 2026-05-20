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
  authorize("owner", "admin", "hr"),
  h.getDashboardStats,
);
analyticsRouter.get(
  "/headcount",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getHeadcount,
);
analyticsRouter.get(
  "/attendance",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getAttendanceAnalytics,
);
analyticsRouter.get(
  "/leave",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getLeaveAnalytics,
);
analyticsRouter.get(
  "/recruitment",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getRecruitmentAnalytics,
);
analyticsRouter.get(
  "/salary",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getSalaryAnalytics,
);
analyticsRouter.get(
  "/turnover",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getTurnoverAnalytics,
);
analyticsRouter.get(
  "/performance",
  authenticate,
  authorize("owner", "admin", "hr"),
  h.getPerformanceAnalytics,
);
