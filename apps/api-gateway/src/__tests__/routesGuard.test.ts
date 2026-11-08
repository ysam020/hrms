import express from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";

// Regression coverage for the gateway routing structure in routes/index.ts.
//
// The performance audit (docs/performance/api-performance-audit.md, finding
// B1) found subscriptionGuard mounted path-less in front of every business
// router, so Express ran it once per router until one matched — up to 27
// times per request, each pass costing a Redis rate-limit increment and an
// uncached tenant lookup. These tests mount the REAL rootRouter with the
// REAL authenticate / requireTenant / requireActiveSubscription / idempotency
// middleware; only the child routers (replaced by probe routers), the DB and
// the limiter's store are stubbed, so they exercise the actual wiring.

const SECRET = "routes-guard-test-secret";
process.env.ACCESS_JWT_TOKEN = SECRET;

const mockCounts = {
  limiter: 0,
  authenticate: 0,
  subscription: 0,
  idempotency: 0,
  supportAgent: 0,
};
const mockTenantFindUnique = jest.fn();
const mockSupportAgentAllowed = { value: true };

// Every router module routes/index.ts imports, with the export names it uses.
// Path-less routers get a probe at /__probe/<export>; prefix-mounted routers
// (and /support, /walkthrough) get one at /__probe below their prefix.
const ROUTER_MODULES: Record<string, string[]> = {
  auth: ["authRouter"],
  tenant: ["tenantRouter"],
  user: ["userRouter"],
  employee: ["employeeRouter"],
  attendance: ["attendanceRouter"],
  leave: ["leaveRouter"],
  recruitment: ["recruitmentRouter", "publicRecruitmentRouter"],
  hrm: ["hrmRouter"],
  salary: ["salaryRouter"],
  notification: ["notificationRouter"],
  general: ["generalRouter"],
  analyticsRoutes: ["analyticsRoutesRouter"],
  analytics: ["analyticsRouter"],
  permissions: ["permissionsRouter"],
  chat: ["chatRouter"],
  aiConnections: ["aiConnectionsRouter"],
  dashboard: ["dashboardRouter"],
  walkthrough: ["walkthroughRouter"],
  "ai-insights": ["aiInsightsRouter"],
  payment: ["paymentRouter"],
  tenantSettings: ["tenantSettingsRouter"],
  approvalChains: ["approvalChainsRouter"],
  leavePolicy: ["leavePolicyRouter"],
  overtime: ["overtimeRouter"],
  noticePeriodPolicies: ["noticePeriodPoliciesRouter"],
  exitPolicy: ["exitPolicyRouter"],
  interviewPipelines: ["interviewPipelinesRouter"],
  payrollComponents: ["payrollComponentsRouter"],
  taxDeclaration: ["taxDeclarationRouter"],
  orgStructure: ["orgStructureRouter"],
  onboarding: ["onboardingRouter"],
  bulkOnboarding: ["bulkOnboardingRouter"],
  payroll: ["payrollRouter"],
  performanceReview: ["performanceReviewRouter"],
  assets: ["assetsRouter"],
  wfh: ["wfhRouter"],
  helpdesk: ["helpdeskRouter"],
  reports: ["reportsRouter"],
  support: ["supportRouter", "platformSupportRouter"],
};

// Mount prefix in routes/index.ts for routers that are not path-less.
const PREFIXED: Record<string, string> = {
  analyticsRouter: "/analytics",
  walkthroughRouter: "/walkthrough",
  payrollRouter: "/payroll",
  performanceReviewRouter: "/performance-reviews",
  assetsRouter: "/assets",
  wfhRouter: "/wfh",
  helpdeskRouter: "/helpdesk",
  reportsRouter: "/reports",
  taxDeclarationRouter: "/tax-declarations",
  supportRouter: "/support",
  platformSupportRouter: "/platform/support",
};

// Routers that sit before the guarded business section and must stay
// reachable without the subscription guard.
const UNGUARDED = new Set([
  "authRouter",
  "tenantRouter",
  "paymentRouter",
  "publicRecruitmentRouter",
]);
const SPECIAL = new Set([
  "supportRouter",
  "platformSupportRouter",
  "walkthroughRouter",
]);

const ALL_EXPORTS = Object.values(ROUTER_MODULES).flat();
const BUSINESS = ALL_EXPORTS.filter(
  (e) => !UNGUARDED.has(e) && !SPECIAL.has(e),
);
const probePath = (exp: string) =>
  PREFIXED[exp] ? `${PREFIXED[exp]}/__probe` : `/__probe/${exp}`;

