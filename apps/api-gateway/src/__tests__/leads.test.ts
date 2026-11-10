// Website sales leads over HTTP: the real public router, authenticate,
// requirePlatformAdmin, validators and handlers, against the in-memory master
// DB (supportFakeDb). Covers the public form (validation, normalisation,
// attribution sanitising, honeypot, duplicates, notifications without PII),
// who can read and change leads, the console operations, audit entries
// without personal details, retention and funnel metrics.
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";

const SECRET = "leads-test-secret";
process.env.ACCESS_JWT_TOKEN = SECRET;

const id = (n: number) => n.toString(16).padStart(24, "d");
const PLATFORM = id(1);
const ACME = id(2);
process.env.PLATFORM_TENANT_ID = PLATFORM;

const U = {
  pOwner: id(10), // Praesto owner: every PraestoAdmin action
  pSales: id(11), // view_leads + manage_leads
  pViewer: id(12), // view_leads only
  pAdmin: id(13), // Praesto admin role, no lead permissions
  pLeaver: id(14), // lead permissions, but Terminated
  aOwner: id(20), // customer owner, superuser, wildcard + the strings
};

const mockAudit: any[] = [];
const mockRedis = new Map<string, string>();

jest.mock("@hrms/db", () => {
  const fake = require("./supportFakeDb");
  const domains = jest.requireActual(
    "../../../../packages/database/src/publicEmailDomains",
  );
  const email = jest.requireActual("../../../../packages/database/src/email");
  return {
    prisma: fake.fakeDb,
    prismaWithTenant: {
      auditLog: {
        create: async ({ data }: any) => {
          mockAudit.push(data);
          return data;
        },
      },
    },
    isPublicEmailDomain: domains.isPublicEmailDomain,
    getEmailDomain: email.getEmailDomain,
    leaseClient: () => () => undefined,
    checkAccountAccess: async (userId: string, tenantId: string | null) => {
      const t = fake.table;
      const user = t("user").find((u: any) => u.id === userId);
      if (!user) return { ok: false, reason: "user_not_found" };
      if (["Terminated", "Absconded", "Resigned"].includes(user.employeeStatus))
        return { ok: false, reason: "blocked_status" };
      const m = t("tenantMembership").find(
        (x: any) => x.tenantId === tenantId && x.userId === userId,
      );
      if (!m) return { ok: false, reason: "no_membership" };
      return {
        ok: true,
        tenantRole: m.role,
        dbName: null,
        employeeStatus: user.employeeStatus,
      };
    },
    isBlockedEmployeeStatus: (s: string) =>
      ["Terminated", "Absconded", "Resigned"].includes(s),
    runWithTenant: (_t: string, _c: unknown, next: () => void) => next(),
    getClientForDb: () => ({}),
    recordStage: () => {},
  };
});
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@hrms/cache", () => ({
  getRedisClient: () => ({
    set: async (k: string, v: string, ...opts: string[]) => {
      if (opts.includes("NX") && mockRedis.has(k)) return null;
      mockRedis.set(k, v);
      return "OK";
    },
    get: async (k: string) => mockRedis.get(k) ?? null,
    del: async (k: string) => +mockRedis.delete(k),
  }),
}));
jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));
jest.mock("../handlers/payment", () => ({ getRazorpay: () => ({}) }));
jest.mock("../services/subscriptionReconciler", () => ({
  RECONCILE_SELECT: {},
  reconcileTenant: jest.fn(),
}));
jest.mock("../services/billingLedger", () => ({ syncTenantLedger: jest.fn() }));

import { notify } from "@hrms/notifications";
import { authenticate } from "../middleware/authenticate";
import { platformAdminRouter } from "../routes/platformAdmin";
import { publicLeadsRouter } from "../routes/publicLeads";
import { resetFakeDb, table } from "./supportFakeDb";
import {
  cleanAttributionValue,
  cleanLandingPage,
  normalizePhone,
  sanitizeAttribution,
  stageStamps,
} from "../config/leads";

const mockNotify = notify as jest.Mock;

