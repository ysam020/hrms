import { Request, Response } from "express";
import { attendanceClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { parsePagination, PAGINATION } from "../utils/pagination";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export async function addAttendance(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall(attendanceClient, "markAttendance", {
      userId: user!.userId,
      type: req.body.type,
      latitude: req.body.latitude || 0,
      longitude: req.body.longitude || 0,
      deviceInfo: req.body.deviceInfo || "",
      imageUrl: req.body.imageUrl || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

function monthDateRange(year: string | string[], month: string | string[]) {
  year = Array.isArray(year) ? year[0] : year;
  month = Array.isArray(month) ? month[0] : month;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const monthStart = dayjs.utc(`${y}-${String(m).padStart(2, "0")}-01`);
  const startDate = monthStart.format("YYYY-MM-DD");
  const endDate = monthStart.endOf("month").format("YYYY-MM-DD");
  return { startDate, endDate };
}

export async function getAttendances(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { startDate, endDate } = monthDateRange(
      req.params.year,
      req.params.month,
    );
    const response = await grpcCall<any, any>(
      attendanceClient,
      "getAttendance",
      {
        userId: user!.userId,
        startDate,
        endDate,
        page: 1,
        limit: 100,
      },
    );
    const data = (response.data ?? []).map((r: any) => ({
      date: r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      workHours: r.workHours,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { ...response, data });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function getAllAttendances(req: Request, res: Response) {
  try {
    const { startDate, endDate } = monthDateRange(
      req.params.year,
      req.params.month,
    );
    const response = await grpcCall(attendanceClient, "getAttendance", {
      userId: "",
      startDate,
      endDate,
      ...parsePagination(
        req.query,
        PAGINATION.DEFAULT_LIMIT_LARGE,
        PAGINATION.MAX_LIMIT_LARGE,
      ),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function attendanceCorrection(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { userId: targetUserId, date, timeIn, timeOut } = req.body;
    if (!targetUserId)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "userId is required",
      });

    const requestingUser = await prisma.user.findUnique({
      where: { id: user!.userId },
      select: { isSuperUser: true },
    });
    if (!requestingUser)
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "User not found",
      });
    if (!requestingUser.isSuperUser && user!.userId !== targetUserId)
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    const response = (await grpcCall(attendanceClient, "correctAttendance", {
      userId: targetUserId,
      date: date || "",
      timeIn: timeIn || "",
      timeOut: timeOut || "",
      correctedBy: user!.userId,
    })) as any;
    return apiResponse(res, grpcToHttpStatus(response.status), response);
  } catch (error: unknown) {
    logger.error("PUT /attendance-correction error:", { error });
    return handleError(res, error);
  }
}

export async function getAttendanceSummary(req: Request, res: Response) {
  try {
    const userId = String(req.params.userId);
    const yearNum = parseInt(String(req.params.year));
    const monthNum = parseInt(String(req.params.month));

    const today = dayjs.utc();
    const isCurrentMonth =
      yearNum === today.year() && monthNum === today.month() + 1;

    const monthStart = dayjs.utc(
      `${yearNum}-${String(monthNum).padStart(2, "0")}-01`,
    );
    const endDay = isCurrentMonth ? today.date() : monthStart.daysInMonth();
    const startDate = monthStart.toDate();
    const endDate = monthStart.date(endDay).endOf("day").toDate();

    const [records, leaveBalance] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
        select: { date: true, status: true, isCorrected: true },
      }),
      prisma.leaveBalance.findUnique({
        where: { userId },
        select: { balances: true },
      }),
    ]);

    const recordMap = new Map<string, string>();
    let correctionsUsed = 0;
    for (const r of records) {
      const dateStr = dayjs.utc(r.date).format("YYYY-MM-DD");
      recordMap.set(dateStr, r.status || "");
      if (r.isCorrected) correctionsUsed++;
    }

    let presents = 0,
      halfDays = 0,
      leaves = 0,
      weekOffs = 0,
      holidays = 0;
    for (let day = 1; day <= endDay; day++) {
      const dateStr = monthStart.date(day).format("YYYY-MM-DD");
      const s = recordMap.get(dateStr) || "";
      if (s === "Present") presents++;
      else if (s === "Half Day") halfDays++;
      else if (s === "Week Off") weekOffs++;
      else if (s === "Holiday") holidays++;
      else leaves++;
    }

    let usedPL = 0,
      usedLWP = 0;
    if (leaveBalance?.balances && Array.isArray(leaveBalance.balances)) {
      const mb = (leaveBalance.balances as any[]).find(
        (b) =>
          String(b.year) === String(yearNum) &&
          String(b.month) === String(monthNum),
      );
      if (mb) {
        usedPL = mb.usedPL || 0;
        usedLWP = mb.usedLWP || 0;
      }
    }

    const maxCorrectionsPerMonth = parseInt(
      process.env.ATTENDANCE_CORRECTIONS_PER_MONTH || "3",
    );
    const remainingCorrections = Math.max(
      0,
      maxCorrectionsPerMonth - correctionsUsed,
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Attendance summary fetched",
      data: {
        presents,
        halfDays,
        leaves,
        weekOffs,
        holidays,
        paidLeaves: usedPL,
        unpaidLeaves: usedLWP,
        totalLeaves: usedPL + usedLWP,
        correctionsUsed,
        remainingCorrections,
        maxCorrectionsPerMonth,
      },
    });
  } catch (error: unknown) {
    logger.error("get-attendance-summary error:", { error });
    return handleError(res, error);
  }
}

export async function attendanceInsights(req: Request, res: Response) {
  try {
    const period = (req.query.period as string) || "current_month";
    const today = dayjs.utc();

    let startDate: Date;
    let endDate: Date = today.endOf("day").toDate();

    switch (period) {
      case "last_month": {
        const prevMonth = today.subtract(1, "month");
        startDate = prevMonth.startOf("month").toDate();
        endDate = prevMonth.endOf("month").toDate();
        break;
      }
      case "quarter": {
        const quarterStartMonth = Math.floor(today.month() / 3) * 3;
        startDate = today.month(quarterStartMonth).startOf("month").toDate();
        break;
      }
      case "year":
        startDate = today.startOf("year").toDate();
        break;
      default:
        startDate = today.startOf("month").toDate();
    }

    const [records, users] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: {
          userId: true,
          date: true,
          status: true,
          workingHours: true,
          isCorrected: true,
          timeIn: true,
        },
      }),
      prisma.user.findMany({
        where: { employeeStatus: "Active" },
        select: { id: true, department: true },
      }),
    ]);

    const userDeptMap = new Map<string, string>(
      users.map(
        (u: any) => [u.id, u.department || "Unknown"] as [string, string],
      ),
    );

    const total = records.length;
    const presentCount = records.filter(
      (r: any) => r.status === "Present" || r.status === "Late",
    ).length;
    const halfDayCount = records.filter(
      (r: any) => r.status === "Half Day",
    ).length;
    const correctedCount = records.filter((r: any) => r.isCorrected).length;
    const withHours = records.filter(
      (r: any) => r.workingHours != null && r.workingHours > 0,
    );
    const avgWorkingHours =
      withHours.length > 0
        ? Math.round(
            (withHours.reduce(
              (s: any, r: any) => s + (r.workingHours || 0),
              0,
            ) /
              withHours.length) *
              100,
          ) / 100
        : 0;
    const withCheckIn = records.filter((r: any) => r.timeIn);
    const automatedCheckIns = withCheckIn.filter(
      (r: any) => !r.isCorrected,
    ).length;
    const overallAttendanceRate =
      total > 0 ? Math.round(((presentCount + halfDayCount) / total) * 100) : 0;
    const correctionRate =
      total > 0 ? Math.round((correctedCount / total) * 100) : 0;
    const automationRate =
      withCheckIn.length > 0
        ? Math.round((automatedCheckIns / withCheckIn.length) * 100)
        : 0;

    const statusDistribution = {
      present: presentCount,
      halfDay: halfDayCount,
      leave: records.filter(
        (r: any) => !r.status || r.status === "Absent" || r.status === "Leave",
      ).length,
      weekOff: records.filter((r: any) => r.status === "Week Off").length,
      holiday: records.filter((r: any) => r.status === "Holiday").length,
    };

    const byEmployee = new Map<string, typeof records>();
    for (const r of records) {
      if (!byEmployee.has(r.userId)) byEmployee.set(r.userId, []);
      byEmployee.get(r.userId)!.push(r);
    }
    const employeeRiskAssessment = Array.from(byEmployee.entries())
      .map(([userId, recs]) => {
        const t = recs.length;
        const p = recs.filter(
          (r: any) =>
            r.status === "Present" ||
            r.status === "Late" ||
            r.status === "Half Day",
        ).length;
        const attendanceRate = t > 0 ? Math.round((p / t) * 100) : 0;
        const hoursRecs = recs.filter((r: any) => r.workingHours);
        const avgHours =
          hoursRecs.length > 0
            ? Math.round(
                (hoursRecs.reduce(
                  (s: any, r: any) => s + (r.workingHours || 0),
                  0,
                ) /
                  hoursRecs.length) *
                  100,
              ) / 100
            : 0;
        const corrFreq =
          t > 0
            ? Math.round(
                (recs.filter((r: any) => r.isCorrected).length / t) * 100,
              )
            : 0;
        const riskScore =
          Math.round(
            ((100 - attendanceRate) * 0.5 +
              corrFreq * 0.3 +
              Math.max(0, 8 - avgHours) * 2.5) *
              10,
          ) / 10;
        return {
          userId,
          attendanceRate,
          avgWorkingHours: avgHours,
          correctionFrequency: corrFreq,
          riskScore,
          riskLevel:
            riskScore > 30 ? "High" : riskScore > 15 ? "Medium" : "Low",
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    const byDept = new Map<string, typeof records>();
    for (const r of records) {
      const dept = userDeptMap.get(r.userId) || "Unknown";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept)!.push(r);
    }
    const teamPerformance = Array.from(byDept.entries()).map(
      ([department, recs]) => {
        const t = recs.length;
        const p = recs.filter(
          (r: any) =>
            r.status === "Present" ||
            r.status === "Late" ||
            r.status === "Half Day",
        ).length;
        const hoursRecs = recs.filter((r: any) => r.workingHours);
        return {
          department,
          employeeCount: new Set(recs.map((r: any) => r.userId)).size,
          attendanceRate: t > 0 ? Math.round((p / t) * 100) : 0,
          avgWorkingHours:
            hoursRecs.length > 0
              ? Math.round(
                  (hoursRecs.reduce(
                    (s: any, r: any) => s + (r.workingHours || 0),
                    0,
                  ) /
                    hoursRecs.length) *
                    100,
                ) / 100
              : 0,
          correctionRate:
            t > 0
              ? Math.round(
                  (recs.filter((r: any) => r.isCorrected).length / t) * 100,
                )
              : 0,
        };
      },
    );

    const weekMap = new Map<number, { present: number; total: number }>();
    for (const r of records) {
      const d = dayjs.utc(r.date);
      const startOfYear = d.startOf("year");
      const week = Math.ceil(
        (d.diff(startOfYear, "day") + startOfYear.day() + 1) / 7,
      );
      if (!weekMap.has(week)) weekMap.set(week, { present: 0, total: 0 });
      const w = weekMap.get(week)!;
      w.total++;
      if (
        r.status === "Present" ||
        r.status === "Late" ||
        r.status === "Half Day"
      )
        w.present++;
    }
    const weeklyTrends = Array.from(weekMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, { present, total: wt }]) => ({
        week,
        attendanceRate: wt > 0 ? Math.round((present / wt) * 100) : 0,
      }));

    const last2 = weeklyTrends.slice(-2);
    const trendDirection =
      last2.length === 2
        ? last2[1].attendanceRate - last2[0].attendanceRate > 5
          ? "improving"
          : last2[1].attendanceRate - last2[0].attendanceRate < -5
            ? "declining"
            : "stable"
        : "stable";

    const hourMap = new Map<number, number>();
    for (const r of records) {
      if (r.timeIn) {
        const hour = dayjs(r.timeIn).hour();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
    }
    const peakHours = Array.from(hourMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({ hour, count }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        primaryMetrics: {
          overallAttendanceRate,
          averageWorkingHours: avgWorkingHours,
          correctionRate,
          automationRate,
          statusDistribution,
        },
        employeeRiskAssessment,
        teamPerformance,
        trendAnalysis: { weeklyTrends, trendDirection },
        attendancePatterns: { peakHours },
      },
    });
  } catch (error: unknown) {
    logger.error("GET /attendance-insights error:", { error });
    return handleError(res, error);
  }
}
