import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getSalaryAnalytics } from "../handlers/getSalaryAnalytics";

jest.mock("@hrms/db", () => ({
  prisma: {
    salaryStructure: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).salaryStructure.findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getSalaryAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("sums netPayable as total", async () => {
    mockFindMany.mockResolvedValue([
      { netPayable: 50000, month: 1, year: 2024 },
      { netPayable: 60000, month: 2, year: 2024 },
    ]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(cb.mock.calls[0][1].total).toBe(110000);
  });

  it("formats label as YYYY-MM", async () => {
    mockFindMany.mockResolvedValue([
      { netPayable: 50000, month: 3, year: 2024 },
    ]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    const item = cb.mock.calls[0][1].data[0];
    expect(item.label).toBe("2024-03");
  });

  it("filters by year when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({ year: "2024" }), cb);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.year).toBe(2024);
  });

  it("caches the response", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("analytics:salary:"),
      expect.any(Object),
      "salary",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
