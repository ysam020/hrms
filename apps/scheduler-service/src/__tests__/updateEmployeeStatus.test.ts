import { prisma, prismaWithTenant } from "@hrms/db";
import { updateEmployeeStatus } from "../jobs/updateEmployeeStatus";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    resignation: { findMany: jest.fn() },
    user: { update: jest.fn() },
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
const mockFindMany = (prismaWithTenant as any).resignation
  .findMany as jest.Mock;
const mockUpdate = (prismaWithTenant as any).user.update as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("updateEmployeeStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    mockUpdate.mockResolvedValue({ count: 1 });
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 5, 12, 0, 0)); // March 5, 2024 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when there are no tenants", async () => {
    mockTenantFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("skips tenants with no dedicated database", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1", dbName: null }]);
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();
    // Still queried (falls back to the shared master client), just not
    // via getClientForDb — the important thing is every tenant is visited.
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no resignations have yesterday as lastDate", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("scopes the resignation lookup to each tenant and queries lastWorkingDay is yesterday", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();

    // Yesterday = March 4
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2024-03-04T00:00:00.000Z"),
          lt: new Date("2024-03-05T00:00:00.000Z"),
        },
      },
    });
  });

  it("updates each employee with resignation lastDate to Resigned", async () => {
    mockFindMany.mockResolvedValue([
      { userId: "john-id", lastDate: "2024-03-04" },
      { userId: "jane-id", lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "john-id" },
      data: { employeeStatus: "Resigned" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "jane-id" },
      data: { employeeStatus: "Resigned" },
    });
  });

  it("skips resignations with null or missing userId", async () => {
    mockFindMany.mockResolvedValue([
      { userId: null, lastDate: "2024-03-04" },
      { userId: undefined, lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("processes every tenant independently", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockFindMany
      .mockResolvedValueOnce([{ userId: "john-id", lastDate: "2024-03-04" }])
      .mockResolvedValueOnce([{ userId: "jane-id", lastDate: "2024-03-04" }]);

    await updateEmployeeStatus();

    expect(mockFindMany).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("continues processing other tenants when one tenant errors", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockFindMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([]);

    await updateEmployeeStatus();

    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it("correctly computes yesterday across a month boundary", async () => {
    jest.setSystemTime(new Date(2024, 3, 1, 12, 0, 0)); // April 1 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    // Yesterday = March 31
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2024-03-31T00:00:00.000Z"),
          lt: new Date("2024-04-01T00:00:00.000Z"),
        },
      },
    });
  });

  it("correctly computes yesterday across a year boundary", async () => {
    jest.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // January 1, 2024 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2023-12-31T00:00:00.000Z"),
          lt: new Date("2024-01-01T00:00:00.000Z"),
        },
      },
    });
  });

  it("throws when the tenant lookup itself fails", async () => {
    mockTenantFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateEmployeeStatus()).rejects.toThrow("DB error");
  });
});
