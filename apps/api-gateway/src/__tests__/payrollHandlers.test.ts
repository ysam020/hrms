import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { initiatePayrollRun } from "../handlers/payroll";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    payrollRun: { findUnique: jest.fn(), create: jest.fn() },
    payrollLineItem: { createMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findMany: jest.fn() },
    professionalTaxSlab: { findMany: jest.fn() },
    salaryComponentDefinition: { findMany: jest.fn() },
    salaryAdvance: { findMany: jest.fn() },
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

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;
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
const mockAdvanceFindMany = (prisma as any).salaryAdvance
  .findMany as jest.Mock;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "hr-1", tenantId: "t1" },
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
  });

  it("uses the employee's own configured Basic/HRA/Conveyance, prorated by attendance, instead of the fixed 50/25/25 split", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "emp-1",
        salary: 30000,
        employmentType: "employee",
        workState: null,
        salaryBasicPay: 20000,
        salaryHra: 6000,
        salaryConveyance: 4000,
      },
    ]);
    // Full attendance for the month — proration ratio effectively 1 once
    // capped, so the configured full-month values pass through unchanged.
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, () => ({ userId: "emp-1", status: "Present" })),
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
        employmentType: "employee",
        workState: null,
        salaryBasicPay: null,
        salaryHra: null,
        salaryConveyance: null,
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, () => ({ userId: "emp-2", status: "Present" })),
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
        employmentType: "employee",
        workState: null,
        salaryBasicPay: 10000,
        salaryHra: 0,
        salaryConveyance: 0,
      },
    ]);
    mockAttendanceFindMany.mockResolvedValue(
      Array.from({ length: 31 }, () => ({ userId: "emp-3", status: "Present" })),
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

  it("returns FORBIDDEN when the caller isn't owner/admin/hr", async () => {
    mockUserFindUnique.mockResolvedValue({
      role: ["employee"],
      isSuperUser: false,
    });
    const res = makeRes();
    await initiatePayrollRun(
      makeReq({ body: { month: PAST_MONTH, year: PAST_YEAR } }),
      res,
    );
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });
});
