import { Router } from "express";
import { authRouter } from "./auth";
import { tenantRouter } from "./tenant";
import { userRouter } from "./user";
import { employeeRouter } from "./employee";
import { attendanceRouter } from "./attendance";
import { leaveRouter } from "./leave";
import { recruitmentRouter } from "./recruitment";
import { hrmRouter } from "./hrm";
import { salaryRouter } from "./salary";
import { notificationRouter } from "./notification";
import { generalRouter } from "./general";
import { analyticsRoutesRouter } from "./analyticsRoutes";
import { analyticsRouter } from "./analytics";
import { permissionsRouter } from "./permissions";
import { chatRouter } from "./chat";
import { chatbotRouter } from "./chatbot";
import { aiInsightsRouter } from "./ai-insights";
import { paymentRouter } from "./payment";
import { tenantSettingsRouter } from "./tenantSettings";
import { authLimiter, defaultLimiter } from "../middleware/rateLimiter";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { authenticate, requireTenant } from "../middleware/authenticate";

export const rootRouter: Router = Router();

rootRouter.use(authLimiter, authRouter);
rootRouter.use(defaultLimiter, tenantRouter);
rootRouter.use(defaultLimiter, paymentRouter);

// All business routes require an active subscription.
// authenticate + requireTenant run again here (idempotent) so this guard
// has the tenant context it needs, then the router's own middleware runs.
const subscriptionGuard = [
  defaultLimiter,
  authenticate,
  requireTenant,
  requireActiveSubscription,
];

rootRouter.use(...subscriptionGuard, userRouter);
rootRouter.use(...subscriptionGuard, employeeRouter);
rootRouter.use(...subscriptionGuard, attendanceRouter);
rootRouter.use(...subscriptionGuard, leaveRouter);
rootRouter.use(...subscriptionGuard, recruitmentRouter);
rootRouter.use(...subscriptionGuard, hrmRouter);
rootRouter.use(...subscriptionGuard, salaryRouter);
rootRouter.use(...subscriptionGuard, notificationRouter);
rootRouter.use(...subscriptionGuard, generalRouter);
rootRouter.use(...subscriptionGuard, analyticsRoutesRouter);
rootRouter.use("/analytics", ...subscriptionGuard, analyticsRouter);
rootRouter.use(...subscriptionGuard, permissionsRouter);
rootRouter.use(...subscriptionGuard, chatRouter);
rootRouter.use(...subscriptionGuard, chatbotRouter);
rootRouter.use(...subscriptionGuard, aiInsightsRouter);
rootRouter.use(...subscriptionGuard, tenantSettingsRouter);
