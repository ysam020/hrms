// Praesto Platform Console over HTTP: the real authenticate (JWT),
// requirePlatformAdmin, validators, router and handlers, against an
// in-memory master DB. Covers who can reach which endpoint, that nothing a
// customer organisation controls (role, superuser flag, permission strings,
// request parameters) grants platform access, and the overview's counts.
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";

const SECRET = "platform-admin-test-secret";
process.env.ACCESS_JWT_TOKEN = SECRET;

const id = (n: number) => n.toString(16).padStart(24, "c");
const PLATFORM = id(1);
const ACME = id(2);
const BETA = id(3);
process.env.PLATFORM_TENANT_ID = PLATFORM;

const U = {
  pOwner: id(10),
  pFinance: id(11), // view_overview + view_billing
  pOverviewOnly: id(12),
  pAdmin: id(13), // admin role, no PraestoAdmin permissions
  pLeaver: id(14), // all permissions, but Terminated
  aOwner: id(20), // customer owner + superuser + wildcard + the strings
  aEmployee: id(21),
  bEmployee: id(30),
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const db: Record<string, any[]> = {};
const mockAudit: any[] = [];

function seed() {
  db.tenant = [
    {
      id: PLATFORM,
      name: "Praesto",
      slug: "praesto",
      createdAt: daysAgo(3),
      isActive: true,
      subscriptionStatus: "trialing",
      planTier: "starter",
      billing: "monthly",
      planActivatedAt: null,
      planExpiresAt: daysAgo(-11),
      trialStartedAt: daysAgo(3),
      trialEndsAt: daysAgo(-11),
      razorpaySubscriptionId: "sub_p",
    },
    {
      id: ACME,
      name: "Acme",
      slug: "acme",
      createdAt: daysAgo(20),
      isActive: true,
      subscriptionStatus: "active",
      planTier: "growth",
      billing: "annual",
      planActivatedAt: daysAgo(20),
      planExpiresAt: daysAgo(-345),
      trialStartedAt: null,
      trialEndsAt: null,
      razorpaySubscriptionId: "sub_a",
      dbName: "hrms-acme",
    },
    {
      id: BETA,
      name: "Beta",
      slug: "beta",
      createdAt: daysAgo(200),
      isActive: true,
      subscriptionStatus: "expired",
      planTier: "starter",
      billing: "monthly",
      planActivatedAt: daysAgo(200),
      planExpiresAt: daysAgo(170),
      trialStartedAt: null,
      trialEndsAt: null,
      razorpaySubscriptionId: null,
    },
  ];
  const u = (uid: string, tenantId: string, extra: object = {}) => ({
    id: uid,
    tenantId,
    username: `user_${uid.slice(-2)}`,
    isSuperUser: false,
    permissions: [],
    employeeStatus: "Active",
    createdAt: daysAgo(10),
    ...extra,
  });
  db.user = [
    u(U.pOwner, PLATFORM),
    u(U.pFinance, PLATFORM, {
      permissions: ["PraestoAdmin:view_overview", "PraestoAdmin:view_billing"],
    }),
    u(U.pOverviewOnly, PLATFORM, {
      permissions: ["PraestoAdmin:view_overview"],
    }),
    u(U.pAdmin, PLATFORM),
    u(U.pLeaver, PLATFORM, {
      employeeStatus: "Terminated",
      permissions: [
        "PraestoAdmin:view_overview",
        "PraestoAdmin:view_tenants",
        "PraestoAdmin:view_billing",
      ],
    }),
    u(U.aOwner, ACME, {
      isSuperUser: true,
      permissions: ["*:*:*", "PraestoAdmin:view_overview"],
    }),
    u(U.aEmployee, ACME),
    u(id(22), ACME, { employeeStatus: "Resigned" }),
    u(U.bEmployee, BETA),
  ];
  db.tenantMembership = [
    { tenantId: PLATFORM, userId: U.pOwner, role: "owner" },
    { tenantId: ACME, userId: U.aOwner, role: "owner" },
    { tenantId: ACME, userId: U.aEmployee, role: "employee" },
    { tenantId: BETA, userId: U.bEmployee, role: "owner" },
  ];
  db.billingPayment = [
    {
      id: id(90),
      razorpayPaymentId: "pay_1",
      tenantId: ACME,
      subscriptionId: "sub_a",
      amount: 16198920,
      currency: "INR",
      status: "captured",
      amountRefunded: 0,
      planTier: "growth",
      billing: "annual",
      periodStart: daysAgo(20),
      periodEnd: daysAgo(-345),
      paidAt: daysAgo(20),
    },
    {
      id: id(91),
      razorpayPaymentId: "pay_2",
      tenantId: ACME,
      subscriptionId: "sub_a",
      amount: 16198920,
      currency: "INR",
      status: "failed",
      amountRefunded: 0,
      paidAt: daysAgo(21),
    },
    // Praesto's own subscription is not customer revenue.
    {
      id: id(92),
      razorpayPaymentId: "pay_p",
      tenantId: PLATFORM,
      subscriptionId: "sub_p",
      amount: 799900,
      currency: "INR",
      status: "captured",
      amountRefunded: 0,
      paidAt: daysAgo(1),
    },
  ];
  mockAudit.length = 0;
}

// Minimal Prisma-shaped queries over `db`.
const notIn = (where: any, field: string) => (r: any) =>
  !where?.[field] ||
  (typeof where[field] === "object"
    ? (where[field].not === undefined || r[field] !== where[field].not) &&
      (where[field].in === undefined || where[field].in.includes(r[field]))
    : r[field] === where[field]);
const inRange = (where: any) => (r: any) =>
  !where?.paidAt ||
  (r.paidAt >= where.paidAt.gte && r.paidAt < where.paidAt.lt);
function groupBy(rows: any[], by: string[]) {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = by.map((f) => r[f]).join("|");
    const g = m.get(k) ?? {
      ...Object.fromEntries(by.map((f) => [f, r[f]])),
      _count: { _all: 0 },
    };
    g._count._all++;
    m.set(k, g);
  }
  return [...m.values()];
}

