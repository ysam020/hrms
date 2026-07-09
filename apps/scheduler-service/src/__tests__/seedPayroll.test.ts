import { prisma, prismaWithTenant } from "@hrms/db";
import { seedPayroll } from "../jobs/seedPayroll";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    user: { findMany: jest.fn(), update: jest.fn() },
    salaryStructure: { findFirst: jest.fn(), create: jest.fn() },
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
const mockUserUpdate = (prismaWithTenant as any).user.update as jest.Mock;
const mockStructureFindFirst = (prismaWithTenant as any).salaryStructure
  .findFirst as jest.Mock;
const mockStructureCreate = (prismaWithTenant as any).salaryStructure
  .create as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("seedPayroll", () => {
  const originalClientUrl = process.env.CLIENT_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    mockUserFindMany.mockResolvedValue([
      { id: "u1", salary: 60000, salaryBasicPay: null },
      { id: "u2", salary: 80000, salaryBasicPay: null },
    ]);
    mockUserUpdate.mockResolvedValue({});
    mockStructureFindFirst.mockResolvedValue(null);
    mockStructureCreate.mockResolvedValue({});
    process.env.CLIENT_URL = "https://localhost";
  });

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
  });

  it("does nothing outside local dev", async () => {
    process.env.CLIENT_URL = "https://praesto.cloud";
    await seedPayroll();
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });

  it("skips a tenant with no active employees", async () => {
    mockUserFindMany.mockResolvedValue([]);
    await seedPayroll();
    expect(mockStructureCreate).not.toHaveBeenCalled();
  });

  it("skips tenants with no dedicated database", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1", dbName: null }]);
    await seedPayroll();
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it("sets User salary breakdown and creates a SalaryStructure for employees missing one", async () => {
    await seedPayroll();

    expect(mockUserUpdate).toHaveBeenCalledTimes(2);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          salaryBasicPay: expect.any(Number),
          salaryHra: expect.any(Number),
          salaryConveyance: expect.any(Number),
        }),
      }),
    );

    expect(mockStructureCreate).toHaveBeenCalledTimes(2);
    for (const call of mockStructureCreate.mock.calls) {
      expect(call[0].data.tenantId).toBe("t1");
    }
  });

  it("never touches PayrollRun/PayrollLineItem (no fake run is inserted)", async () => {
    await seedPayroll();
    expect((prismaWithTenant as any).payrollRun).toBeUndefined();
    expect((prismaWithTenant as any).payrollLineItem).toBeUndefined();
  });

  it("does not overwrite an already-configured salary breakdown", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "u1", salary: 60000, salaryBasicPay: 30000 },
    ]);
    await seedPayroll();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("skips creating a SalaryStructure for a month that already has one", async () => {
    mockStructureFindFirst.mockResolvedValue({ id: "existing-structure" });
    await seedPayroll();
    expect(mockStructureCreate).not.toHaveBeenCalled();
  });

  it("continues processing other tenants when one tenant errors", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockUserFindMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([
        { id: "u1", salary: 60000, salaryBasicPay: null },
      ]);

    await seedPayroll();

    expect(mockUserFindMany).toHaveBeenCalledTimes(2);
  });
});
