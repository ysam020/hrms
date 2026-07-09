import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { markAttendance } from "../handlers/markAttendance";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    attendanceRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    branch: {
      findFirst: jest.fn(),
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
    invalidatePattern: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindFirst = (prisma as any).attendanceRecord.findFirst as jest.Mock;
const mockCreate = (prisma as any).attendanceRecord.create as jest.Mock;
const mockUpdate = (prisma as any).attendanceRecord.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockDelete = cacheManager.delete as jest.Mock;
const mockCacheGet = (cacheManager as any).get as jest.Mock;
const mockCacheSet = (cacheManager as any).set as jest.Mock;
const mockSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockTeamFindFirst = (prisma as any).team.findFirst as jest.Mock;
const mockShiftFindFirst = (prisma as any).shift.findFirst as jest.Mock;

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

describe("markAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    // Settings cache miss → falls through to DB mock
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    // Return valid attendance settings so the handler proceeds past the
    // FAILED_PRECONDITION guard on every test that doesn't override this.
    mockSettingsFindFirst.mockResolvedValue(DEFAULT_ATTENDANCE_SETTINGS);
    // No branch/shift/attendanceMode overrides by default — every existing
    // test exercises the zero-config tenant-default path.
    mockUserFindUnique.mockResolvedValue({
      wfh: false,
      wfhHomeLatitude: null,
      wfhHomeLongitude: null,
      wfhHomeName: null,
      branchId: null,
      shiftId: null,
      attendanceMode: "office",
    });
    mockTeamFindFirst.mockResolvedValue(null);
    mockShiftFindFirst.mockResolvedValue(null);
  });

  it("returns INVALID_ARGUMENT when userId or type is missing", async () => {
    const cb = makeCallback();
    await markAttendance(makeCall({ userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_TYPE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INVALID_ARGUMENT when only type is provided", async () => {
    const cb = makeCallback();
    await markAttendance(makeCall({ type: "CHECK_IN" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USERNAME_TYPE_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  describe("CHECK_IN", () => {
    it("returns ALREADY_EXISTS when user has already checked in today", async () => {
      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        username: "john",
        timeIn: "2024-03-04T08:00:00.000Z",
      });
      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);
      expect(cb).toHaveBeenCalledWith(null, {
        message: MESSAGES.ALREADY_CHECKED_IN,
        status: status.ALREADY_EXISTS,
      });
    });

    it("creates new record when no existing record", async () => {
      mockFindFirst.mockResolvedValue(null);
      const record = { id: "rec-1", userId: "john", status: "Present" };
      mockCreate.mockResolvedValue(record);

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "john",
            timeIn: expect.any(Date),
            status: expect.stringMatching(/^(Present|Late)$/),
          }),
        }),
      );
      expect(cb).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ status: status.OK }),
      );
    });

    it("updates existing record when record exists without timeIn", async () => {
      const existing = { id: "rec-1", username: "john" };
      mockFindFirst.mockResolvedValue(existing);
      const updated = { id: "rec-1", status: "Present", timeIn: "..." };
      mockUpdate.mockResolvedValue(updated);

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rec-1" },
          data: expect.objectContaining({ timeIn: expect.any(Date) }),
        }),
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("uses the employee's assigned shift start time instead of the tenant default", async () => {
      mockUserFindUnique.mockResolvedValue({
        wfh: false,
        wfhHomeLatitude: null,
        wfhHomeLongitude: null,
        wfhHomeName: null,
        branchId: null,
        shiftId: "shift-1",
        attendanceMode: "office",
      });
      mockShiftFindFirst.mockResolvedValue({
        id: "shift-1",
        startHour: 12,
        startMinute: 0,
        lateGracePeriodMinutes: 15,
        halfDayMinHours: 4,
      });
      jest.useFakeTimers();
      // 10:00 local is "Late" under the tenant default (9:00 + 30min grace)
      // but well within the assigned Night Shift's 12:00 start.
      jest.setSystemTime(new Date(2024, 2, 4, 10, 0, 0));

      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "rec-1", status: "Present" });

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "Present" }),
        }),
      );
      jest.useRealTimers();
    });

    it("skips the geofence check entirely for field/remote employees", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        ...DEFAULT_ATTENDANCE_SETTINGS,
        geofencingEnabled: true,
        officeLatitude: 12.9716,
        officeLongitude: 77.5946,
      });
      mockUserFindUnique.mockResolvedValue({
        wfh: false,
        wfhHomeLatitude: null,
        wfhHomeLongitude: null,
        wfhHomeName: null,
        branchId: null,
        shiftId: null,
        attendanceMode: "field",
      });
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "rec-1", status: "Present" });

      const cb = makeCallback();
      // No latitude/longitude in the request — would fail the geofence
      // precondition for an "office" employee, but a field employee should
      // check in successfully anyway.
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      expect(cb).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ status: status.OK }),
      );
    });

    it("includes (late) in message when checking in after 9:30", async () => {
      // Mock Date to return a late time (10:00 local)
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 2, 4, 10, 0, 0)); // local 10:00 AM

      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "rec-1", status: "Late" });

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      const response = cb.mock.calls[0][1];
      expect(response.message).toContain("(late)");

      jest.useRealTimers();
    });

    it("does not include (late) when checking in before 9:30", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 2, 4, 8, 0, 0)); // local 8:00 AM

      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "rec-1", status: "Present" });

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);

      const response = cb.mock.calls[0][1];
      expect(response.message).not.toContain("(late)");

      jest.useRealTimers();
    });

    it("invalidates attendance caches after check-in", async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "rec-1" });

      await markAttendance(
        makeCall({ userId: "john", type: "CHECK_IN" }),
        makeCallback(),
      );

      expect(mockInvalidate).toHaveBeenCalledWith("attendance:john:*");
      expect(mockDelete).toHaveBeenCalledWith("todayAttendance:john");
      expect(mockInvalidate).toHaveBeenCalledWith("attendanceSummary:john:*");
    });
  });

  describe("CHECK_OUT", () => {
    it("returns NOT_FOUND when no check-in record exists", async () => {
      mockFindFirst.mockResolvedValue(null);
      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_OUT" }), cb);
      expect(cb).toHaveBeenCalledWith(null, {
        message: MESSAGES.NO_CHECKIN_FOUND,
        status: status.NOT_FOUND,
      });
    });

    it("returns NOT_FOUND when record has no timeIn", async () => {
      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        timeIn: null,
        timeOut: null,
      });
      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_OUT" }), cb);
      expect(cb).toHaveBeenCalledWith(null, {
        message: MESSAGES.NO_CHECKIN_FOUND,
        status: status.NOT_FOUND,
      });
    });

    it("returns ALREADY_EXISTS when user has already checked out", async () => {
      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        timeIn: "2024-03-04T08:00:00.000Z",
        timeOut: "2024-03-04T17:00:00.000Z",
      });
      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_OUT" }), cb);
      expect(cb).toHaveBeenCalledWith(null, {
        message: MESSAGES.ALREADY_CHECKED_OUT,
        status: status.ALREADY_EXISTS,
      });
    });

    it("marks as Half Day when working hours < 4", async () => {
      jest.useFakeTimers();
      const checkOutTime = new Date(2024, 2, 4, 11, 0, 0); // local 11:00
      jest.setSystemTime(checkOutTime);

      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        timeIn: new Date(2024, 2, 4, 8, 0, 0).toISOString(), // local 8:00 → 3 hrs → Half Day
        timeOut: null,
        status: "Present",
      });
      const updated = { id: "rec-1", status: "Half Day" };
      mockUpdate.mockResolvedValue(updated);

      const cb = makeCallback();
      await markAttendance(makeCall({ userId: "john", type: "CHECK_OUT" }), cb);

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.status).toBe("Half Day");

      jest.useRealTimers();
    });

    it("preserves original status when working hours >= 4", async () => {
      jest.useFakeTimers();
      const checkOutTime = new Date(2024, 2, 4, 17, 0, 0); // local 17:00
      jest.setSystemTime(checkOutTime);

      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        timeIn: new Date(2024, 2, 4, 8, 0, 0).toISOString(), // local 8:00 → 9 hours → full day
        timeOut: null,
        status: "Late",
      });
      mockUpdate.mockResolvedValue({ id: "rec-1", status: "Late" });

      await markAttendance(
        makeCall({ userId: "john", type: "CHECK_OUT" }),
        makeCallback(),
      );

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.data.status).toBe("Late");

      jest.useRealTimers();
    });

    it("invalidates attendance caches after check-out", async () => {
      mockFindFirst.mockResolvedValue({
        id: "rec-1",
        timeIn: "2024-03-04T08:00:00.000Z",
        timeOut: null,
        status: "Present",
      });
      mockUpdate.mockResolvedValue({});

      await markAttendance(
        makeCall({ userId: "john", type: "CHECK_OUT" }),
        makeCallback(),
      );

      expect(mockInvalidate).toHaveBeenCalledWith("attendance:john:*");
      expect(mockDelete).toHaveBeenCalledWith("todayAttendance:john");
    });
  });

  it("returns INVALID_ARGUMENT for unknown attendance type", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await markAttendance(makeCall({ userId: "john", type: "UNKNOWN" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INVALID_ATTENDANCE_TYPE,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await markAttendance(makeCall({ userId: "john", type: "CHECK_IN" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
    });
  });
});
