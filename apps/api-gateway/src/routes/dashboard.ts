import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/dashboard";

// The Today dashboard. Mounted behind subscriptionGuard (authenticate +
// requireTenant + active subscription); each handler resolves the caller's
// capabilities itself — see docs/dashboard-role-matrix.md.
export const dashboardRouter: Router = Router();

dashboardRouter.get("/dashboard", authenticate, h.getDashboard);
dashboardRouter.get("/dashboard/data", authenticate, h.getDashboardData);
dashboardRouter.put(
  "/dashboard/preferences",
  authenticate,
  h.saveDashboardPreferences,
);
dashboardRouter.delete(
  "/dashboard/preferences",
  authenticate,
  h.resetDashboardPreferences,
);
