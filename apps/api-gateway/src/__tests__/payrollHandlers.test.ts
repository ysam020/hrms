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
    payrollLineItem: { createMany: jest.fn(), findMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findMany: jest.fn() },
    professionalTaxSlab: { findMany: jest.fn() },
    incomeTaxSlab: { findMany: jest.fn() },
    taxDeclaration: { findMany: jest.fn() },
    salaryComponentDefinition: { findMany: jest.fn() },
    salaryAdvance: { findMany: jest.fn() },
    salaryStructure: { findMany: jest.fn() },
    payCycle: { findFirst: jest.fn() },
    tenantSettings: { findFirst: jest.fn() },
    holiday: { findMany: jest.fn() },
    resignation: { findMany: jest.fn() },
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
const mockRunFindManyForTds = (prisma as any).payrollRun.findMany as jest.Mock;
const mockLineItemCreateMany = (prisma as any).payrollLineItem
  .createMany as jest.Mock;
const mockAttendanceFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;
const mockLeaveBalanceFindMany = (prisma as any).leaveBalance
  .findMany as jest.Mock;
const mockPtSlabFindMany = (prisma as any).professionalTaxSlab
  .findMany as jest.Mock;
const mockIncomeTaxSlabFindMany = (prisma as any).incomeTaxSlab
  .findMany as jest.Mock;
const mockTaxDeclarationFindMany = (prisma as any).taxDeclaration
  .findMany as jest.Mock;
const mockLineItemFindMany = (prisma as any).payrollLineItem
  .findMany as jest.Mock;
const mockComponentFindMany = (prisma as any).salaryComponentDefinition
  .findMany as jest.Mock;
const mockAdvanceFindMany = (prisma as any).salaryAdvance.findMany as jest.Mock;
const mockTenantSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockHolidayFindMany = (prisma as any).holiday.findMany as jest.Mock;
const mockPayCycleFindFirst = (prisma as any).payCycle.findFirst as jest.Mock;
const mockResignationFindMany = (prisma as any).resignation
  .findMany as jest.Mock;
