import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getSalaryAnalytics } from "../handlers/getSalaryAnalytics";

jest.mock("@hrms/db", () => {
  const _db = {
    payrollRun: { findMany: jest.fn() },
    payrollLineItem: { findMany: jest.fn() },
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

const mockRunFindMany = (prisma as any).payrollRun.findMany as jest.Mock;
const mockLineItemFindMany = (prisma as any).payrollLineItem
  .findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getSalaryAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockRunFindMany.mockResolvedValue([]);
    mockLineItemFindMany.mockResolvedValue([]);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(mockRunFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("sums netPayable (from disbursed PayrollLineItems) as total", async () => {
    mockRunFindMany.mockResolvedValue([
      { id: "r1", month: 1, year: 2024 },
      { id: "r2", month: 2, year: 2024 },
    ]);
    mockLineItemFindMany.mockResolvedValue([
      { payrollRunId: "r1", netPayable: 50000 },
      { payrollRunId: "r2", netPayable: 60000 },
    ]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(cb.mock.calls[0][1].total).toBe(110000);
  });

  it("formats label as YYYY-MM", async () => {
    mockRunFindMany.mockResolvedValue([{ id: "r1", month: 3, year: 2024 }]);
    mockLineItemFindMany.mockResolvedValue([
      { payrollRunId: "r1", netPayable: 50000 },
    ]);
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    const item = cb.mock.calls[0][1].data[0];
    expect(item.label).toBe("2024-03");
  });

  it("only considers disbursed runs, filtered by year when provided", async () => {
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({ year: "2024" }), cb);
    const where = mockRunFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("disbursed");
    expect(where.year).toBe(2024);
  });

  it("caches the response", async () => {
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("analytics:salary:"),
      expect.any(Object),
      "salary",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockRunFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getSalaryAnalytics(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