function seed() {
  const u = (uid: string, tenantId: string, extra: object = {}) => ({
    id: uid,
    tenantId,
    username: `user_${uid.slice(-2)}`,
    email: `staff${uid.slice(-2)}@praesto.example`,
    first_name: `Staff${uid.slice(-2)}`,
    last_name: "",
    isSuperUser: false,
    permissions: [],
    employeeStatus: "Active",
    ...extra,
  });
  resetFakeDb({
    user: [
      u(U.pOwner, PLATFORM),
      u(U.pSales, PLATFORM, {
        permissions: ["PraestoAdmin:view_leads", "PraestoAdmin:manage_leads"],
      }),
      u(U.pViewer, PLATFORM, { permissions: ["PraestoAdmin:view_leads"] }),
      u(U.pAdmin, PLATFORM),
      u(U.pLeaver, PLATFORM, {
        employeeStatus: "Terminated",
        permissions: ["PraestoAdmin:view_leads", "PraestoAdmin:manage_leads"],
      }),
      u(U.aOwner, ACME, {
        isSuperUser: true,
        permissions: ["*:*:*", "PraestoAdmin:view_leads"],
      }),
    ],
    tenantMembership: [
      { tenantId: PLATFORM, userId: U.pOwner, role: "owner" },
      { tenantId: PLATFORM, userId: U.pSales, role: "employee" },
      { tenantId: PLATFORM, userId: U.pViewer, role: "employee" },
      { tenantId: PLATFORM, userId: U.pAdmin, role: "admin" },
      { tenantId: PLATFORM, userId: U.pLeaver, role: "employee" },
      { tenantId: ACME, userId: U.aOwner, role: "owner" },
    ],
    lead: [],
  });
  mockAudit.length = 0;
  mockRedis.clear();
  mockNotify.mockClear();
}

const ROLE: Record<string, [string, string]> = {
  [U.pOwner]: [PLATFORM, "owner"],
  [U.pSales]: [PLATFORM, "employee"],
  [U.pViewer]: [PLATFORM, "employee"],
  [U.pAdmin]: [PLATFORM, "admin"],
  [U.pLeaver]: [PLATFORM, "employee"],
  [U.aOwner]: [ACME, "owner"],
};
function token(userId: string) {
  const [tenantId, tenantRole] = ROLE[userId];
  return jwt.sign(
    {
      userId,
      tenantId,
      tenantRole,
      pendingSetup: false,
      dbName: `hrms-${tenantId}`,
    },
    SECRET,
    { algorithm: "HS256" },
  );
}

