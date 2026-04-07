import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getAttendanceAnalytics } from "../handlers/getAttendanceAnalytics";

jest.mock("@hrms/db", () => ({
  prisma: {
    attendanceRecord: { findMany: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).attendanceRecord.findMany as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getAttendanceAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: [], total: 0 };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getAttendanceAnalytics(makeCall({}), cb);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("groups records by date", async () => {
    mockFindMany.mockResolvedValue([
      { date: new Date("2024-03-01T12:00:00Z"), status: "Present" },
      { date: new Date("2024-03-01T12:00:00Z"), status: "Present" },
      { date: new Date("2024-03-02T12:00:00Z"), status: "Absent" },
    ]);
    const cb = makeCallback();
    await getAttendanceAnalytics(makeCall({}), cb);
    const { data, total } = cb.mock.calls[0][1];
    expect(total).toBe(3);
    expect(data).toHaveLength(2); // two unique dates
  });

  it("applies date range filters when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getAttendanceAnalytics(
      makeCall({ startDate: "2024-01-01", endDate: "2024-12-31" }),
      cb,
    );
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.date).toBeDefined();
  });

  it("caches the response", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getAttendanceAnalytics(makeCall({}), cb);
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("analytics:attendance:"),
      expect.any(Object),
      "analytics",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getAttendanceAnalytics(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
