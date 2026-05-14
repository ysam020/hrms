import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getAttendanceSummary } from "../handlers/getAttendanceSummary";

jest.mock("@hrms/db", () => ({
  prisma: {
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockRecordFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;
const mockLeaveBalanceFindUnique = (prisma as any).leaveBalance
  .findUnique as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getAttendanceSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockLeaveBalanceFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ username: "john" });
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns INVALID_ARGUMENT when userId, month or year is missing", async () => {
    const cb = makeCallback();
    await getAttendanceSummary(makeCall({ userId: "u1", month: 3 }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
  });

  it("returns cached result on cache hit", async () => {
    const cached = { status: 0, data: { presents: 5 } };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    expect(mockRecordFindMany).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("counts Present and Half Day records", async () => {
    mockRecordFindMany.mockResolvedValue([
      { date: new Date(2024, 2, 4), status: "Present", isCorrected: false },
      { date: new Date(2024, 2, 5), status: "Present", isCorrected: false },
      { date: new Date(2024, 2, 6), status: "Half Day", isCorrected: false },
    ]);
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    const data = cb.mock.calls[0][1].data;
    expect(data.presents).toBe(2);
    expect(data.halfDays).toBe(1);
  });

  it("counts corrections used", async () => {
    mockRecordFindMany.mockResolvedValue([
      { date: new Date(2024, 2, 4), status: "Present", isCorrected: true },
      { date: new Date(2024, 2, 5), status: "Present", isCorrected: false },
    ]);
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    const data = cb.mock.calls[0][1].data;
    expect(data.correctionsUsed).toBe(1);
    expect(data.remainingCorrections).toBe(2);
  });

  it("reads usedPL and usedLWP from leave balance", async () => {
    mockRecordFindMany.mockResolvedValue([]);
    mockLeaveBalanceFindUnique.mockResolvedValue({
      balances: [{ year: 2024, month: 3, usedPL: 2, usedLWP: 1 }],
    });
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    const data = cb.mock.calls[0][1].data;
    expect(data.paidLeaves).toBe(2);
    expect(data.unpaidLeaves).toBe(1);
    expect(data.totalLeaves).toBe(3);
  });

  it("caches the response after computation", async () => {
    mockRecordFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("returns INTERNAL on database error", async () => {
    mockRecordFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getAttendanceSummary(
      makeCall({ userId: "john", month: 3, year: 2024 }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
