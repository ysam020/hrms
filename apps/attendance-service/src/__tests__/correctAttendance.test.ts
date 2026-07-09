import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { correctAttendance } from "../handlers/correctAttendance";

jest.mock("@hrms/db", () => {
  const _db = {
    attendanceRecord: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    tenantSettings: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    team: {
      findFirst: jest.fn(),
    },
    shift: {
      findFirst: jest.fn(),
    },
    attendanceBreak: {
      findMany: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

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

const mockRecordFindFirst = (prisma as any).attendanceRecord
  .findFirst as jest.Mock;
const mockRecordUpdate = (prisma as any).attendanceRecord.update as jest.Mock;
const mockRecordCreate = (prisma as any).attendanceRecord.create as jest.Mock;
const mockInvalidate = (cacheManager as any).invalidatePattern as jest.Mock;
const mockCacheDelete = (cacheManager as any).delete as jest.Mock;
const mockSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockTeamFindFirst = (prisma as any).team.findFirst as jest.Mock;
const mockShiftFindFirst = (prisma as any).shift.findFirst as jest.Mock;
const mockBreakFindMany = (prisma as any).attendanceBreak.findMany as jest.Mock;

const DEFAULT_ATTENDANCE_SETTINGS = {
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  halfDayMinHours: 4,
  geofencingEnabled: false,
  officeLatitude: null,
  officeLongitude: null,
  geofenceRadiusMeters: 200,
};

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const baseRecord = {
  id: "rec-1",
  userId: "john",
  date: new Date("2024-03-04T00:00:00.000Z"),
  timeIn: new Date("2024-03-04T09:00:00.000Z"),
  timeOut: new Date("2024-03-04T17:00:00.000Z"),
  workingHours: 8,
  status: "Present",
  isCorrected: false,
};

describe("correctAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
    mockSettingsFindFirst.mockResolvedValue(DEFAULT_ATTENDANCE_SETTINGS);
    mockUserFindUnique.mockResolvedValue({ shiftId: null });
    mockTeamFindFirst.mockResolvedValue(null);
    mockShiftFindFirst.mockResolvedValue(null);
    mockBreakFindMany.mockResolvedValue([]);
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
    mockRecordFindFirst.mockResolvedValue(baseRecord);
    mockRecordUpdate.mockResolvedValue({
      ...baseRecord,
      timeIn: new Date("2024-03-04T09:00:00.000Z"),
      timeOut: new Date("2024-03-04T17:00:00.000Z"),
    });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z",
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
    mockRecordFindFirst.mockResolvedValue({
      ...baseRecord,
      timeIn: null,
      timeOut: null,
    });
    mockRecordUpdate.mockResolvedValue({
      ...baseRecord,
      timeIn: new Date("2024-03-04T09:00:00.000Z"),
      timeOut: new Date("2024-03-04T12:00:00.000Z"),
      status: "Half Day",
      workingHours: 3,
    });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T12:00:00.000Z",
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("Half Day");
    expect(updateData.workingHours).toBe(3);
  });

  it("sets status to 'Present' when working hours >= 4", async () => {
    mockRecordFindFirst.mockResolvedValue(baseRecord);
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
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z",
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBe("Present");
  });

  it("uses the employee's shift halfDayMinHours instead of the hardcoded 4h default", async () => {
    // Shift requires 6h for a full day — 5h worked should be "Half Day" even
    // though it clears the tenant-default 4h threshold.
    mockUserFindUnique.mockResolvedValue({ shiftId: "shift-1" });
    mockShiftFindFirst.mockResolvedValue({
      id: "shift-1",
      startHour: 9,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
      lateGracePeriodMinutes: 15,
      halfDayMinHours: 6,
    });
    mockRecordFindFirst.mockResolvedValue({
      ...baseRecord,
      timeIn: null,
      timeOut: null,
    });
    mockRecordUpdate.mockResolvedValue(baseRecord);
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T14:00:00.000Z", // 5h
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.workingHours).toBe(5);
    expect(updateData.status).toBe("Half Day");
  });

  it("subtracts unpaid break time from the corrected working hours", async () => {
    mockRecordFindFirst.mockResolvedValue({
      ...baseRecord,
      timeIn: null,
      timeOut: null,
    });
    mockBreakFindMany.mockResolvedValue([
      {
        isPaid: false,
        durationMinutes: 60,
        startTime: new Date(),
        endTime: new Date(),
      },
    ]);
    mockRecordUpdate.mockResolvedValue(baseRecord);
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z", // 8h raw
      }),
      cb,
    );
    const updateData = mockRecordUpdate.mock.calls[0][0].data;
    expect(updateData.workingHours).toBe(7); // 8h - 1h unpaid break
    expect(updateData.status).toBe("Present");
  });

  it("creates new record when no existing record found", async () => {
    mockRecordFindFirst.mockResolvedValue(null);
    mockRecordCreate.mockResolvedValue({ ...baseRecord, id: "new-rec" });
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z",
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
    mockRecordFindFirst.mockResolvedValue(baseRecord);
    mockRecordUpdate.mockResolvedValue(baseRecord);
    const cb = makeCallback();
    await correctAttendance(
      makeCall({
        userId: "john",
        date: "2024-03-04",
        timeIn: "2024-03-04T09:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z",
      }),
      cb,
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:attendance:john:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:todayAttendance:john");
  });

  it("returns INTERNAL on database error", async () => {
    mockRecordFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await correctAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
