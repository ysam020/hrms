import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getAttendance } from "../handlers/getAttendance";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    attendanceRecord: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockFindMany = (prisma as any).attendanceRecord.findMany as jest.Mock;
const mockCount = (prisma as any).attendanceRecord.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

const sampleRecord = {
  id: "rec-1",
  userId: "john",
  date: new Date("2024-03-04"),
  timeIn: new Date("2024-03-04T08:00:00.000Z"),
  timeOut: new Date("2024-03-04T17:00:00.000Z"),
  status: "Present",
  workingHours: 9,
};

describe("getAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("returns cached response on cache hit", async () => {
    const cached = {
      message: MESSAGES.ATTENDANCE_RECORDS_FETCHED,
      status: status.OK,
      data: [],
      total: 0,
    };
    mockCacheGet.mockResolvedValue(cached);

    const cb = makeCallback();
    await getAttendance(makeCall({ userId: "john" }), cb);

    expect(cb).toHaveBeenCalledWith(null, cached);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("filters records by userId when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getAttendance(
      makeCall({ userId: "507f1f77bcf86cd799439011" }),
      makeCallback(),
    );

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "507f1f77bcf86cd799439011" }),
      }),
    );
  });

  it("uses userId directly as the DB filter key", async () => {
    await getAttendance(makeCall({ userId: "john_doe" }), makeCallback());

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "john_doe" }),
      }),
    );
  });

  it("applies date range filter when startDate and endDate provided", async () => {
    await getAttendance(
      makeCall({
        userId: "john",
        startDate: "2024-03-01",
        endDate: "2024-03-31",
      }),
      makeCallback(),
    );

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.date).toEqual({
      gte: new Date("2024-03-01T00:00:00.000Z"),
      lte: new Date("2024-03-31T23:59:59.999Z"),
    });
  });

  it("applies only startDate when endDate is missing", async () => {
    await getAttendance(
      makeCall({ userId: "john", startDate: "2024-03-01" }),
      makeCallback(),
    );

    const callArgs = mockFindMany.mock.calls[0][0];
    expect(callArgs.where.date).toHaveProperty("gte");
    expect(callArgs.where.date).not.toHaveProperty("lte");
  });

  it("paginates correctly with skip and take", async () => {
    await getAttendance(
      makeCall({ userId: "john", page: 3, limit: 10 }),
      makeCallback(),
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("maps attendance records to expected response shape", async () => {
    mockFindMany.mockResolvedValue([sampleRecord]);
    mockCount.mockResolvedValue(1);

    const cb = makeCallback();
    await getAttendance(makeCall({ userId: "john" }), cb);

    const result = cb.mock.calls[0][1];
    expect(result.status).toBe(status.OK);
    expect(result.data[0]).toEqual({
      date: sampleRecord.date.toISOString(),
      checkIn: sampleRecord.timeIn.toISOString(),
      checkOut: sampleRecord.timeOut.toISOString(),
      status: "Present",
      workHours: "9",
    });
    expect(result.total).toBe(1);
  });

  it("caches the result with attendance key", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getAttendance(makeCall({ userId: "john" }), makeCallback());

    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("attendance:"),
      expect.objectContaining({ status: status.OK }),
      "attendance",
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  });
});