const mockStructureFindMany = (prisma as any).salaryStructure
  .findMany as jest.Mock;

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
    mockIncomeTaxSlabFindMany.mockResolvedValue([]);
    mockTaxDeclarationFindMany.mockResolvedValue([]);
    mockLineItemFindMany.mockResolvedValue([]);
    mockRunFindManyForTds.mockResolvedValue([]);
    mockResignationFindMany.mockResolvedValue([]);
    mockStructureFindMany.mockResolvedValue([]);
  });

  it("uses the employee's own configured Basic/HRA/Conveyance, prorated by attendance, instead of the fixed 50/25/25 split", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "emp-1" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-1",
        grossEarnings: 30000,
        basicPay: 20000,
        hra: 6000,
        conveyance: 4000,
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
    mockUserFindMany.mockResolvedValue([{ id: "emp-2" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-2",
        grossEarnings: 30000,
        basicPay: null,
        hra: null,
        conveyance: null,
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

  it("skips an employee with no salary structure instead of creating a ₹0 payslip", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "emp-no-salary" },
      { id: "emp-4" },
    ]);
    // emp-no-salary has no SalaryStructure row at all — not one with a null
    // gross, genuinely absent.
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-4",
        grossEarnings: 20000,
        basicPay: 10000,
        hra: 5000,
        conveyance: 5000,
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        userId: "emp-4",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, i + 1)),
      })),
    );

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    const [[createManyArg]] = mockLineItemCreateMany.mock.calls;
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toEqual(
      expect.objectContaining({ userId: "emp-4" }),
    );

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.data.skippedEmployees).toEqual([
      { userId: "emp-no-salary", reason: "No salary structure" },
    ]);
    expect(responseArg.data.employeeCount).toBe(1);
  });

  it("includes and prorates an employee who resigned mid-month instead of silently dropping them from the run", async () => {
    // No currently-active employees — this user's employeeStatus already
    // flipped away from "Active" the day after their lastWorkingDay.
    mockUserFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "emp-exited", joining_date: null }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-exited",
        grossEarnings: 30000,
        basicPay: 20000,
        hra: 6000,
        conveyance: 4000,
      },
    ]);
    mockResignationFindMany.mockResolvedValue([
      {
        userId: "emp-exited",
        lastWorkingDay: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, 15)),
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        userId: "emp-exited",
        status: "Present",
        date: new Date(Date.UTC(PAST_YEAR, PAST_MONTH - 1, i + 1)),
      })),
    );

    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );

    const [[createManyArg]] = mockLineItemCreateMany.mock.calls;
    expect(createManyArg.data).toHaveLength(1);
    const lineItem = createManyArg.data[0];
    expect(lineItem.userId).toBe("emp-exited");
    // Prorated for ~half the month, not silently zero and not full salary.
    expect(lineItem.grossSalary).toBeGreaterThan(0);
    expect(lineItem.grossSalary).toBeLessThan(30000);
  });

  it("uses the tenant's configured PF/ESI rates instead of the 12%/1.75% defaults", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "emp-3" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-3",
        grossEarnings: 20000,
        basicPay: 10000,
        hra: 0,
        conveyance: 0,
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
    mockUserFindMany.mockResolvedValue([{ id: "emp-4" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-4",
        grossEarnings: 31000,
        basicPay: null,
        hra: null,
        conveyance: null,
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
    mockUserFindMany.mockResolvedValue([{ id: "emp-5" }]);
    mockStructureFindMany.mockResolvedValue([
      {
        userId: "emp-5",
        grossEarnings: 31000,
        basicPay: null,
        hra: null,
        conveyance: null,
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
      mockUserFindMany.mockResolvedValue([{ id: "emp-1" }]);
      mockStructureFindMany.mockResolvedValue([
        { userId: "emp-1", grossEarnings: 30000 },
      ]);
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
      mockUserFindMany.mockResolvedValue([{ id: "emp-1" }]);
      mockStructureFindMany.mockResolvedValue([
        { userId: "emp-1", grossEarnings: 30000 },
      ]);
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
      mockUserFindMany.mockResolvedValue([{ id: "emp-1" }]);
      mockStructureFindMany.mockResolvedValue([
        { userId: "emp-1", grossEarnings: 30000 },
      ]);
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
      mockUserFindMany.mockResolvedValue([{ id: "emp-1" }]);
      mockStructureFindMany.mockResolvedValue([
        { userId: "emp-1", grossEarnings: 30000 },
      ]);
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
  const mockLineItemFindMany = (prisma as any).payrollLineItem
    .findMany as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // SalaryStructure only ever holds the HR-configured salary (never touched
  // by disbursement — see payrollDisbursement.ts), so a payslip's actual
  // paid figures come from the disbursed run's PayrollLineItem instead.
  it("returns a payslip per disbursed PayrollRun's line item", async () => {
    mockRunFindMany.mockResolvedValue([
      { id: "run-may", year: 2026, month: 5 },
    ]);
    mockLineItemFindMany.mockResolvedValue([
      {
        userId: "hr-1",
        payrollRunId: "run-may",
        netPayable: 93050,
        grossSalary: 100000,
        basicPay: 50000,
        hra: 25000,
        conveyance: 25000,
        incentive: 0,
        pf: 6000,
        esi: 0,
        pt: 200,
        otherDeductions: 0,
        advanceDeduction: 0,
        tds: 0,
        componentBreakdown: null,
      },
    ]);
    const res = makeRes();

    await getMyPayslips(makeReq(), res);

    expect(mockLineItemFindMany.mock.calls[0][0].where.payrollRunId).toEqual({
      in: ["run-may"],
    });
    const data = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual([
      expect.objectContaining({
        userId: "hr-1",
        year: 2026,
        month: 5,
        netPayable: 93050,
      }),
    ]);
  });

  it("returns an empty list when no payroll run has ever disbursed", async () => {
    mockRunFindMany.mockResolvedValue([]);
    mockLineItemFindMany.mockResolvedValue([]);
    const res = makeRes();

    await getMyPayslips(makeReq(), res);

    const data = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(data).toEqual([]);
  });
});
