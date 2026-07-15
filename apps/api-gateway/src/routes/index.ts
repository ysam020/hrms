import { Router } from "express";
import { authRouter } from "./auth";
import { tenantRouter } from "./tenant";
import { userRouter } from "./user";
import { employeeRouter } from "./employee";
import { attendanceRouter } from "./attendance";
import { leaveRouter } from "./leave";
import { recruitmentRouter, publicRecruitmentRouter } from "./recruitment";
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
import { approvalChainsRouter } from "./approvalChains";
import { leavePolicyRouter } from "./leavePolicy";
import { overtimeRouter } from "./overtime";
import { noticePeriodPoliciesRouter } from "./noticePeriodPolicies";
import { exitPolicyRouter } from "./exitPolicy";
import { interviewPipelinesRouter } from "./interviewPipelines";
import { payrollComponentsRouter } from "./payrollComponents";
import { taxDeclarationRouter } from "./taxDeclaration";
import { orgStructureRouter } from "./orgStructure";
import { onboardingRouter } from "./onboarding";
// ── New features ──────────────────────────────────────────────────────────────
import { payrollRouter } from "./payroll";
import { performanceReviewRouter } from "./performanceReview";
import { assetsRouter } from "./assets";
import { wfhRouter } from "./wfh";
import { helpdeskRouter } from "./helpdesk";
import { webhooksRouter } from "./webhooks";
import { reportsRouter } from "./reports";
import { authLimiter, defaultLimiter } from "../middleware/rateLimiter";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { authenticate, requireTenant } from "../middleware/authenticate";

export const rootRouter: Router = Router();

rootRouter.use(authLimiter, authRouter);
rootRouter.use(defaultLimiter, tenantRouter);
rootRouter.use(defaultLimiter, paymentRouter);

// Anonymous careers-page routes — deliberately mounted with NO
// authenticate/requireTenant/subscription guard. Tenant is resolved from the
// :slug path param by resolvePublicTenant (see routes/recruitment.ts). Rate
// limiting is already applied globally by path regex (PUBLIC_ROUTES_REGEX in
// config/rateLimiters.ts), so no limiter is attached here.
rootRouter.use(publicRecruitmentRouter);

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
rootRouter.use(...subscriptionGuard, approvalChainsRouter);
rootRouter.use(...subscriptionGuard, leavePolicyRouter);
rootRouter.use(...subscriptionGuard, overtimeRouter);
rootRouter.use(...subscriptionGuard, noticePeriodPoliciesRouter);
rootRouter.use(...subscriptionGuard, exitPolicyRouter);
rootRouter.use(...subscriptionGuard, interviewPipelinesRouter);
rootRouter.use(...subscriptionGuard, payrollComponentsRouter);
rootRouter.use(...subscriptionGuard, orgStructureRouter);
rootRouter.use(...subscriptionGuard, onboardingRouter);
// ── New feature routers ───────────────────────────────────────────────────────
rootRouter.use("/payroll", ...subscriptionGuard, payrollRouter);
rootRouter.use(
  "/performance-reviews",
  ...subscriptionGuard,
  performanceReviewRouter,
);
rootRouter.use("/assets", ...subscriptionGuard, assetsRouter);
rootRouter.use("/wfh", ...subscriptionGuard, wfhRouter);
rootRouter.use("/helpdesk", ...subscriptionGuard, helpdeskRouter);
rootRouter.use("/webhooks", ...subscriptionGuard, webhooksRouter);
rootRouter.use("/reports", ...subscriptionGuard, reportsRouter);
rootRouter.use("/tax-declarations", ...subscriptionGuard, taxDeclarationRouter);
