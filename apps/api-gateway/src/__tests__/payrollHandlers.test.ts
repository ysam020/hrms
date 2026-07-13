import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { initiatePayrollRun, getMyPayslips } from "../handlers/payroll";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    tenant: { findUnique: jest.fn() },
    payrollRun: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    payrollLineItem: { createMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findMany: jest.fn() },
    professionalTaxSlab: { findMany: jest.fn() },
    salaryComponentDefinition: { findMany: jest.fn() },
    salaryAdvance: { findMany: jest.fn() },
    salaryStructure: { findMany: jest.fn() },
    payCycle: { findFirst: jest.fn() },
    tenantSettings: { findFirst: jest.fn() },
    holiday: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    CONFLICT: 409,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/webhookEmitter", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

// payroll.ts imports getActiveSettings from ./tenantSettings, which imports
// the real @hrms/cache (ioredis) at module load — without this mock, a
// Redis connection attempt against a nonexistent local instance hangs the
// whole test file.
jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockRunFindUnique = (prisma as any).payrollRun.findUnique as jest.Mock;
const mockRunCreate = (prisma as any).payrollRun.create as jest.Mock;
const mockLineItemCreateMany = (prisma as any).payrollLineItem
  .createMany as jest.Mock;
const mockAttendanceFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;
const mockLeaveBalanceFindMany = (prisma as any).leaveBalance
  .findMany as jest.Mock;
const mockPtSlabFindMany = (prisma as any).professionalTaxSlab
  .findMany as jest.Mock;
const mockComponentFindMany = (prisma as any).salaryComponentDefinition
  .findMany as jest.Mock;
const mockAdvanceFindMany = (prisma as any).salaryAdvance.findMany as jest.Mock;
const mockTenantSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockHolidayFindMany = (prisma as any).holiday.findMany as jest.Mock;
const mockPayCycleFindFirst = (prisma as any).payCycle.findFirst as jest.Mock;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "hr-1", tenantId: "t1", tenantRole: "hr" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;
const makeRes = () => ({ json: jest.fn() }) as any;

// A past month/year relative to any real test-run date, so the "past months
// only" guard never rejects these fixtures.
const PAST_MONTH = 1;
const PAST_YEAR = 2020;

