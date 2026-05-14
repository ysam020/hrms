import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { correctAttendance } from "../handlers/correctAttendance";

jest.mock("@hrms/db", () => ({
  prisma: {
    attendanceRecord: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockRecordFindUnique = (prisma as any).attendanceRecord
  .findUnique as jest.Mock;
const mockRecordUpdate = (prisma as any).attendanceRecord.update as jest.Mock;
const mockRecordCreate = (prisma as any).attendanceRecord.create as jest.Mock;
const mockInvalidate = (cacheManager as any).invalidatePattern as jest.Mock;
const mockCacheDelete = (cacheManager as any).delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const baseRecord = {
  id: "rec-1",
  username: "john",
  date: new Date(2024, 2, 4),
  timeIn: "09:00",
  timeOut: "17:00",
  workingHours: 8,
  status: "Present",
  isCorrected: false,
};

describe("correctAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await correctAttendance(makeCall({ date: "2024-03-04" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockRecordUpdate).not.toHaveBeenCalled();
  });

  it("updates existing record with new timeIn/timeOut and recalculates status", async () => {
    mockRecordFindUnique.mockResolvedValue(baseRecord);
    mockRecordUpdate.mockResolvedValue({
      ...baseRecord,
      timeIn: "09:00",
      timeOut: "17:00",
    });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "09:00",
        timeOut: "17:00",
        correctedBy: "admin",
      }),
      cb,
    );
    expect(mockRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isCorrected: true,
          correctedBy: "admin",
        }),
      }),
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("sets status to 'Half Day' when working hours < 4", async () => {
    mockRecordFindUnique.mockResolvedValue({
      ...baseRecord,
      timeIn: null,
      timeOut: null,
    });
    mockRecordUpdate.mockResolvedValue({
      ...baseRecord,
      status: "Half Day",
      workingHours: 3,
    });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "09:00",
        timeOut: "12:00",
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("Half Day");
    expect(updateData.workingHours).toBe(3);
  });

  it("sets status to 'Present' when working hours >= 4", async () => {
    mockRecordFindUnique.mockResolvedValue(baseRecord);
    mockRecordUpdate.mockResolvedValue({
      ...baseRecord,
      status: "Present",
      workingHours: 8,
    });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "09:00",
        timeOut: "17:00",
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("Present");
  });

  it("creates new record when no existing record found", async () => {
    mockRecordFindUnique.mockResolvedValue(null);
    mockRecordCreate.mockResolvedValue({ ...baseRecord, id: "new-rec" });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "09:00",
        timeOut: "17:00",
      }),
      cb,
    );
    expect(mockRecordCreate).toHaveBeenCalled();
    expect(mockRecordUpdate).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("invalidates cache after correction", async () => {
    mockRecordFindUnique.mockResolvedValue(baseRecord);
    mockRecordUpdate.mockResolvedValue(baseRecord);
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "09:00",
        timeOut: "17:00",
      }),
      cb,
    );
    expect(mockInvalidate).toHaveBeenCalledWith("attendance:john:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("todayAttendance:john");
  });

  it("returns INTERNAL on database error", async () => {
    mockRecordFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await correctAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
