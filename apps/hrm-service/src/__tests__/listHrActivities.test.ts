import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { listHrActivities } from "../handlers/listHrActivities";

jest.mock("@hrms/db", () => {
  const _db = {
    hrActivity: { findMany: jest.fn(), count: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).hrActivity.findMany as jest.Mock;
const mockCount = (prisma as any).hrActivity.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const activityRow = {
  id: "act-1",
  title: "Meeting",
  description: "Desc",
  scheduledAt: new Date("2024-03-15T10:00:00"),
  status: "active",
  createdBy: "admin",
  createdOn: new Date("2024-03-01T12:00:00Z"),
};

describe("listHrActivities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([activityRow]);
    mockCount.mockResolvedValue(1);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [] };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await listHrActivities(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("lists activities with default pagination", async () => {
    const cb = makeCallback();
    await listHrActivities(makeCall({ page: 1, limit: 10 }), cb);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, total: 1 }),
    );
  });

  it("filters by status when provided", async () => {
    const cb = makeCallback();
    await listHrActivities(makeCall({ status: "active" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("active");
  });

  it("does not filter by status when 'all' provided", async () => {
    const cb = makeCallback();
    await listHrActivities(makeCall({ status: "all" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("caches the response", async () => {
    const cb = makeCallback();
    await listHrActivities(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("hrActivities:"),
      expect.any(Object),
      "hrActivity",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await listHrActivities(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