jest.mock("@hrms/db", () => ({
  leaseClient: () => () => undefined,
  prisma: {
    tenant: {
      findMany: async ({ where }: any = {}) =>
        db.tenant.filter((t) => notIn(where, "id")(t)),
      findUnique: async ({ where }: any) =>
        db.tenant.find((t) => t.id === where.id) ?? null,
    },
    user: {
      findUnique: async ({ where }: any) =>
        db.user.find((u) => u.id === where.id) ?? null,
      groupBy: async ({ by, where }: any) =>
        groupBy(
          db.user.filter(
            (u) =>
              u.tenantId &&
              (!where?.tenantId?.length || true) &&
              (typeof where?.tenantId !== "string" ||
                u.tenantId === where.tenantId),
          ),
          by,
        ),
      count: async () => 0,
      aggregateRaw: async () => [],
    },
    tenantMembership: {
      groupBy: async ({ by }: any) => groupBy(db.tenantMembership, by),
      findFirst: async ({ where }: any) =>
        db.tenantMembership.find(
          (m) => m.tenantId === where.tenantId && m.role === where.role,
        ) ?? null,
      count: async ({ where }: any) =>
        db.tenantMembership.filter((m) => m.tenantId === where.tenantId).length,
    },
    loginEvent: {
      groupBy: async () => [],
      findFirst: async () => null,
      count: async () => 0,
    },
    supportTicket: { count: async () => 0 },
    billingPayment: {
      findMany: async ({ where }: any = {}) =>
        db.billingPayment.filter(
          (p) =>
            inRange(where)(p) &&
            notIn(where, "tenantId")(p) &&
            (!where?.AND ||
              where.AND.every((w: any) => notIn(w, "tenantId")(p))),
        ),
      count: async () => db.billingPayment.length,
      findFirst: async () => db.billingPayment[0] ?? null,
      aggregateRaw: async () => [],
    },
  },
  prismaWithTenant: {
    auditLog: {
      create: async ({ data }: any) => {
        mockAudit.push({ ...data, timestamp: new Date() });
        return data;
      },
      findMany: async () => mockAudit,
      count: async () => mockAudit.length,
      aggregateRaw: async () => [],
    },
  },
  runWithTenant: (_t: string, _c: unknown, next: () => void) => next(),
  getClientForDb: () => {
    const count = async () => 0;
    return new Proxy({}, { get: () => ({ count }) });
  },
  recordStage: () => {},
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@hrms/cache", () => ({
  getRedisClient: () => ({
    set: async () => "OK",
    del: async () => 1,
  }),
}));
jest.mock("../handlers/payment", () => ({ getRazorpay: () => ({}) }));
const mockReconcile = jest.fn();
jest.mock("../services/subscriptionReconciler", () => ({
  RECONCILE_SELECT: {
    id: true,
    subscriptionStatus: true,
    razorpaySubscriptionId: true,
  },
  reconcileTenant: (...a: unknown[]) => mockReconcile(...a),
}));
const mockLedgerSync = jest.fn();
jest.mock("../services/billingLedger", () => ({
  syncTenantLedger: (...a: unknown[]) => mockLedgerSync(...a),
}));

