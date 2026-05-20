import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getDashboardStats } from "../handlers/getDashboardStats";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { count: jest.fn() },
    attendanceRecord: { count: jest.fn() },
    leaveApplication: { count: jest.fn() },
    jobOpening: { count: jest.fn() },
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
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockUserCount = prisma.user.count as jest.Mock;
const mockAttendanceCount = (prisma as any).attendanceRecord.count as jest.Mock;
const mockLeaveCount = (prisma as any).leaveApplication.count as jest.Mock;
const mockJobCount = (prisma as any).jobOpening.count as jest.Mock;
const mockCacheGet = cacheManager.get as jest.Mock;
const mockCacheSet = cacheManager.set as jest.Mock;

describe("getDashboardStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns cached response on cache hit", async () => {
    const cached = {
      message: MESSAGES.DASHBOARD_STATS_FETCHED,
      status: status.OK,
      totalEmployees: 50,
      presentToday: 40,
      onLeave: 5,
      pendingApprovals: 3,
      openJobPositions: 2,
      avgAttendanceRate: 80,
    };
    mockCacheGet.mockResolvedValue(cached);

    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);

    expect(cb).toHaveBeenCalledWith(null, cached);
    expect(mockUserCount).not.toHaveBeenCalled();
  });

  it("fetches all stats in parallel and returns aggregated response", async () => {
    mockUserCount.mockResolvedValue(100);
    mockAttendanceCount.mockResolvedValue(80);
    mockLeaveCount
      .mockResolvedValueOnce(5) // pendingLeaves
      .mockResolvedValueOnce(10); // onLeave
    mockJobCount.mockResolvedValue(3);

    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);

    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.DASHBOARD_STATS_FETCHED,
      status: status.OK,
      totalEmployees: 100,
      presentToday: 80,
      onLeave: 10,
      pendingApprovals: 5,
      openJobPositions: 3,
      avgAttendanceRate: 80,
    });
  });

  it("computes avgAttendanceRate as (presentToday / totalEmployees) * 100", async () => {
    mockUserCount.mockResolvedValue(200);
    mockAttendanceCount.mockResolvedValue(150);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);

    expect(cb.mock.calls[0][1].avgAttendanceRate).toBe(75);
  });

  it("returns avgAttendanceRate of 0 when totalEmployees is 0", async () => {
    mockUserCount.mockResolvedValue(0);
    mockAttendanceCount.mockResolvedValue(0);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);

    expect(cb.mock.calls[0][1].avgAttendanceRate).toBe(0);
  });

  it("rounds avgAttendanceRate to 2 decimal places", async () => {
    mockUserCount.mockResolvedValue(3);
    mockAttendanceCount.mockResolvedValue(2);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);

    // (2/3)*100 = 66.666... → rounded to 66.67
    expect(cb.mock.calls[0][1].avgAttendanceRate).toBe(66.67);
  });

  it("queries attendanceRecord with today's date for present count", async () => {
    mockUserCount.mockResolvedValue(10);
    mockAttendanceCount.mockResolvedValue(8);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    await getDashboardStats(makeCall({}), makeCallback());

    const attendanceCallArgs = mockAttendanceCount.mock.calls[0][0];
    expect(attendanceCallArgs.where.status).toEqual({
      in: ["Present", "Late"],
    });
    expect(attendanceCallArgs.where.date).toBeInstanceOf(Date);
  });

  it("counts only Active employees for totalEmployees", async () => {
    mockUserCount.mockResolvedValue(50);
    mockAttendanceCount.mockResolvedValue(0);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    await getDashboardStats(makeCall({}), makeCallback());

    expect(mockUserCount).toHaveBeenCalledWith({
      where: { employeeStatus: "Active" },
    });
  });

  it("counts only Open job openings", async () => {
    mockUserCount.mockResolvedValue(0);
    mockAttendanceCount.mockResolvedValue(0);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(5);

    await getDashboardStats(makeCall({}), makeCallback());

    expect(mockJobCount).toHaveBeenCalledWith({ where: { status: "Open" } });
  });

  it("caches the response with dashboard key", async () => {
    mockUserCount.mockResolvedValue(10);
    mockAttendanceCount.mockResolvedValue(8);
    mockLeaveCount.mockResolvedValue(0);
    mockJobCount.mockResolvedValue(0);

    await getDashboardStats(makeCall({}), makeCallback());

    expect(mockCacheSet).toHaveBeenCalledWith(
      "t:t1:analytics:dashboard",
      expect.objectContaining({ status: status.OK }),
      "dashboard",
    );
  });

  it("returns INTERNAL with zeroed stats on database error", async () => {
    mockUserCount.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await getDashboardStats(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      totalEmployees: 0,
      presentToday: 0,
      onLeave: 0,
      pendingApprovals: 0,
      openJobPositions: 0,
      avgAttendanceRate: 0,
    });
  });
});
