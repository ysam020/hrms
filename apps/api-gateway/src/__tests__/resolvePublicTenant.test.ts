import { prisma, getClientForDb } from "@hrms/db";
import { resolvePublicTenant } from "../middleware/resolvePublicTenant";

jest.mock("@hrms/db", () => {
  const _db = {
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
    getClientForDb: jest.fn().mockReturnValue({ mockTenantClient: true }),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockGetClientForDb = getClientForDb as jest.Mock;

const makeReq = (slug: string | undefined) => ({ params: { slug } }) as any;
const makeRes = () => ({ json: jest.fn() }) as any;

describe("resolvePublicTenant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns BAD_REQUEST when slug is missing", async () => {
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq(undefined), res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it("returns BAD_REQUEST when slug has invalid characters (defense against malformed input before hitting the DB)", async () => {
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq("Acme Corp!"), res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when no tenant matches the slug", async () => {
    mockTenantFindUnique.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq("unknown-co"), res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the matched tenant is inactive", async () => {
    mockTenantFindUnique.mockResolvedValue({
      id: "t1",
      dbName: "tenant_db",
      isActive: false,
    });
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq("inactive-co"), res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("resolves tenant context and calls next() for a valid, active tenant slug", async () => {
    mockTenantFindUnique.mockResolvedValue({
      id: "t1",
      dbName: "tenant_db",
      isActive: true,
    });
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq("acme-co"), res, next);
    expect(mockGetClientForDb).toHaveBeenCalledWith("tenant_db");
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("caches the slug lookup — a second request for the same slug doesn't hit the DB again", async () => {
    // Distinct slug from every other test in this file — the lookup cache is
    // a module-level singleton that persists across tests in the same run.
    mockTenantFindUnique.mockResolvedValue({
      id: "t3",
      dbName: "tenant_db_3",
      isActive: true,
    });
    await resolvePublicTenant(makeReq("cache-test-co"), makeRes(), jest.fn());
    await resolvePublicTenant(makeReq("cache-test-co"), makeRes(), jest.fn());
    expect(mockTenantFindUnique).toHaveBeenCalledTimes(1);
  });

  it("handles a tenant with no dbName by passing a null client (hybrid multi-tenancy fallback)", async () => {
    mockTenantFindUnique.mockResolvedValue({
      id: "t2",
      dbName: null,
      isActive: true,
    });
    const res = makeRes();
    const next = jest.fn();
    await resolvePublicTenant(makeReq("no-db-co"), res, next);
    expect(mockGetClientForDb).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
