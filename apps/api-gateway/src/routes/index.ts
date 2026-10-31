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
import { aiConnectionsRouter } from "./aiConnections";
import { dashboardRouter } from "./dashboard";
import { walkthroughRouter } from "./walkthrough";
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
import { bulkOnboardingRouter } from "./bulkOnboarding";
// ── New features ──────────────────────────────────────────────────────────────
import { payrollRouter } from "./payroll";
import { performanceReviewRouter } from "./performanceReview";
import { assetsRouter } from "./assets";
import { wfhRouter } from "./wfh";
import { helpdeskRouter } from "./helpdesk";
import { reportsRouter } from "./reports";
import { supportRouter, platformSupportRouter } from "./support";
import { defaultLimiter } from "../middleware/rateLimiter";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { idempotency } from "../middleware/idempotency";
import { authenticate, requireTenant } from "../middleware/authenticate";
import { requireSupportAgent } from "../middleware/requireSupportAgent";

export const rootRouter: Router = Router();

// No limiter mounted here directly — config/rateLimiters.ts's
// applyRateLimiters(app) (registered globally in server.ts) already covers
// every route this router serves: AUTH_ROUTES_REGEX + a dedicated
// /refresh-token limiter for the actual auth-abuse-prone endpoints,
// profileLimiter for /profile, and generalLimiter as the floor for
// everything else under /api (logout, webauthn management for an
// already-authenticated user, etc.). A second authLimiter used to be
// mounted here too (rootRouter.use(authLimiter, authRouter) — note no path
// prefix, so it ran on literally every request through this router, not
// just auth ones), which under load turned out to be one of three
// overlapping Redis round-trips on every single request, contributing to
// Redis becoming CPU-saturated (single-threaded) and a shared source of
// latency across unrelated routes. Removed as pure duplication.
rootRouter.use(authRouter);
rootRouter.use(defaultLimiter, tenantRouter);
rootRouter.use(defaultLimiter, paymentRouter);

// Anonymous careers-page routes — deliberately mounted with NO
// authenticate/requireTenant/subscription guard. Tenant is resolved from the
// :slug path param by resolvePublicTenant (see routes/recruitment.ts). Rate
// limiting is already applied globally by path regex (PUBLIC_ROUTES_REGEX in
// config/rateLimiters.ts), so no limiter is attached here.
rootRouter.use(publicRecruitmentRouter);

// Support tickets to the Praesto team: tenant-scoped, but NOT behind the
// subscription guard — an organisation whose subscription lapsed must still
// be able to raise a billing issue. The platform console needs no tenant at
// all; requireSupportAgent is its only gate besides authentication.
rootRouter.use(
  "/support",
  defaultLimiter,
  authenticate,
  requireTenant,
  idempotency,
  supportRouter,
);
rootRouter.use(
  "/platform/support",
  defaultLimiter,
  authenticate,
  requireSupportAgent,
  idempotency,
  platformSupportRouter,
);

// All business routes require an active subscription.
// authenticate + requireTenant run again here (idempotent) so this guard
// has the tenant context it needs, then the router's own middleware runs.
// idempotency runs last: it needs the authenticated user to scope keys, and
// only acts on mutations that carry an Idempotency-Key header.
const subscriptionGuard = [
  defaultLimiter,
  authenticate,
  requireTenant,
  requireActiveSubscription,
  idempotency,
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
rootRouter.use(...subscriptionGuard, aiConnectionsRouter);
rootRouter.use(...subscriptionGuard, dashboardRouter);
rootRouter.use(
  "/walkthrough",
  defaultLimiter,
  authenticate,
  requireTenant,
  idempotency,
  walkthroughRouter,
);
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
rootRouter.use(...subscriptionGuard, bulkOnboardingRouter);
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
rootRouter.use("/reports", ...subscriptionGuard, reportsRouter);
rootRouter.use("/tax-declarations", ...subscriptionGuard, taxDeclarationRouter);
