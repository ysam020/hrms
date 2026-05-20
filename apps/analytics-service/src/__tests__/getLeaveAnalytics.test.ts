import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getLeaveAnalytics } from "../handlers/getLeaveAnalytics";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: { findMany: jest.fn() },
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

const mockFindMany = (prisma as any).leaveApplication.findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getLeaveAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getLeaveAnalytics(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("groups leaves by type", async () => {
    mockFindMany.mockResolvedValue([
      { leaveType: "PL", status: "Approved" },
      { leaveType: "PL", status: "Approved" },
      { leaveType: "SL", status: "Approved" },
    ]);
    const cb = makeCallback();
    await getLeaveAnalytics(makeCall({}), cb);
    const { data, total } = cb.mock.calls[0][1];
    expect(total).toBe(3);
    const pl = data.find((d: any) => d.label === "PL");
    const sl = data.find((d: any) => d.label === "SL");
    expect(pl.value).toBe(2);
    expect(sl.value).toBe(1);
  });

  it("applies date filters when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getLeaveAnalytics(
      makeCall({ startDate: "2024-01-01", endDate: "2024-12-31" }),
      cb,
    );
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.from).toEqual({ gte: "2024-01-01" });
    expect(where.to).toEqual({ lte: "2024-12-31" });
  });

  it("caches the response", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getLeaveAnalytics(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("analytics:leave:"),
      expect.any(Object),
      "analytics",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getLeaveAnalytics(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