import { authenticate } from "../middleware/authenticate";
import { platformAdminRouter } from "../routes/platformAdmin";
import { platformAdminGrants } from "../services/platformAccess";
import { isPlatformOnlyPermission, isValidPermission } from "@hrms/common";

let server: http.Server;
let base: string;

const ROLE: Record<string, [string, string]> = {
  [U.pOwner]: [PLATFORM, "owner"],
  [U.pFinance]: [PLATFORM, "employee"],
  [U.pOverviewOnly]: [PLATFORM, "employee"],
  [U.pAdmin]: [PLATFORM, "admin"],
  [U.pLeaver]: [PLATFORM, "employee"],
  [U.aOwner]: [ACME, "owner"],
  [U.aEmployee]: [ACME, "employee"],
};

function token(userId: string, claims: object = {}) {
  const [tenantId, tenantRole] = ROLE[userId];
  return jwt.sign(
    {
      userId,
      tenantId,
      tenantRole,
      pendingSetup: false,
      dbName: `hrms-${tenantId}`,
      ...claims,
    },
    SECRET,
    { algorithm: "HS256" },
  );
}

async function call(
  path: string,
  auth?: string,
  init: { method?: string; body?: object } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(auth && { Authorization: `Bearer ${auth}` }),
      ...(init.body && { "Content-Type": "application/json" }),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/platform/admin", authenticate, platformAdminRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seed();
  mockReconcile.mockReset().mockResolvedValue(undefined);
  mockLedgerSync.mockReset().mockResolvedValue(3);
});

const READS = [
  "/platform/admin/overview",
  "/platform/admin/tenants",
  `/platform/admin/tenants/${ACME}`,
  "/platform/admin/subscriptions",
  "/platform/admin/payments",
  "/platform/admin/revenue",
  "/platform/admin/audit-logs",
];

