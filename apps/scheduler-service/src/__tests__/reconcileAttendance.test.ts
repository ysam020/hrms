import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { reconcileAttendance } from "../jobs/reconcileAttendance";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    attendanceRecord: { findMany: jest.fn(), createMany: jest.fn() },
    leaveApplication: { createMany: jest.fn() },
    leaveBalance: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    holiday: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    runWithTenant: jest
      .fn()
      .mockImplementation((_tenantId: string, _prisma: any, fn: () => any) =>
        fn(),
      ),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockAttendanceFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;
const mockAttendanceCreateMany = (prisma as any).attendanceRecord
  .createMany as jest.Mock;
const mockLeaveCreateMany = (prisma as any).leaveApplication
  .createMany as jest.Mock;
const mockLbFindFirst = (prisma as any).leaveBalance.findFirst as jest.Mock;
const mockLbUpsert = (prisma as any).leaveBalance.upsert as jest.Mock;
const mockHolidayFindMany = (prisma as any).holiday.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("reconcileAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAttendanceFindMany.mockResolvedValue([]);
    mockAttendanceCreateMany.mockResolvedValue({ count: 0 });
    mockLeaveCreateMany.mockResolvedValue({ count: 0 });
    mockLbFindFirst.mockResolvedValue({
      username: "john",
      accumulatedPLBeforeCurrentMonth: 0,
      balances: [],
    });
    mockLbUpsert.mockResolvedValue(undefined);
    mockHolidayFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when there are no active employees", async () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15
    mockUserFindMany.mockResolvedValue([]);
    await reconcileAttendance();
    expect(mockAttendanceFindMany).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("only processes active employees", async () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15
    mockUserFindMany.mockResolvedValue([{ username: "john" }]);
    await reconcileAttendance();
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeStatus: "Active" } }),
    );
  });

  it("processes previous month when today is 1st", async () => {
    // April 1st - should process March
    jest.setSystemTime(new Date(2024, 3, 1, 12, 0, 0));
    mockUserFindMany.mockResolvedValue([{ id: "u1", tenantId: "t1" }]);
    // All attendance already exists to avoid complex DB calls
    mockAttendanceFindMany.mockImplementation(() => {
      // Return all dates for March 2024 (1-31)
      const dates = [];
      for (let i = 1; i <= 31; i++) {
        dates.push({ date: new Date(2024, 2, i) });
      }
      return Promise.resolve(dates);
    });
    await reconcileAttendance();
    // Should query attendance for March
    const whereArg = mockAttendanceFindMany.mock.calls[0][0].where;
    expect(whereArg.date.gte.getMonth()).toBe(2); // March (0-indexed)
    expect(whereArg.date.lte.getMonth()).toBe(2);
  });

  it("processes current month from 1st to yesterday on non-1st", async () => {
    // March 15th - should process March 1-14
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    mockUserFindMany.mockResolvedValue([{ id: "u1", tenantId: "t1" }]);
    // All attendance already exists
    mockAttendanceFindMany.mockImplementation(() => {
      const dates = [];
      for (let i = 1; i <= 14; i++) {
        dates.push({ date: new Date(2024, 2, i) });
      }
      return Promise.resolve(dates);
    });
    await reconcileAttendance();
    const whereArg = mockAttendanceFindMany.mock.calls[0][0].where;
    expect(whereArg.date.gte.getDate()).toBe(1); // 1st of March
    expect(whereArg.date.lte.getDate()).toBe(14); // March 14 (yesterday)
  });

  it("invalidates cache patterns after processing employees", async () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    mockUserFindMany.mockResolvedValue([{ id: "u1", tenantId: "t1" }]);
    mockAttendanceFindMany.mockImplementation(() => {
      // Return all dates so no missing dates = no DB operations needed
      const dates = [];
      for (let i = 1; i <= 14; i++) {
        dates.push({ date: new Date(2024, 2, i) });
      }
      return Promise.resolve(dates);
    });
    await reconcileAttendance();
    expect(mockInvalidate).toHaveBeenCalledWith("attendance:*");
    expect(mockInvalidate).toHaveBeenCalledWith("leaves:*");
  });

  it("marks holidays correctly", async () => {
    jest.setSystemTime(new Date(2024, 2, 5, 12, 0, 0)); // March 5 - process March 1-4
    mockUserFindMany.mockResolvedValue([{ id: "u1", tenantId: "t1" }]);
    // No existing attendance
    mockAttendanceFindMany.mockResolvedValue([]);
    // March 1 is a holiday
    mockHolidayFindMany.mockResolvedValue([
      { holidays: [{ date: "2024-03-01" }, { date: "2024-03-02" }] },
    ]);
    mockLbFindFirst.mockResolvedValue({
      username: "john",
      accumulatedPLBeforeCurrentMonth: 0,
      balances: [
        {
          month: 3,
          year: 2024,
          earnedPL: 1,
          usedPL: 0,
          usedLWP: 0,
          remainingPL: 1,
        },
      ],
    });
    await reconcileAttendance();
    const createManyCall = mockAttendanceCreateMany.mock.calls[0][0];
    const holidayRecords = createManyCall.data.filter(
      (r: any) => r.status === "Holiday",
    );
    expect(holidayRecords.length).toBeGreaterThanOrEqual(1);
  });

  it("throws on top-level database error", async () => {
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0));
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    await expect(reconcileAttendance()).rejects.toThrow("DB error");
  });
});