let server: http.Server;
let base: string;
async function call(
  path: string,
  init: { method?: string; body?: object; as?: string } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.as && { Authorization: `Bearer ${token(init.as)}` }),
      ...(init.body && { "Content-Type": "application/json" }),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(publicLeadsRouter);
  app.use("/platform/admin", authenticate, platformAdminRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(seed);

const FORM = {
  kind: "demo",
  name: "Asha Rao",
  email: "  Asha.Rao@Example.co.in ",
  phone: "098765 43210",
  companyName: "Example Industries",
  companySize: "26–100",
  designation: "HR Manager",
  message: "We have 60 people across two offices.",
  consent: true,
};
const submit = (body: object = {}) =>
  call("/public/leads", { method: "POST", body: { ...FORM, ...body } });
const flush = () => new Promise((r) => setImmediate(r));
const leads = () => table("lead");

// ── Public form ─────────────────────────────────────────────────────────────

describe("public lead form", () => {
  it("stores a normalised lead and answers without echoing it back", async () => {
    const r = await submit({
      attribution: {
        utmSource: "linkedin",
        utmMedium: "social",
        utmCampaign: "someone@example.com", // personal: dropped
        utmContent: "9876543210", // phone-like: dropped
        landingPage: "/?utm_source=linkedin",
        referrerHost: "www.LinkedIn.com",
        anythingElse: "ignored",
      },
    });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      success: true,
      message: expect.any(String),
    });
    expect(leads()).toHaveLength(1);
    const l = leads()[0];
    expect(l).toMatchObject({
      kind: "demo",
      email: "asha.rao@example.co.in",
      phone: "+919876543210",
      status: "new",
      ownerId: null,
      freeEmailDomain: false,
      utmSource: "linkedin",
      utmMedium: "social",
      landingPage: "/",
      referrerHost: "www.linkedin.com",
      submissionCount: 1,
    });
    expect(l.utmCampaign).toBeUndefined();
    expect(l.utmContent).toBeUndefined();
    expect(l).not.toHaveProperty("anythingElse");
    expect(l.consentAt).toBeInstanceOf(Date);
  });

  it("keeps each lead for 24 months after its last activity", async () => {
    await submit();
    const months =
      (leads()[0].purgeAt.getTime() - Date.now()) / (30.44 * 86_400_000);
    expect(months).toBeGreaterThan(23.5);
    expect(months).toBeLessThan(24.5);
  });

  it("flags webmail addresses without rejecting them", async () => {
    await submit({ email: "asha@gmail.com" });
    expect(leads()[0].freeEmailDomain).toBe(true);
  });

  it("notifies the lead team without the prospect's contact details, and acknowledges the prospect", async () => {
    await submit();
    await flush();
    const calls = mockNotify.mock.calls.map((c) => c[0]);
    const team = calls.filter((c) => c.event === "leadReceived");
    const ack = calls.filter((c) => c.event === "leadAcknowledged");
    expect(team.length).toBeGreaterThan(0);
    // Owner, pSales, pViewer: everyone with view_leads; not the plain admin,
    // the leaver or the customer superuser.
    const recipients = team.find((c) => c.recipients)!.recipients.sort();
    expect(recipients).toEqual([U.pOwner, U.pSales, U.pViewer].sort());
    const teamText = JSON.stringify(team);
    expect(teamText).toContain("Example Industries");
    expect(teamText).not.toMatch(/asha|98765|Asha Rao|two offices/i);
    expect(ack).toHaveLength(1);
    expect(ack[0].email.to).toEqual(["asha.rao@example.co.in"]);
  });

  it("discards honeypot submissions but answers normally", async () => {
    const r = await submit({ website: "http://spam.example" });
    expect(r.status).toBe(201);
    expect(leads()).toHaveLength(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: "not-an-email" }],
    [{ phone: "12345" }],
    [{ consent: false }],
    [{ companySize: "500" }],
    [{ kind: "spam" }],
    [{ name: "A" }],
    [{ preferredDate: "2001-01-01" }],
    [{ isAdmin: true }], // unknown fields are refused
  ])("rejects invalid input %j", async (patch) => {
    const r = await submit(patch);
    expect(r.status).toBe(400);
    expect(leads()).toHaveLength(0);
  });

  it("treats a quick repeat (double click, retry) as the same request", async () => {
    await submit();
    await submit();
    mockRedis.clear(); // past the short lock, still within the window
    await submit();
    await flush();
    expect(leads()).toHaveLength(1);
    expect(leads()[0].submissionCount).toBe(1);
    expect(
      mockNotify.mock.calls.filter((c) => c[0].event === "leadAcknowledged"),
    ).toHaveLength(1);
  });

  it("merges a later submission into the open lead, notifying again only after a day", async () => {
    await submit();
    const lead = leads()[0];
    lead.lastSubmittedAt = new Date(Date.now() - 60 * 60_000);
    mockRedis.clear();
    mockNotify.mockClear();
    await submit({ kind: "sales", message: "Also need payroll." });
    await flush();
    expect(leads()).toHaveLength(1);
    expect(leads()[0].submissionCount).toBe(2);
    expect(leads()[0].notes.at(-1)).toMatchObject({
      authorId: null,
      body: expect.stringContaining("Also need payroll."),
    });
    expect(mockNotify).not.toHaveBeenCalled();

    leads()[0].lastSubmittedAt = new Date(Date.now() - 2 * 86_400_000);
    leads()[0].lastNotifiedAt = new Date(Date.now() - 2 * 86_400_000);
    mockRedis.clear();
    await submit();
    await flush();
    expect(mockNotify).toHaveBeenCalled();
  });

  it("starts a new lead once the previous one is closed", async () => {
    await submit();
    leads()[0].status = "converted";
    mockRedis.clear();
    await submit();
    expect(leads()).toHaveLength(2);
  });
});

