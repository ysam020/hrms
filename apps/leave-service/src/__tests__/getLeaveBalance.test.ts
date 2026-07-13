import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getLeaveBalance } from "../handlers/getLeaveBalance";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveBalance: { findFirst: jest.fn() },
    tenantSettings: { findFirst: jest.fn() },
    compOffCredit: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindFirst = (prisma as any).leaveBalance.findFirst as jest.Mock;
const mockTenantSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockCompOffFindMany = (prisma as any).compOffCredit.findMany as jest.Mock;

describe("getLeaveBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantSettingsFindFirst.mockResolvedValue(null);
    mockCompOffFindMany.mockResolvedValue([]);
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = jest.fn();
    await getLeaveBalance({ request: {} } as any, cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("falls back to the tenant's default PL/SL/CL quotas when no balance record or tenant settings exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = jest.fn();
    await getLeaveBalance({ request: { userId: "john" } } as any, cb);

    const result = cb.mock.calls[0][1];
    expect(result.message).toBe(MESSAGES.NO_LEAVE_BALANCE);
    expect(result.status).toBe(status.OK);
    expect(result.userId).toBe("john");
    expect(JSON.parse(result.data.balances)).toEqual({
      PL: { name: "Paid Leave", remaining: 12 },
      SL: { name: "Sick Leave", remaining: 12 },
      CL: { name: "Casual Leave", remaining: 6 },
    });
  });

  it("uses a tracked numeric balance over the raw annual quota once one exists", async () => {
    mockFindFirst.mockResolvedValue({
      id: "bal-1",
      userId: "john",
      accumulatedPLBeforeCurrentMonth: 5,
      balances: { PL: 3, SL: 7 },
    });
    const cb = jest.fn();
    await getLeaveBalance({ request: { userId: "john" } } as any, cb);

    const result = cb.mock.calls[0][1];
    expect(result.message).toBe(MESSAGES.LEAVE_FETCHED);
    expect(result.data.accumulatedPlBeforeCurrentMonth).toBe(5);
    const balances = JSON.parse(result.data.balances);
    expect(balances.PL).toEqual({ name: "Paid Leave", remaining: 3 });
    expect(balances.SL).toEqual({ name: "Sick Leave", remaining: 7 });
    // CL was never tracked yet, so it still falls back to the configured quota.
    expect(balances.CL).toEqual({ name: "Casual Leave", remaining: 6 });
  });

  it("includes tenant-configured custom leave types and leavePolicies, deduped, and excludes comp-off from the tracked balances map", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockTenantSettingsFindFirst.mockResolvedValue({
      medicalCertRequired: false,
      customLeaveTypes: [
        { key: "MARRIAGE", name: "Marriage Leave", daysPerYear: 3 },
      ],
      leavePolicies: [
        { key: "CO", name: "Comp Off", daysPerYear: 0, isCompOff: true },
      ],
      workWeekPattern: null,
      paidLeavesPerYear: 12,
      sickLeavesPerYear: 12,
      casualLeavesPerYear: 6,
    });
    mockCompOffFindMany.mockResolvedValue([
      { earnedDays: 1, expiresOn: null },
      { earnedDays: 0.5, expiresOn: null },
    ]);

    const cb = jest.fn();
    await getLeaveBalance({ request: { userId: "john" } } as any, cb);

    const balances = JSON.parse(cb.mock.calls[0][1].data.balances);
    expect(balances.MARRIAGE).toEqual({ name: "Marriage Leave", remaining: 3 });
    expect(balances.CO).toEqual({ name: "Comp Off", remaining: 1.5 });
  });

  it("defaults accumulatedPLBeforeCurrentMonth to 0 when null", async () => {
    mockFindFirst.mockResolvedValue({
      id: "bal-1",
      userId: "jane",
      accumulatedPLBeforeCurrentMonth: null,
      balances: null,
    });

    const cb = jest.fn();
    await getLeaveBalance({ request: { userId: "jane" } } as any, cb);

    const result = cb.mock.calls[0][1];
    expect(result.data.accumulatedPlBeforeCurrentMonth).toBe(0);
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = jest.fn();
    await getLeaveBalance({ request: { userId: "john" } } as any, cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
