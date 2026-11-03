import { prismaWithTenant as prisma } from "@hrms/db";
import { getDashboardData } from "../handlers/dashboard";
import { listHolidays } from "../handlers/general";

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
    assetIssue: model(),
    jobOpening: model(),
    jobApplication: model(),
    applicationStageEvent: model(),
    offer: model(),
  };
  return {
    markHandlerStart: jest.fn(),
    limitReads: jest.fn(),
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

// A minimal stand-in for the shared cache (stores JSON, like Redis).
jest.mock("@hrms/cache", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    cacheManager: {
      getOrSet: jest.fn(async (key: string, load: () => any, opts: any) => {
        if (!opts?.fresh && store.has(key)) return JSON.parse(store.get(key)!);
        const value = await load();
        store.set(key, JSON.stringify(value));
        return value;
      }),
    },
  };
});

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

jest.mock("../handlers/general", () => ({
  listHolidays: jest.fn().mockResolvedValue([]),
}));

jest.mock("../utils/planLimits", () => ({
  getSeatStatus: jest
    .fn()
    .mockResolvedValue({ activeCount: 10, limit: 25, tier: "growth" }),
}));

const db = prisma as any;
const d = (iso: string) => new Date(iso);

// "Today" is 2026-11-15 (UTC). Expected figures are worked out by hand from
// these rows; the widgets used to get them from separate filtered queries.
const ROSTER = [
  {
    id: "u1",
    username: "u1",
    employeeStatus: "Active",
    department: "Eng",
    joining_date: d("2026-11-03"),
    createdAt: d("2026-11-03"),
    kyc_approval: "Pending",
  },
  {
    id: "u2",
    username: "u2",
    employeeStatus: "Active",
    department: "Eng",
    joining_date: d("2025-01-10"),
    createdAt: d("2025-01-10"),
  },
  {
    id: "u3",
    username: "u3",
    employeeStatus: "Active",
    department: null,
    joining_date: d("2026-11-20"),
    createdAt: d("2026-11-01"),
  },
  {
    id: "u4",
    username: "u4",
    employeeStatus: "Active",
    department: "",
    joining_date: d("2026-12-01"),
    createdAt: d("2026-11-01"),
  },
  {
    id: "u5",
    username: "u5",
    employeeStatus: "Resigned",
    department: "Eng",
    joining_date: d("2024-05-01"),
    createdAt: d("2024-05-01"),
    dateOfTermination: d("2026-10-10"),
    kyc_approval: "Pending",
  },
  {
    id: "u6",
    username: "u6",
    employeeStatus: "Active",
    department: "Sales",
    joining_date: null,
    createdAt: d("2026-02-01"),
  },
];
const RESIGNATIONS = [
  {
    userId: "u2",
    status: "Approved",
    lastWorkingDay: d("2026-11-28"),
    relievedFromDutyOn: null,
  },
  {
    userId: "u5",
    status: "Approved",
    lastWorkingDay: d("2026-10-10"),
    relievedFromDutyOn: d("2026-10-11"),
  },
  {
    userId: "u6",
    status: "Submitted",
    lastWorkingDay: d("2026-12-05"),
    relievedFromDutyOn: null,
  },
  {
    userId: "u1",
    status: "Approved",
    lastWorkingDay: null,
    relievedFromDutyOn: null,
  },
];

const fetchWidgets = async (
  ids: string,
  user: any = { userId: "boss", tenantId: "tenant-a", tenantRole: "hr" },
) => {
  const res = { json: jest.fn() } as any;
  await getDashboardData(
    {
      user,
      query: { ids },
      body: {},
    } as any,
    res,
  );
  return res.json.mock.calls[0][0].data.widgets;
};

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
  });
  jest.setSystemTime(new Date("2026-11-15T10:00:00Z"));
});
afterAll(() => jest.useRealTimers());

const { __store: cacheStore } = jest.requireMock("@hrms/cache");

beforeEach(() => {
  jest.clearAllMocks();
  cacheStore.clear();
  db.dashboardPreference.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ isSuperUser: true, permissions: [] });
  db.team.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue(ROSTER);
  db.resignation.findMany.mockResolvedValue(RESIGNATIONS);
  db.tenantJoinRequest.count.mockResolvedValue(4);
});

