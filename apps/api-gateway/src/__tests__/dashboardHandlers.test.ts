import { prismaWithTenant as prisma } from "@hrms/db";
import {
  getDashboard,
  getDashboardData,
  resetDashboardPreferences,
  saveDashboardPreferences,
} from "../handlers/dashboard";

jest.mock("@hrms/db", () => {
  const model = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  });
  const _db: any = {
    user: model(),
    team: model(),
    attendanceRecord: model(),
    leaveApplication: model(),
    wfhRequest: model(),
    holiday: model(),
    resignation: model(),
    ticket: model(),
    salaryAdvance: model(),
    performanceReview: model(),
    performanceReviewCycle: model(),
    payrollRun: model(),
    payrollLineItem: model(),
    dashboardPreference: model(),
    tenantJoinRequest: model(),
    tenant: model(),
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("tenant-a"),
  };
});

jest.mock("@hrms/common", () => ({
  hasPrivilegedRole: (
    role: string | null | undefined,
    allowed: readonly string[] = ["owner", "admin"],
  ) => !!role && allowed.includes(role),
  HR_ROLES: ["owner", "admin", "hr"],
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../grpc/clients", () => ({
  leaveClient: {},
  grpcCall: jest.fn().mockResolvedValue({
    data: {
      balances: JSON.stringify({ PL: { name: "Paid Leave", remaining: 9 } }),
    },
  }),
}));

jest.mock("./../handlers/tenantSettings", () => ({
  getActiveSettings: jest.fn().mockResolvedValue({
    workWeekPattern: { workingDays: [0, 1, 2, 3, 4, 5, 6] },
  }),
}));

jest.mock("../utils/planLimits", () => ({
  getSeatStatus: jest
    .fn()
    .mockResolvedValue({ activeCount: 10, limit: 25, tier: "growth" }),
}));

const db = prisma as any;
const makeRes = () => ({ json: jest.fn() }) as any;
const req = (user: any, extra: any = {}) =>
  ({
    user: { tenantId: "tenant-a", ...user },
    query: {},
    body: {},
    ...extra,
  }) as any;
const body = (res: any) => res.json.mock.calls[0][0];

const asEmployee = () => {
  db.user.findUnique.mockResolvedValue({ isSuperUser: false, permissions: [] });
  db.team.findMany.mockResolvedValue([]);
};
const asTeamLead = () => {
  db.user.findUnique.mockResolvedValue({ isSuperUser: false, permissions: [] });
  db.team.findMany.mockResolvedValue([
    { id: "team-1", teamName: "Design", members: ["m1", "m2", "lead"] },
  ]);
};

beforeEach(() => {
  jest.clearAllMocks();
  db.dashboardPreference.findUnique.mockResolvedValue(null);
});

describe("GET /dashboard", () => {
  it("lists only personal widgets for an employee", async () => {
    asEmployee();
    const res = makeRes();
    await getDashboard(req({ userId: "e1", tenantRole: "employee" }), res);
    const ids = body(res).data.widgets.map((w: any) => w.id);
    expect(ids).toContain("leave-balance");
    for (const id of [
      "org-today",
      "workforce",
      "team-today",
      "payroll",
      "hr-queue",
      "hiring",
    ])
      expect(ids).not.toContain(id);
    expect(body(res).data.customized).toBe(false);
  });

  it("derives team leadership from Team.teamLeaderId, not a role name", async () => {
    asTeamLead();
    const res = makeRes();
    await getDashboard(req({ userId: "lead", tenantRole: "employee" }), res);
    const d = body(res).data;
    expect(d.capabilities).toContain("teamLead");
    expect(d.widgets.map((w: any) => w.id)).toContain("team-today");
    const team = d.widgets.find((w: any) => w.id === "team-today");
    expect(team.settings.team.options.map((o: any) => o.value)).toEqual([
      "all",
      "team-1",
    ]);
  });

  it("does not treat the 'manager' membership role as team leadership", async () => {
    asEmployee();
    const res = makeRes();
    await getDashboard(req({ userId: "m", tenantRole: "manager" }), res);
    expect(body(res).data.capabilities).not.toContain("teamLead");
  });

  it("grants widgets from custom permission grants without HR access", async () => {
    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["JobOpenings:view_job_openings", "Helpdesk:manage"],
    });
    db.team.findMany.mockResolvedValue([]);
    const res = makeRes();
    await getDashboard(req({ userId: "x", tenantRole: "employee" }), res);
    const ids = body(res).data.widgets.map((w: any) => w.id);
    expect(ids).toContain("hiring");
    expect(ids).toContain("hr-queue");
    expect(ids).not.toContain("org-today");
  });

  it("re-validates a saved layout against current access", async () => {
    asEmployee();
    db.dashboardPreference.findUnique.mockResolvedValue({
      version: 1,
      widgets: [
        { id: "org-today", visible: true, size: "wide", settings: {} },
        { id: "payslip", visible: true, size: "standard", settings: {} },
      ],
    });
    const res = makeRes();
    await getDashboard(req({ userId: "e1", tenantRole: "employee" }), res);
    const layout = body(res).data.layout.map((e: any) => e.id);
    expect(layout[0]).toBe("payslip");
    expect(layout).not.toContain("org-today");
  });

  it("reads preferences for the caller's own tenant and user only", async () => {
    asEmployee();
    await getDashboard(
      req({ userId: "e1", tenantRole: "employee" }),
      makeRes(),
    );
    expect(db.dashboardPreference.findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "tenant-a", userId: "e1" } },
    });
  });
});