describe("authorization", () => {
  it("rejects unauthenticated requests", async () => {
    for (const path of READS) expect((await call(path)).status).toBe(401);
  });

  it("gives a customer's owner/superuser nothing, whatever they hold or send", async () => {
    const t = token(U.aOwner);
    for (const path of READS) {
      expect((await call(path, t)).status).toBe(403);
      // A tenant id in the request is never what decides access.
      expect((await call(`${path}?tenantId=${PLATFORM}`, t)).status).toBe(403);
    }
    expect(
      (
        await call(`/platform/admin/tenants/${ACME}/sync`, t, {
          method: "POST",
          body: { reason: "please sync this" },
        })
      ).status,
    ).toBe(403);
    expect(
      await platformAdminGrants({
        userId: U.aOwner,
        tenantId: ACME,
        tenantRole: "owner",
      }),
    ).toEqual([]);
  });

  it("rejects a token whose tenant doesn't match the user's own record", async () => {
    // A customer user presenting the platform tenant id in their token.
    const t = token(U.aOwner, { tenantId: PLATFORM, tenantRole: "owner" });
    expect((await call("/platform/admin/overview", t)).status).toBe(403);
  });

  it("gives an ordinary customer employee nothing", async () => {
    expect(
      (await call("/platform/admin/overview", token(U.aEmployee))).status,
    ).toBe(403);
  });

  it("doesn't let a Praesto admin role stand in for explicit grants", async () => {
    expect(
      (await call("/platform/admin/overview", token(U.pAdmin))).status,
    ).toBe(403);
  });

  it("shuts out a former employee who still holds the permissions", async () => {
    expect(
      (await call("/platform/admin/overview", token(U.pLeaver))).status,
    ).toBe(403);
  });

  it("limits a partially granted admin to their actions", async () => {
    const t = token(U.pFinance);
    expect((await call("/platform/admin/overview", t)).status).toBe(200);
    expect((await call("/platform/admin/payments", t)).status).toBe(200);
    expect((await call("/platform/admin/revenue", t)).status).toBe(200);
    expect((await call("/platform/admin/tenants", t)).status).toBe(403);
    expect((await call("/platform/admin/audit-logs", t)).status).toBe(403);
    const sync = await call(`/platform/admin/tenants/${ACME}/sync`, t, {
      method: "POST",
      body: { reason: "renewal looks stuck" },
    });
    expect(sync.status).toBe(403);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("lets the platform owner reach every endpoint", async () => {
    const t = token(U.pOwner);
    for (const path of READS) expect((await call(path, t)).status).toBe(200);
  });

  it("keeps PraestoAdmin permissions platform-only in the catalog", () => {
    expect(isValidPermission("PraestoAdmin:view_billing")).toBe(true);
    expect(isPlatformOnlyPermission("PraestoAdmin:manage_billing")).toBe(true);
  });
});

describe("overview", () => {
  it("counts customers and their employee records, excluding Praesto itself", async () => {
    const { body } = await call(
      "/platform/admin/overview?range=30d",
      token(U.pOwner),
    );
    const d = body.data;
    expect(d.tenants.total).toBe(2);
    expect(d.tenants.newInRange).toBe(1); // Acme, 20 days ago
    expect(d.tenants.withAccess).toBe(1); // Beta expired
    expect(d.employees.records).toBe(4); // Acme 3 (incl. resigned), Beta 1
    expect(d.employees.active).toBe(3);
    expect(d.employees.userAccounts).toBe(3);
    expect(d.subscriptions.paying).toBe(1);
    expect(d.billing.mrr.mrr).toBe(Math.round(16198920 / 12));
    // Failed attempt and Praesto's own payment excluded.
    expect(d.billing.collections.INR.gross).toBe(16198920);
    expect(d.billing.collections.INR.failed).toBe(1);
  });

  it("leaves billing out for someone without billing access", async () => {
    const { status, body } = await call(
      "/platform/admin/overview",
      token(U.pOverviewOnly),
    );
    expect(status).toBe(200);
    expect(body.data.billing).toBeNull();
  });

  it("validates the date range", async () => {
    const t = token(U.pOwner);
    expect((await call("/platform/admin/overview?range=5y", t)).status).toBe(
      400,
    );
    expect(
      (await call("/platform/admin/overview?from=2026-10-01", t)).status,
    ).toBe(400);
    expect(
      (await call("/platform/admin/overview?from=2026-10-09&to=2026-10-01", t))
        .status,
    ).toBe(400);
  });
});

describe("tenants", () => {
  it("filters and paginates on the server", async () => {
    const t = token(U.pOwner);
    const all = await call("/platform/admin/tenants?limit=1", t);
    expect(all.body.data.totalCount).toBe(2);
    expect(all.body.data.tenants).toHaveLength(1);
    const active = await call("/platform/admin/tenants?status=active", t);
    expect(active.body.data.tenants.map((r: any) => r.id)).toEqual([ACME]);
    const big = await call("/platform/admin/tenants?minEmployees=2", t);
    expect(big.body.data.tenants.map((r: any) => r.id)).toEqual([ACME]);
  });

  it("hides the platform tenant and unknown ids", async () => {
    const t = token(U.pOwner);
    expect((await call(`/platform/admin/tenants/${PLATFORM}`, t)).status).toBe(
      404,
    );
    expect((await call("/platform/admin/tenants/nope", t)).status).toBe(404);
  });
});

describe("sync action", () => {
  it("requires a reason, runs the reconciler's step, and audits it", async () => {
    const t = token(U.pOwner);
    const path = `/platform/admin/tenants/${ACME}/sync`;
    expect((await call(path, t, { method: "POST", body: {} })).status).toBe(
      400,
    );
    const res = await call(path, t, {
      method: "POST",
      body: { reason: "customer says renewal failed" },
    });
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockLedgerSync).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveLength(1);
    expect(mockAudit[0]).toMatchObject({
      userId: U.pOwner,
      entityType: "PlatformAdmin",
      newValue: {
        action: "subscription.sync",
        targetTenantId: ACME,
        reason: "customer says renewal failed",
        result: "success",
      },
    });
  });

  it("refuses an organisation with no Razorpay subscription", async () => {
    const res = await call(
      `/platform/admin/tenants/${BETA}/sync`,
      token(U.pOwner),
      {
        method: "POST",
        body: { reason: "check billing state" },
      },
    );
    expect(res.status).toBe(409);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