describe("dashboard widgets computed from the shared tenant rows", () => {
  it("workforce: active headcount, departments as grouped, month joiners and leavers", async () => {
    const w = await fetchWidgets("workforce");
    expect(w.workforce.ok).toBe(true);
    const data = w.workforce.data;
    expect(data.active).toBe(5);
    expect(data.joinersThisMonth).toBe(2); // u1 (3rd) and u3 (20th)
    expect(data.leavingThisMonth).toBe(1); // u2; an approval without a date never counts
    // null and "" stay separate groups, both labelled Unassigned.
    expect(data.departments).toHaveLength(4);
    expect(data.departments[0]).toEqual({ department: "Eng", count: 2 });
    expect(data.departments).toEqual(
      expect.arrayContaining([
        { department: "Sales", count: 1 },
        { department: "Unassigned", count: 1 },
      ]),
    );
    expect(
      data.departments.filter((x: any) => x.department === "Unassigned"),
    ).toHaveLength(2);
  });

  it("joiners-leavers: the next 30 days, approved exits only, soonest first", async () => {
    const w = await fetchWidgets("joiners-leavers");
    const data = w["joiners-leavers"].data;
    expect(data.joining.map((p: any) => p.id)).toEqual(["u3", "u4"]);
    expect(data.leaving.map((p: any) => p.id)).toEqual(["u2"]);
    expect(data.leaving[0].date).toEqual(d("2026-11-28"));
  });

  it("headcount-trend: month-end headcount, joins and exits", async () => {
    const w = await fetchWidgets("headcount-trend");
    const series = w["headcount-trend"].data.series;
    const oct = series.find((m: any) => m.month === "2026-10");
    const nov = series.find((m: any) => m.month === "2026-11");
    expect(oct).toEqual({
      month: "2026-10",
      headcount: 2,
      joined: 0,
      exits: 1,
    });
    expect(nov).toEqual({
      month: "2026-11",
      headcount: 3,
      joined: 2,
      exits: 0,
    });
  });

  it("hr-queue: KYC across all statuses, submitted exits only", async () => {
    const w = await fetchWidgets("hr-queue");
    expect(w["hr-queue"].ok).toBe(true);
    expect(w["hr-queue"].data.kyc).toBe(2);
    expect(w["hr-queue"].data.exits).toBe(1);
    expect(w["hr-queue"].data.joins).toBe(4);
  });

  it("reads each shared set once per request, however many widgets use it", async () => {
    await fetchWidgets(
      "workforce,joiners-leavers,headcount-trend,hr-queue,org-admin,attendance-trend",
    );
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.resignation.findMany).toHaveBeenCalledTimes(1);
    expect(db.tenantJoinRequest.count).toHaveBeenCalledTimes(1);
    expect(db.user.count).not.toHaveBeenCalled();
    // The layout's department list comes from the same rows.
    expect(db.user.groupBy).not.toHaveBeenCalled();
    expect(db.holiday.findMany).not.toHaveBeenCalled();
    expect(db.holiday.findFirst).not.toHaveBeenCalled();
    expect(listHolidays).toHaveBeenCalledWith(2026);
  });
});

describe("dashboard tenant caches", () => {
  const ALL =
    "attendance-trend,headcount-trend,hiring,hr-queue,joiners-leavers,org-admin,payroll,payslip,review-cycle,workforce";

  it("serves a repeat request's tenant-wide figures from the cache", async () => {
    const first = await fetchWidgets(ALL);
    const reads = () =>
      db.user.findMany.mock.calls.length +
      db.resignation.findMany.mock.calls.length +
      db.ticket.count.mock.calls.length +
      db.attendanceRecord.findMany.mock.calls.length +
      db.jobOpening.count.mock.calls.length +
      db.payrollRun.findFirst.mock.calls.length;
    const before = reads();

    const second = await fetchWidgets(ALL);

    expect(reads()).toBe(before);
    expect(JSON.parse(JSON.stringify(second))).toEqual(
      JSON.parse(JSON.stringify(first)),
    );
  });

  it("keys every entry by the caller's tenant", async () => {
    await fetchWidgets(ALL);
    const keys = [...cacheStore.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.startsWith("t:tenant-a:")).toBe(true);
  });

  it("applies the viewer's own capabilities to cached tenant counts", async () => {
    db.ticket.count.mockResolvedValue(3);
    await fetchWidgets("hr-queue"); // HR superuser fills the cache

    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Helpdesk:manage"],
    });
    const w = await fetchWidgets("hr-queue", {
      userId: "agent",
      tenantId: "tenant-a",
      tenantRole: "employee",
    });

    expect(w["hr-queue"].data.tickets).toBe(3);
    expect(w["hr-queue"].data.kyc).toBeNull();
    expect(w["hr-queue"].data.advances).toBeNull();
    expect(w["hr-queue"].data.joins).toBeNull();
  });

  it("still refuses organisation widgets to an employee when the cache is warm", async () => {
    await fetchWidgets("workforce"); // warm
    db.user.findUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
    const w = await fetchWidgets("workforce", {
      userId: "e1",
      tenantId: "tenant-a",
      tenantRole: "employee",
    });
    expect(w.workforce).toEqual({ ok: false, error: "forbidden" });
  });
});
