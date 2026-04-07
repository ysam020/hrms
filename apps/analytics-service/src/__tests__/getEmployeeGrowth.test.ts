import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getEmployeeGrowth } from "../handlers/getEmployeeGrowth";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).user.findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getEmployeeGrowth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getEmployeeGrowth(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("groups employees by month", async () => {
    mockFindMany.mockResolvedValue([
      { createdAt: new Date("2024-01-15T12:00:00Z") },
      { createdAt: new Date("2024-01-20T12:00:00Z") },
      { createdAt: new Date("2024-02-05T12:00:00Z") },
    ]);
    const cb = makeCallback();
    await getEmployeeGrowth(makeCall({}), cb);
    const { data, total } = cb.mock.calls[0][1];
    expect(total).toBe(3);
    const jan = data.find((d: any) => d.label === "2024-01");
    const feb = data.find((d: any) => d.label === "2024-02");
    expect(jan.value).toBe(2);
    expect(feb.value).toBe(1);
  });

  it("applies date range filters when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getEmployeeGrowth(
      makeCall({ startDate: "2024-01-01", endDate: "2024-12-31" }),
      cb,
    );
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeDefined();
  });

  it("caches the response", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getEmployeeGrowth(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("analytics:employeeGrowth:"),
      expect.any(Object),
      "analytics",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getEmployeeGrowth(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
