import { prisma, prismaWithTenant } from "@hrms/db";
import { seedJobOpenings } from "../jobs/seedJobOpenings";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    jobOpening: { create: jest.fn() },
    jobApplication: { create: jest.fn() },
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
const mockJobOpeningCreate = (prismaWithTenant as any).jobOpening
  .create as jest.Mock;
const mockJobApplicationCreate = (prismaWithTenant as any).jobApplication
  .create as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("seedJobOpenings", () => {
  const originalClientUrl = process.env.CLIENT_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    mockJobOpeningCreate.mockResolvedValue({ id: "opening-1" });
    mockJobApplicationCreate.mockResolvedValue({});
    process.env.CLIENT_URL = "https://localhost";
  });

  afterEach(() => {
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
  });

  it("does nothing outside local dev", async () => {
    process.env.CLIENT_URL = "https://praesto.cloud";
    await seedJobOpenings();
    expect(mockTenantFindMany).not.toHaveBeenCalled();
  });

  it("creates 1-2 job openings per tenant, tagged with the tenant id and Open status", async () => {
    await seedJobOpenings();
    expect(mockJobOpeningCreate.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockJobOpeningCreate.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mockJobOpeningCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", status: "Open" }),
      }),
    );
  });

  it("links any generated applications to the real created opening's id", async () => {
    mockJobOpeningCreate.mockResolvedValue({ id: "opening-xyz" });
    await seedJobOpenings();
    for (const call of mockJobApplicationCreate.mock.calls) {
      expect(call[0].data.jobTitleId).toBe("opening-xyz");
      expect(call[0].data.tenantId).toBe("t1");
    }
  });

  it("skips tenants with no dedicated database", async () => {
    mockTenantFindMany.mockResolvedValue([{ id: "t1", dbName: null }]);
    await seedJobOpenings();
    expect(mockJobOpeningCreate).not.toHaveBeenCalled();
  });
});
