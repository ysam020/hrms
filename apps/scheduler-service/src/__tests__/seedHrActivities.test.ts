import { prisma, prismaWithTenant } from "@hrms/db";
import { seedHrActivities } from "../jobs/seedHrActivities";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    hrActivity: { create: jest.fn() },
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
const mockHrActivityCreate = (prismaWithTenant as any).hrActivity
  .create as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("seedHrActivities", () => {
  const originalClientUrl = process.env.CLIENT_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    mockHrActivityCreate.mockResolvedValue({});
    process.env.CLIENT_URL = "https://localhost";
  });

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
  });

  it("does nothing outside local dev", async () => {
    process.env.CLIENT_URL = "https://praesto.cloud";
    await seedHrActivities();
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });

  it("creates between 1 and 3 HR activities per tenant, tagged with the tenant id", async () => {
    await seedHrActivities();
    expect(mockHrActivityCreate.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockHrActivityCreate.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mockHrActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", status: "Scheduled" }),
      }),
    );
  });

  it("skips tenants with no dedicated database", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1", dbName: null }]);
    await seedHrActivities();
    expect(mockHrActivityCreate).not.toHaveBeenCalled();
  });

  it("continues processing other tenants when one tenant errors", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockHrActivityCreate
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({});

    await seedHrActivities();

    // t1's first create rejects (job catches per-tenant), t2 still runs.
    expect(mockHrActivityCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
