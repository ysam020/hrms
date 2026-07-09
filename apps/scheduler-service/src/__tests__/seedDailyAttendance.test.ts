import { prisma, prismaWithTenant } from "@hrms/db";
import { seedDailyAttendance } from "../jobs/seedDailyAttendance";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    user: { findMany: jest.fn() },
    attendanceRecord: { findFirst: jest.fn(), create: jest.fn() },
    leaveApplication: { findFirst: jest.fn(), create: jest.fn() },
  };
  return {
    prisma: _master,
    prismaWithTenant: _tenantDb,
    getClientForDb: jest.fn().mockReturnValue({}),
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockTenantFindMany = (prisma as any).tenant.findMany as jest.Mock;
const mockUserFindMany = (prismaWithTenant as any).user.findMany as jest.Mock;
const mockAttendanceFindFirst = (prismaWithTenant as any).attendanceRecord
  .findFirst as jest.Mock;
const mockAttendanceCreate = (prismaWithTenant as any).attendanceRecord
  .create as jest.Mock;
const mockLeaveFindFirst = (prismaWithTenant as any).leaveApplication
  .findFirst as jest.Mock;
const mockLeaveCreate = (prismaWithTenant as any).leaveApplication
  .create as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("seedDailyAttendance", () => {
  const originalClientUrl = process.env.CLIENT_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    mockUserFindMany.mockResolvedValue([{ id: "u1" }]);
    mockAttendanceFindFirst.mockResolvedValue(null);
    mockLeaveFindFirst.mockResolvedValue(null);
    mockAttendanceCreate.mockResolvedValue({});
    mockLeaveCreate.mockResolvedValue({});
    process.env.CLIENT_URL = "https://localhost";
  });

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
  });

  it("does nothing outside local dev", async () => {
    process.env.CLIENT_URL = "https://praesto.cloud";
    await seedDailyAttendance();
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });

  it("skips an employee who already has an attendance record for today", async () => {
    mockAttendanceFindFirst.mockResolvedValue({ id: "existing" });
    await seedDailyAttendance();
    expect(mockAttendanceCreate).not.toHaveBeenCalled();
    expect(mockLeaveCreate).not.toHaveBeenCalled();
  });

  it("skips an employee who already has a leave application covering today", async () => {
    mockLeaveFindFirst.mockResolvedValue({ id: "existing-leave" });
    await seedDailyAttendance();
    expect(mockAttendanceCreate).not.toHaveBeenCalled();
    expect(mockLeaveCreate).not.toHaveBeenCalled();
  });

  it("creates either an attendance record or a leave application for an employee with neither yet", async () => {
    await seedDailyAttendance();
    const totalCalls =
      mockAttendanceCreate.mock.calls.length +
      mockLeaveCreate.mock.calls.length;
    expect(totalCalls).toBe(1);
  });

  it("scopes employee lookup to active employees in the tenant", async () => {
    await seedDailyAttendance();
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", employeeStatus: "Active" },
      select: { id: true },
    });
  });

  it("continues processing other tenants when one tenant errors", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockUserFindMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ id: "u2" }]);

    await seedDailyAttendance();

    expect(mockUserFindMany).toHaveBeenCalledTimes(2);
  });

  it("skips tenants with no dedicated database", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1", dbName: null }]);
    await seedDailyAttendance();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });
});