const EARLY = "userRouter";
const LATE_PATHLESS = "bulkOnboardingRouter";
const LATE_PREFIXED = "taxDeclarationRouter";

let server: http.Server;
let base: string;

function token(claims: Record<string, unknown> = {}, secret = SECRET) {
  return jwt.sign(
    {
      userId: "507f1f77bcf86cd799439011",
      tenantId: "507f1f77bcf86cd799439012",
      tenantRole: "owner",
      pendingSetup: false,
      dbName: "hrms-test-tenant",
      ...claims,
    },
    secret,
    { algorithm: "HS256" },
  );
}

async function get(path: string, auth?: string | null) {
  const res = await fetch(`${base}/api/v1${path}`, {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

function resetCounts() {
  for (const k of Object.keys(mockCounts) as (keyof typeof mockCounts)[])
    mockCounts[k] = 0;
}

beforeAll(async () => {
  jest.doMock("@hrms/db", () => ({
    prisma: {
      tenant: { findUnique: (...a: any[]) => mockTenantFindUnique(...a) },
      user: { findUnique: jest.fn().mockResolvedValue({ username: "probe" }) },
    },
    runWithTenant: (_t: unknown, _c: unknown, fn: () => void) => fn(),
    // authenticate's per-request account check: allowed,
    // with the role token() issues. Kept off mockTenantFindUnique so the
    // "one tenant lookup per request" counts below are unaffected.
    checkAccountAccess: async (_u: string, tenantId: string | null) => ({
      ok: true,
      tenantRole: tenantId ? "owner" : null,
      dbName: null,
      employeeStatus: "Active",
    }),
    getClientForDb: () => ({}),
    leaseClient: () => () => undefined,
    recordStage: () => {},
    recordExternal: () => {},
    markHandlerStart: () => {},
  }));
  jest.doMock("@hrms/cache", () => ({ getRedisClient: jest.fn() }));

  // A real express-rate-limit instance (in-memory store instead of Redis),
  // wrapped to count invocations — so both "how many times did the limiter
  // run" and the RateLimit-Remaining header reflect actual behaviour.
  jest.doMock("../middleware/rateLimiter", () => {
    const rateLimit = jest.requireActual("express-rate-limit").default;
    const real = rateLimit({
      windowMs: 60_000,
      max: 1_000_000,
      standardHeaders: true,
      legacyHeaders: false,
      validate: false,
    });
    return {
      defaultLimiter: (req: any, res: any, next: any) => {
        mockCounts.limiter++;
        return real(req, res, next);
      },
    };
  });

  jest.doMock("../middleware/authenticate", () => {
    const actual = jest.requireActual("../middleware/authenticate");
    return {
      ...actual,
      authenticate: (req: any, res: any, next: any) => {
        mockCounts.authenticate++;
        return actual.authenticate(req, res, next);
      },
    };
  });
  jest.doMock("../middleware/requireActiveSubscription", () => {
    const actual = jest.requireActual(
      "../middleware/requireActiveSubscription",
    );
    return {
      ...actual,
      requireActiveSubscription: (req: any, res: any, next: any) => {
        mockCounts.subscription++;
        return actual.requireActiveSubscription(req, res, next);
      },
    };
  });
  jest.doMock("../middleware/idempotency", () => {
    const actual = jest.requireActual("../middleware/idempotency");
    return {
      ...actual,
      idempotency: (req: any, res: any, next: any) => {
        mockCounts.idempotency++;
        return actual.idempotency(req, res, next);
      },
    };
  });
  jest.doMock("../middleware/requireSupportAgent", () => ({
    requireSupportAgent: (_req: any, res: any, next: any) => {
      mockCounts.supportAgent++;
      if (!mockSupportAgentAllowed.value)
        return res.status(403).json({ message: "Forbidden" });
      next();
    },
  }));

  for (const [mod, exports] of Object.entries(ROUTER_MODULES)) {
    jest.doMock(`../routes/${mod}`, () => {
      const { Router } = jest.requireActual("express");
      const { gatewayTenantStorage } = jest.requireActual(
        "../middleware/tenantContext",
      );
      const out: Record<string, unknown> = {};
      for (const name of exports) {
        const r = Router();
        const path = PREFIXED[name] ? "/__probe" : `/__probe/${name}`;
        r.get(path, (req: any, res: any) =>
          res.json({
            router: name,
            tenantId: req.user?.tenantId ?? null,
            ctxTenantId: gatewayTenantStorage.getStore()?.tenantId ?? null,
          }),
        );
        r.get(`/__throw/${name}`, () => {
          throw new Error("boom");
        });
        out[name] = r;
      }
      return out;
    });
  }

  const { rootRouter } = require("../routes/index");
  const app = express();
  app.use("/api/v1", rootRouter);
  // Same shape as server.ts's terminal error handler.
  app.use((error: any, _req: any, res: any, _next: any) => {
    const httpStatus = error.status || error.statusCode || 500;
    res.status(httpStatus).json({
      success: false,
      message: httpStatus < 500 ? error.message : "Internal Server Error",
    });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetCounts();
  // Each test counts its own tenant lookups; don't let the per-process
  // subscription cache carry one over from an earlier test.
  jest
    .requireActual("../middleware/requireActiveSubscription")
    .clearSubscriptionCache();
  mockSupportAgentAllowed.value = true;
  mockTenantFindUnique.mockReset();
  mockTenantFindUnique.mockResolvedValue({
    subscriptionStatus: "active",
    planExpiresAt: null,
    planActivatedAt: new Date("2026-01-01"),
    trialEndsAt: null,
  });
});

describe("routes/index — guard runs once per business request", () => {
  it.each([
    ["early (first guarded router)", EARLY],
    ["late path-less router", LATE_PATHLESS],
    ["late prefix-mounted router", LATE_PREFIXED],
  ])(
    "%s: guard, tenant lookup and limiter each run exactly once",
    async (_l, exp) => {
      const res = await get(probePath(exp), token());
      expect(res.status).toBe(200);
      expect(res.body.router).toBe(exp);
      expect(mockCounts.authenticate).toBe(1);
      expect(mockCounts.subscription).toBe(1);
      expect(mockCounts.idempotency).toBe(1);
      expect(mockTenantFindUnique).toHaveBeenCalledTimes(1);
      expect(mockCounts.limiter).toBe(1);
    },
  );

  it("every business router: exactly one guard pass and one tenant lookup", async () => {
    const offenders: string[] = [];
    for (const exp of BUSINESS) {
      resetCounts();
      mockTenantFindUnique.mockClear();
      jest
        .requireActual("../middleware/requireActiveSubscription")
        .clearSubscriptionCache();
      const res = await get(probePath(exp), token());
      const lookups = mockTenantFindUnique.mock.calls.length;
      if (
        res.status !== 200 ||
        res.body.router !== exp ||
        mockCounts.authenticate !== 1 ||
        mockCounts.subscription !== 1 ||
        lookups !== 1 ||
        mockCounts.limiter !== 1
      ) {
        offenders.push(
          `${exp}: status=${res.status} auth=${mockCounts.authenticate} sub=${mockCounts.subscription} lookups=${lookups} limiter=${mockCounts.limiter}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("makes tenant context available to business handlers", async () => {
    const res = await get(probePath(LATE_PREFIXED), token());
    expect(res.body.tenantId).toBe("507f1f77bcf86cd799439012");
    expect(res.body.ctxTenantId).toBe("507f1f77bcf86cd799439012");
  });
});

describe("routes/index — every business router stays protected", () => {
  it.each(BUSINESS)("%s rejects a request with no token (401)", async (exp) => {
    const res = await get(probePath(exp), null);
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret (401)", async () => {
    const res = await get(
      probePath(LATE_PREFIXED),
      token({}, "not-the-secret"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a token without a tenant (403 PENDING_TENANT_SETUP)", async () => {
    for (const exp of [EARLY, LATE_PATHLESS, LATE_PREFIXED]) {
      const res = await get(
        probePath(exp),
        token({ tenantId: null, pendingSetup: true, dbName: null }),
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PENDING_TENANT_SETUP");
    }
  });

  it("blocks an expired subscription on early and late routers (402)", async () => {
    mockTenantFindUnique.mockResolvedValue({
      subscriptionStatus: "expired",
      planExpiresAt: new Date("2026-01-01"),
      planActivatedAt: new Date("2025-01-01"),
      trialEndsAt: null,
    });
    for (const exp of [EARLY, LATE_PATHLESS, LATE_PREFIXED]) {
      const res = await get(probePath(exp), token());
      expect(res.status).toBe(402);
    }
  });

  it("keeps the existing fail-open behaviour when the subscription lookup errors", async () => {
    mockTenantFindUnique.mockRejectedValue(new Error("db down"));
    const res = await get(probePath(LATE_PREFIXED), token());
    expect(res.status).toBe(200);
    expect(mockCounts.subscription).toBe(1);
  });

  it("routes a handler error to the terminal error handler (500)", async () => {
    const res = await get(`/__throw/${LATE_PATHLESS}`, token());
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal Server Error");
  });
});

describe("routes/index — routes mounted ahead of the business guard", () => {
  it("tenant/payment/public routers are not behind authenticate or the subscription check", async () => {
    for (const exp of [
      "tenantRouter",
      "paymentRouter",
      "publicRecruitmentRouter",
    ]) {
      resetCounts();
      const res = await get(probePath(exp), null);
      expect(res.status).toBe(200);
      expect(mockCounts.authenticate).toBe(0);
      expect(mockCounts.subscription).toBe(0);
      expect(mockCounts.limiter).toBe(1);
    }
  });

  it("auth router is not charged by defaultLimiter (covered by the global limiters)", async () => {
    const res = await get(probePath("authRouter"), null);
    expect(res.status).toBe(200);
    expect(mockCounts.limiter).toBe(0);
  });

  it("/support: authenticated + tenant required, no subscription check", async () => {
    mockTenantFindUnique.mockResolvedValue({ subscriptionStatus: "expired" });
    const ok = await get(probePath("supportRouter"), token());
    expect(ok.status).toBe(200);
    expect(ok.body.router).toBe("supportRouter");
    expect(mockCounts.subscription).toBe(0);
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockCounts.limiter).toBe(1);
    expect((await get(probePath("supportRouter"), null)).status).toBe(401);
    const pending = await get(
      probePath("supportRouter"),
      token({ tenantId: null, pendingSetup: true, dbName: null }),
    );
    expect(pending.status).toBe(403);
  });

  it("/platform/support: authenticated + support agent, no tenant/subscription check", async () => {
    const ok = await get(
      probePath("platformSupportRouter"),
      token({ tenantId: null, pendingSetup: true, dbName: null }),
    );
    expect(ok.status).toBe(200);
    expect(mockCounts.supportAgent).toBe(1);
    expect(mockCounts.subscription).toBe(0);
    mockSupportAgentAllowed.value = false;
    expect(
      (await get(probePath("platformSupportRouter"), token())).status,
    ).toBe(403);
    expect((await get(probePath("platformSupportRouter"), null)).status).toBe(
      401,
    );
  });

  it("/walkthrough: authenticated + tenant required, no subscription check", async () => {
    mockTenantFindUnique.mockResolvedValue({ subscriptionStatus: "expired" });
    const ok = await get(probePath("walkthroughRouter"), token());
    expect(ok.status).toBe(200);
    expect(ok.body.router).toBe("walkthroughRouter");
    expect(mockCounts.subscription).toBe(0);
    expect(mockCounts.authenticate).toBe(1);
    expect(mockCounts.limiter).toBe(1);
    expect((await get(probePath("walkthroughRouter"), null)).status).toBe(401);
    const pending = await get(
      probePath("walkthroughRouter"),
      token({ tenantId: null, pendingSetup: true, dbName: null }),
    );
    expect(pending.status).toBe(403);
  });
});

describe("routes/index — unknown paths", () => {
  it("authenticated unknown path: 404 after a single guard pass", async () => {
    const res = await get("/__definitely_not_a_route", token());
    expect(res.status).toBe(404);
    expect(mockCounts.authenticate).toBe(1);
    expect(mockTenantFindUnique).toHaveBeenCalledTimes(1);
    expect(mockCounts.limiter).toBe(1);
  });

  it("unauthenticated unknown path: still rejected with 401 before the 404", async () => {
    const res = await get("/__definitely_not_a_route", null);
    expect(res.status).toBe(401);
  });
});

describe("routes/index — rate limiting counts one request once", () => {
  it.each([
    ["early business router", probePath(EARLY), true],
    ["late business router", probePath(LATE_PREFIXED), true],
    ["unknown path", "/__definitely_not_a_route", true],
    ["/support", probePath("supportRouter"), true],
    ["/walkthrough", probePath("walkthroughRouter"), true],
    ["tenant router", probePath("tenantRouter"), false],
  ])(
    "%s: RateLimit-Remaining drops by exactly 1 per request",
    async (_l, path, auth) => {
      const t = auth ? token() : null;
      const a = await get(path, t);
      const b = await get(path, t);
      const ra = Number(a.headers.get("ratelimit-remaining"));
      const rb = Number(b.headers.get("ratelimit-remaining"));
      expect(Number.isFinite(ra)).toBe(true);
      expect(ra - rb).toBe(1);
      expect(mockCounts.limiter).toBe(2);
    },
  );
});