// ── Authorization ───────────────────────────────────────────────────────────

describe("console authorization", () => {
  let leadId: string;
  beforeEach(async () => {
    await submit();
    leadId = leads()[0].id;
  });
  const READS = () => [
    "/platform/admin/leads",
    "/platform/admin/leads/metrics",
    "/platform/admin/leads/owners",
    `/platform/admin/leads/${leadId}`,
  ];

  it("refuses anonymous requests", async () => {
    for (const p of READS()) expect((await call(p)).status).toBe(401);
  });

  it.each([
    ["a customer organisation's owner and superuser", U.aOwner],
    ["a Praesto admin without the permission", U.pAdmin],
    ["a former employee who held it", U.pLeaver],
  ])("refuses %s", async (_label, uid) => {
    for (const p of READS())
      expect((await call(p, { as: uid })).status).toBeGreaterThanOrEqual(401);
    const w = await call(`/platform/admin/leads/${leadId}`, {
      method: "PATCH",
      body: { status: "contacted" },
      as: uid,
    });
    expect([401, 403]).toContain(w.status);
    expect(leads()[0].status).toBe("new");
  });

  it("lets view_leads read but not change", async () => {
    for (const p of READS())
      expect((await call(p, { as: U.pViewer })).status).toBe(200);
    const w = await call(`/platform/admin/leads/${leadId}`, {
      method: "PATCH",
      body: { status: "contacted" },
      as: U.pViewer,
    });
    expect(w.status).toBe(403);
    const n = await call(`/platform/admin/leads/${leadId}/notes`, {
      method: "POST",
      body: { body: "hi" },
      as: U.pViewer,
    });
    expect(n.status).toBe(403);
  });

  it("lets the owner and manage_leads change leads", async () => {
    for (const uid of [U.pOwner, U.pSales]) {
      const r = await call(`/platform/admin/leads/${leadId}`, {
        method: "PATCH",
        body: { status: "contacted" },
        as: uid,
      });
      expect(r.status).toBe(200);
    }
  });
});

// ── Console operations ──────────────────────────────────────────────────────