describe("GET /dashboard/data", () => {
  it("refuses organisation widgets to an employee, even when asked directly", async () => {
    asEmployee();
    const res = makeRes();
    await getDashboardData(
      req(
        { userId: "e1", tenantRole: "employee" },
        {
          query: {
            ids: "org-today,workforce,team-today,payroll,leave-balance",
          },
        },
      ),
      res,
    );
    const w = body(res).data.widgets;
    expect(w["org-today"]).toEqual({ ok: false, error: "forbidden" });
    expect(w.workforce).toEqual({ ok: false, error: "forbidden" });
    expect(w["team-today"]).toEqual({ ok: false, error: "forbidden" });
    expect(w.payroll).toEqual({ ok: false, error: "forbidden" });
    expect(w["leave-balance"].ok).toBe(true);
    expect(w["leave-balance"].data.types).toEqual([
      { key: "PL", name: "Paid Leave", remaining: 9 },
    ]);
    // No organisation-wide query ran.
    expect(db.payrollRun.findFirst).not.toHaveBeenCalled();
  });

  it("scopes team data to members of teams the caller leads", async () => {
    asTeamLead();
    db.user.findMany.mockResolvedValue([
      { id: "m1", username: "m1", first_name: "Mira" },
      { id: "m2", username: "m2", first_name: "Omar" },
    ]);
    db.attendanceRecord.findMany.mockResolvedValue([
      { userId: "m1", timeIn: new Date(), timeOut: null },
    ]);
    db.leaveApplication.findMany.mockResolvedValue([]);
    db.wfhRequest.findMany.mockResolvedValue([{ userId: "m1" }]);
    const res = makeRes();
    await getDashboardData(
      req(
        { userId: "lead", tenantRole: "employee" },
        { query: { ids: "team-today" } },
      ),
      res,
    );
    const userQuery = db.user.findMany.mock.calls[0][0];
    expect(userQuery.where.id.in.sort()).toEqual(["m1", "m2"]);
    const data = body(res).data.widgets["team-today"].data;
    expect(data.counts).toEqual({
      total: 2,
      in: 1,
      wfh: 1,
      leave: 0,
      notIn: 1,
    });
    const omar = data.members.find((m: any) => m.id === "m2");
    expect(omar.status).toBe("notIn");
  });

  it("uses saved settings, not anything in the query string", async () => {
    asTeamLead();
    db.dashboardPreference.findUnique.mockResolvedValue({
      version: 1,
      widgets: [
        {
          id: "team-leave",
          visible: true,
          size: "standard",
          settings: { days: 30 },
        },
      ],
    });
    const res = makeRes();
    await getDashboardData(
      req({ userId: "lead" }, { query: { ids: "team-leave", days: "365" } }),
      res,
    );
    expect(body(res).data.widgets["team-leave"].data.days).toBe(30);
  });

  it("reports one failing widget without failing the rest", async () => {
    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
    db.team.findMany.mockResolvedValue([]);
    db.payrollRun.findMany.mockRejectedValueOnce(new Error("boom"));
    const res = makeRes();
    await getDashboardData(
      req(
        { userId: "e1", tenantRole: "employee" },
        { query: { ids: "payslip,leave-balance" } },
      ),
      res,
    );
    const w = body(res).data.widgets;
    expect(w.payslip).toEqual({ ok: false, error: "failed" });
    expect(w["leave-balance"].ok).toBe(true);
  });

  it("only shows HR queue lines the caller can act on", async () => {
    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Helpdesk:manage"],
    });
    db.team.findMany.mockResolvedValue([]);
    db.ticket.count.mockResolvedValue(3);
    const res = makeRes();
    await getDashboardData(
      req(
        { userId: "x", tenantRole: "employee" },
        { query: { ids: "hr-queue" } },
      ),
      res,
    );
    const d = body(res).data.widgets["hr-queue"].data;
    expect(d.tickets).toBe(3);
    expect(d.kyc).toBeNull();
    expect(d.advances).toBeNull();
    expect(db.user.count).not.toHaveBeenCalled();
  });
});

describe("PUT/DELETE /dashboard/preferences", () => {
  it("stores a sanitized layout for the caller's tenant", async () => {
    asEmployee();
    const res = makeRes();
    await saveDashboardPreferences(
      req(
        { userId: "e1", tenantRole: "employee" },
        {
          body: {
            version: 1,
            widgets: [
              { id: "payroll", visible: true, size: "wide", settings: {} },
              { id: "agenda", visible: true, size: "wide", settings: {} },
              { id: "my-day", visible: false, size: "wide", settings: {} },
            ],
          },
        },
      ),
      res,
    );
    const call = db.dashboardPreference.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId_userId: { tenantId: "tenant-a", userId: "e1" },
    });
    const ids = call.create.widgets.map((w: any) => w.id);
    expect(ids).not.toContain("payroll");
    expect(ids.slice(0, 2)).toEqual(["agenda", "my-day"]);
    expect(call.create.widgets[1].visible).toBe(false);
  });

  it("rejects an unknown layout version", async () => {
    asEmployee();
    const res = makeRes();
    await saveDashboardPreferences(
      req({ userId: "e1" }, { body: { version: 99, widgets: [] } }),
      res,
    );
    expect(body(res).status).toBe(400);
    expect(db.dashboardPreference.upsert).not.toHaveBeenCalled();
  });

  it("resets to the role default", async () => {
    asTeamLead();
    const res = makeRes();
    await resetDashboardPreferences(req({ userId: "lead" }), res);
    expect(db.dashboardPreference.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", userId: "lead" },
    });
    const visible = body(res)
      .data.layout.filter((e: any) => e.visible)
      .map((e: any) => e.id);
    expect(visible).toContain("team-today");
    expect(body(res).data.customized).toBe(false);
  });
});
