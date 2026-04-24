import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getTodayAttendance } from "../handlers/getTodayAttendance";

jest.mock("@hrms/db", () => ({
  prisma: {
    attendanceRecord: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = (prisma as any).attendanceRecord.findUnique as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("getTodayAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when username is missing", async () => {
    const cb = makeCallback();
    await getTodayAttendance(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns cached value when cache hit", async () => {
    const cached = { message: "ok", status: 0, data: { status: "Present" } };
    mockCacheGet.mockResolvedValue(cached);
    const cb = makeCallback();
    await getTodayAttendance(makeCall({ userId: "john" }), cb);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, cached);
  });

  it("returns NOT_FOUND when no record exists for today", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await getTodayAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5, data: null }),
    );
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("returns today's attendance record and caches it", async () => {
    const record = { id: "rec-1", username: "john", status: "Present" };
    mockFindUnique.mockResolvedValue(record);
    const cb = makeCallback();
    await getTodayAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, data: record }),
    );
    expect(mockCacheSet).toHaveBeenCalledWith(
      "todayAttendance:john",
      expect.any(Object),
      "notification",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getTodayAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