describe("console operations", () => {
  beforeEach(async () => {
    await submit();
    mockRedis.clear();
    await submit({
      kind: "sales",
      email: "ravi@other.example",
      name: "Ravi K",
      companyName: "Other Co",
    });
  });

  it("lists, filters, searches and counts", async () => {
    const all = await call("/platform/admin/leads", { as: U.pSales });
    expect(all.body.data.total).toBe(2);
    expect(all.body.data.counts).toMatchObject({ total: 2, new: 2 });
    expect(all.body.data.leads[0]).not.toHaveProperty("email");
    expect(all.body.data.leads[0]).not.toHaveProperty("phone");

    const search = await call("/platform/admin/leads?search=other", {
      as: U.pSales,
    });
    expect(search.body.data.leads.map((l: any) => l.companyName)).toEqual([
      "Other Co",
    ]);
    const kind = await call("/platform/admin/leads?kind=demo", {
      as: U.pSales,
    });
    expect(kind.body.data.total).toBe(1);
  });

  it("moves a lead through stages, stamping when each was first reached, and audits without personal details", async () => {
    const id = leads()[0].id;
    const r = await call(`/platform/admin/leads/${id}`, {
      method: "PATCH",
      body: {
        status: "demo_scheduled",
        ownerId: U.pSales,
        lastContactedAt: "2026-11-10T10:00:00+05:30",
        nextFollowUpAt: "2026-11-12T10:00:00+05:30",
      },
      as: U.pSales,
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      status: "demo_scheduled",
      ownerId: U.pSales,
      ownerName: expect.stringContaining("Staff"),
    });
    const stored = leads()[0];
    expect(stored.qualifiedAt).toBeInstanceOf(Date);
    expect(stored.demoScheduledAt).toBeInstanceOf(Date);
    expect(stored.convertedAt ?? null).toBeNull();

    expect(mockAudit).toHaveLength(1);
    const audit = JSON.stringify(mockAudit[0]);
    expect(audit).toContain(id);
    expect(audit).toContain("demo_scheduled");
    expect(audit).not.toMatch(/asha|Example Industries|98765/i);
  });

  it("only assigns leads to people who manage leads", async () => {
    const id = leads()[0].id;
    for (const who of [U.pViewer, U.pAdmin, U.aOwner]) {
      const r = await call(`/platform/admin/leads/${id}`, {
        method: "PATCH",
        body: { ownerId: who },
        as: U.pOwner,
      });
      expect(r.status).toBe(400);
    }
    const owners = await call("/platform/admin/leads/owners", {
      as: U.pOwner,
    });
    expect(owners.body.data.owners.map((o: any) => o.id).sort()).toEqual(
      [U.pOwner, U.pSales].sort(),
    );
  });

  it("adds notes with their author; the audit log records only that a note was added", async () => {
    const id = leads()[0].id;
    const r = await call(`/platform/admin/leads/${id}/notes`, {
      method: "POST",
      body: { body: "Called, asked for a Friday demo." },
      as: U.pSales,
    });
    expect(r.status).toBe(201);
    expect(r.body.data.notes[0]).toMatchObject({
      body: "Called, asked for a Friday demo.",
      authorId: U.pSales,
    });
    expect(JSON.stringify(mockAudit)).not.toContain("Friday");
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect(
      (await call(`/platform/admin/leads/${id(99)}`, { as: U.pSales })).status,
    ).toBe(404);
    expect(
      (await call(`/platform/admin/leads/nope`, { as: U.pSales })).status,
    ).toBe(404);
  });

  it("reports funnel rates by stage reached and by channel", async () => {
    const [a, b] = leads();
    a.utmSource = "linkedin";
    a.qualifiedAt = a.demoScheduledAt = a.convertedAt = new Date();
    a.status = "converted";
    b.status = "lost";
    const r = await call("/platform/admin/leads/metrics?range=30d", {
      as: U.pViewer,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.totals).toEqual({
      leads: 2,
      qualified: 1,
      demos: 1,
      converted: 1,
    });
    expect(r.body.data.rates).toMatchObject({
      leadToDemo: 50,
      demoToCustomer: 100,
      leadToCustomer: 50,
    });
    expect(r.body.data.channels.map((c: any) => c.channel).sort()).toEqual([
      "direct",
      "linkedin",
    ]);
  });
});

// ── Pure rules ──────────────────────────────────────────────────────────────

describe("lead rules", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(0) 98765 43210", "+919876543210"],
    ["+44 20 7946 0958", "+442079460958"],
    ["12345", null],
    ["5876543210", null],
    ["+0 123", null],
    ["call me", null],
  ])("normalizePhone(%j) = %j", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it("keeps campaign labels and drops personal or odd values", () => {
    expect(cleanAttributionValue("diwali_2026")).toBe("diwali_2026");
    expect(cleanAttributionValue("a@b.com")).toBeUndefined();
    expect(cleanAttributionValue("a%40b.com")).toBeUndefined();
    expect(cleanAttributionValue("+919876543210")).toBeUndefined();
    expect(cleanAttributionValue("<script>")).toBeUndefined();
    expect(cleanAttributionValue("x".repeat(101))).toBeUndefined();
    expect(cleanLandingPage("/book-demo?email=a@b.com")).toBe("/book-demo");
    expect(cleanLandingPage("https://evil.example/")).toBeUndefined();
    expect(sanitizeAttribution({ referrerHost: "not a host" })).toEqual({});
  });

  it("stamps stages once, and a demo implies qualification", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(stageStamps({}, "demo_scheduled", now)).toEqual({
      qualifiedAt: now,
      demoScheduledAt: now,
    });
    expect(stageStamps({ qualifiedAt: new Date(0) }, "converted", now)).toEqual(
      {
        convertedAt: now,
      },
    );
    expect(stageStamps({}, "contacted", now)).toEqual({});
    expect(stageStamps({}, "lost", now)).toEqual({ lostAt: now });
  });
});