describe("initiatePayrollRun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantId as jest.Mock).mockReturnValue("t1");
    mockUserFindUnique.mockResolvedValue({
      role: ["hr"],
      isSuperUser: false,
    });
    mockRunFindUnique.mockResolvedValue(null);
    mockRunCreate.mockResolvedValue({ id: "run-1", status: "draft" });
    mockLineItemCreateMany.mockResolvedValue({ count: 1 });
    mockAttendanceFindMany.mockResolvedValue([]);
    mockLeaveBalanceFindMany.mockResolvedValue([]);
    mockPtSlabFindMany.mockResolvedValue([]);
    mockComponentFindMany.mockResolvedValue([]);
    mockAdvanceFindMany.mockResolvedValue([]);
    mockTenantFindUnique.mockResolvedValue({ workState: null });
    mockTenantSettingsFindFirst.mockResolvedValue(null);
    mockHolidayFindMany.mockResolvedValue([]);
    mockPayCycleFindFirst.mockResolvedValue(null);
  });

  it("uses the employee's own configured Basic/HRA/Conveyance, prorated by attendance, instead of the fixed 50/25/25 split", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        salaryBasicPay: 20000,
        salaryHra: 6000,
        salaryConveyance: 4000,
      },
    ]);
    // Full attendance for the month — proration ratio effectively 1 once
    // capped, so the configured full-month values pass through unchanged.
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        userId: "emp-1",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, i + 1)),
      })),
    );

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    expect(mockLineItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "emp-1",
          basicPay: 20000,
          hra: 6000,
          conveyance: 4000,
        }),
      ]),
    });
  });

  it("falls back to the fixed 50/25/25 split when the employee has no configured salary structure yet", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-2",
        salary: 30000,
        salaryBasicPay: null,
        salaryHra: null,
        salaryConveyance: null,
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        userId: "emp-2",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, i + 1)),
      })),
    );

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    expect(mockLineItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "emp-2",
          basicPay: 15000, // 50% of 30000
          hra: 7500, // 25%
          conveyance: 7500, // 25%
        }),
      ]),
    });
  });

  it("uses the tenant's configured PF/ESI rates instead of the 12%/1.75% defaults", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-3",
        salary: 20000,
        salaryBasicPay: 10000,
        salaryHra: 0,
        salaryConveyance: 0,
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        userId: "emp-3",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, i + 1)),
      })),
    );
    mockComponentFindMany.mockResolvedValue([
      { code: "PF", percentValue: 10 },
      { code: "ESI", percentValue: 1 },
    ]);

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    expect(mockLineItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "emp-3",
          pf: 1000, // 10% of basicPay (10000), not the 12% default
          esi: 200, // 1% of gross (20000), not the 1.75% default
        }),
      ]),
    });
  });

  it("treats an unrecorded weekend date as an implicit paid Week Off, not an unpaid gap", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-4",
        salary: 31000,
        salaryBasicPay: null,
        salaryHra: null,
        salaryConveyance: null,
      },
    ]);
    // Only mark the weekdays of January 2020 as Present — the weekend days
    // are left with no AttendanceRecord at all, as if reconcileAttendance
    // hasn't backfilled them with an explicit "Week Off" status yet.
    const records: any[] = [];
    for (let day = 1; day <= 31; day++) {
      const d = new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, day));
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // skip weekends
      records.push({ userId: "emp-4", status: "Present", date: d });
    }
    mockAttendanceFindMany.mockResolvedValue(records);

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    expect(mockLineItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "emp-4",
          grossSalary: 31000, // full month — weekends implicitly paid
        }),
      ]),
    });
  });

  it("treats an unrecorded date in the tenant's Holiday calendar as an implicit paid Holiday", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-5",
        salary: 31000,
        salaryBasicPay: null,
        salaryHra: null,
        salaryConveyance: null,
      },
    ]);
    // Jan 15, 2020 is a Wednesday (a working day) — mark every other day as
    // Present and leave it with no AttendanceRecord, as if
    // reconcileAttendance hasn't backfilled the configured holiday yet.
    const records: any[] = [];
    for (let day = 1; day <= 31; day++) {
      if (day === 15) continue;
      records.push({
        userId: "emp-5",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, day)),
      });
    }
    mockAttendanceFindMany.mockResolvedValue(records);
    mockHolidayFindMany.mockResolvedValue([
      { holidays: [{ date: "2020-01-15" }] },
    ]);

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    expect(mockLineItemCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "emp-5",
          grossSalary: 31000, // full month — the unrecorded holiday is still paid
        }),
      ]),
    });
  });

  it("returns FORBIDDEN when the caller isn't owner/admin/hr", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
    const res = makeRes();
    await initiatePayrollRun(
      makeReq({
        user: { userId: "emp-1", tenantId: "t1", tenantRole: "employee" },
        body: { month: PAST_MONTH, year: PAST_YEAR },
      }),
      res,
    );
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  describe("pay cycle", () => {
    it("stamps the run with the tenant's default active pay cycle", async () => {
      mockUserFindMany.mockResolvedValue([{ id: "emp-1", salary: 30000 }]);
      mockPayCycleFindFirst.mockResolvedValue({
        id: "cycle-1",
        frequency: "monthly",
        name: "Standard Monthly",
      });

      await initiatePayrollRun(
        makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
        makeRes(),
      );

      expect(mockPayCycleFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "t1",
            isDefault: true,
            isActive: true,
          }),
        }),
      );
      expect(mockRunCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payCycleId: "cycle-1" }),
        }),
      );
    });

    it("uses the explicitly requested payCycleId instead of the default when provided", async () => {
      mockUserFindMany.mockResolvedValue([{ id: "emp-1", salary: 30000 }]);
      mockPayCycleFindFirst.mockResolvedValue({
        id: "cycle-biweekly",
        frequency: "biweekly",
        name: "Biweekly",
      });

      await initiatePayrollRun(
        makeReq({
          body: {
            month: PAST_MONTH,
            year: PAST_YEAR,
            payCycleId: "cycle-biweekly",
          },
        }),
        makeRes(),
      );

      expect(mockPayCycleFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "cycle-biweekly",
            tenantId: "t1",
          }),
        }),
      );
    });

    it("includes a warning in the response when the resolved cycle isn't monthly", async () => {
      mockUserFindMany.mockResolvedValue([{ id: "emp-1", salary: 30000 }]);
      mockPayCycleFindFirst.mockResolvedValue({
        id: "cycle-1",
        frequency: "biweekly",
        name: "Biweekly",
      });
      const res = makeRes();

      await initiatePayrollRun(
        makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
        res,
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warning: expect.stringContaining("biweekly"),
          }),
        }),
      );
    });

    it("does not include a warning when no pay cycle is configured", async () => {
      mockUserFindMany.mockResolvedValue([{ id: "emp-1", salary: 30000 }]);
      const res = makeRes();

      await initiatePayrollRun(
        makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
        res,
      );

      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.warning).toBeUndefined();
      expect(data.payCycleId).toBeNull();
    });
  });
});

describe("getMyPayslips", () => {
  const mockRunFindMany = (prisma as any).payrollRun.findMany as jest.Mock;
  const mockStructureFindMany = (prisma as any).salaryStructure
    .findMany as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("only returns SalaryStructure rows for months that actually disbursed", async () => {
    mockRunFindMany.mockResolvedValue([{ year: 2026, month: 5 }]);
    mockStructureFindMany.mockResolvedValue([
      { userId: "hr-1", year: 2026, month: 7, netPayable: 93800 }, // salary config edited for the current month, never run
      { userId: "hr-1", year: 2026, month: 5, netPayable: 93050 }, // actually disbursed
    ]);
    const res = makeRes();

    await getMyPayslips(makeReq(), res);

    const data = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual([
      { userId: "hr-1", year: 2026, month: 5, netPayable: 93050 },
    ]);
  });

  it("returns an empty list when no payroll run has ever disbursed", async () => {
    mockRunFindMany.mockResolvedValue([]);
    mockStructureFindMany.mockResolvedValue([
      { userId: "hr-1", year: 2026, month: 7, netPayable: 93800 },
    ]);
    const res = makeRes();

    await getMyPayslips(makeReq(), res);

    const data = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual([]);
  });
});
