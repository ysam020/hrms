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
import { presenceRouter } from "./presence";
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
import { platformAdminRouter } from "./platformAdmin";
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

// defaultLimiter is mounted ONCE, path-less, so every request that gets past
// authRouter is counted exactly once. It used to be attached to each mount
// below (tenant, payment, support, walkthrough and every business router),
// and because path-less middleware runs for every request passing through,
// one request to a late-mounted business router was charged up to 29 times
// (docs/performance/api-performance-audit.md, finding B1). The set of
// requests it applies to is unchanged: everything not handled by authRouter.
rootRouter.use(defaultLimiter);
rootRouter.use(tenantRouter);
rootRouter.use(paymentRouter);

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
  authenticate,
  requireTenant,
  idempotency,
  supportRouter,
);
rootRouter.use(
  "/platform/support",
  authenticate,
  requireSupportAgent,
  idempotency,
  platformSupportRouter,
);
// The Praesto Platform Console: like the support console, no tenant
// subscription check — each route requires its own PraestoAdmin action
// (requirePlatformAdmin), which only Praesto's own organisation can hold.
rootRouter.use(
  "/platform/admin",
  authenticate,
  idempotency,
  platformAdminRouter,
);
// Walkthrough progress: authenticate + requireTenant but no subscription
// check (see routes/walkthrough.ts). It used to be mounted between the
// business routers, after 14 path-less subscription guards, which made it
// return 402 for lapsed organisations despite this intent.
rootRouter.use(
  "/walkthrough",
  authenticate,
  requireTenant,
  idempotency,
  walkthroughRouter,
);
// Availability (busy, in a meeting…): same reasoning as the walkthrough —
// no business data, read on every page, so no subscription check.
rootRouter.use(
  "/presence",
  authenticate,
  requireTenant,
  idempotency,
  presenceRouter,
);

// All business routes require an active subscription. The guard is applied
// once, to this one router, and every business router is mounted inside it
// in the original order. Mounting the guard path-less in front of each
// router (as before) made Express run it once per router until one matched:
// up to 27 authenticate + tenant subscription lookups per request, ~36 ms
// each (audit finding B1). An unknown /api/v1 path still has to pass the
// guard (401/402/403) before falling through to the 404, as it did before.
// idempotency runs last: it needs the authenticated user to scope keys, and
// only acts on mutations that carry an Idempotency-Key header.
const businessRouter: Router = Router();
businessRouter.use(
  authenticate,
  requireTenant,
  requireActiveSubscription,
  idempotency,
);

businessRouter.use(userRouter);
businessRouter.use(employeeRouter);
businessRouter.use(attendanceRouter);
businessRouter.use(leaveRouter);
businessRouter.use(recruitmentRouter);
businessRouter.use(hrmRouter);
businessRouter.use(salaryRouter);
businessRouter.use(notificationRouter);
businessRouter.use(generalRouter);
businessRouter.use(analyticsRoutesRouter);
businessRouter.use("/analytics", analyticsRouter);
businessRouter.use(permissionsRouter);
businessRouter.use(chatRouter);
businessRouter.use(aiConnectionsRouter);
businessRouter.use(dashboardRouter);
businessRouter.use(aiInsightsRouter);
businessRouter.use(tenantSettingsRouter);
businessRouter.use(approvalChainsRouter);
businessRouter.use(leavePolicyRouter);
businessRouter.use(overtimeRouter);
businessRouter.use(noticePeriodPoliciesRouter);
businessRouter.use(exitPolicyRouter);
businessRouter.use(interviewPipelinesRouter);
businessRouter.use(payrollComponentsRouter);
businessRouter.use(orgStructureRouter);
businessRouter.use(onboardingRouter);
businessRouter.use(bulkOnboardingRouter);
// ── New feature routers ───────────────────────────────────────────────────────
businessRouter.use("/payroll", payrollRouter);
businessRouter.use("/performance-reviews", performanceReviewRouter);
businessRouter.use("/assets", assetsRouter);
businessRouter.use("/wfh", wfhRouter);
businessRouter.use("/helpdesk", helpdeskRouter);
businessRouter.use("/reports", reportsRouter);
businessRouter.use("/tax-declarations", taxDeclarationRouter);

rootRouter.use(businessRouter);
