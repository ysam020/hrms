import { Request, Response } from "express";
import { attendanceClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";
import { isPrivileged } from "./approvalChains";
import { getActiveSettings } from "./tenantSettings";
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
  const authReq = req as AuthRequest;
  const { user } = authReq;
  try {
    const { page, limit } = parsePagination(
      req.query,
      PAGINATION.DEFAULT_LIMIT_LARGE,
      PAGINATION.MAX_LIMIT_LARGE,
    );
    const search = String(req.query.search || "").trim();
    const { startDate, endDate } = monthDateRange(
      req.params.year,
      req.params.month,
    );
    const year = parseInt(String(req.params.year));
    const month = parseInt(String(req.params.month));
    const start = dayjs.utc(startDate).startOf("day").toDate();
    const end = dayjs.utc(endDate).endOf("day").toDate();
    const skip = (page - 1) * limit;

    const privileged = await isPrivileged(authReq);
    const userWhere: any = { employeeStatus: "Active" };
    if (!privileged) {
      // Non-privileged callers only ever see their own row in this table.
      userWhere.id = user!.userId;
    } else if (search) {
      userWhere.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { first_name: { contains: search, mode: "insensitive" } },
        { last_name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [totalCount, users] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          username: true,
          first_name: true,
          last_name: true,
        },
        orderBy: { username: "asc" },
        skip,
        take: limit,
      }),
    ]);

    const userIds = users.map((u: any) => u.id);
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const [attendanceRecords, leaveBalances] = await Promise.all([
      userIds.length > 0
        ? prisma.attendanceRecord.findMany({
            where: { userId: { in: userIds }, date: { gte: start, lte: end } },
            select: { userId: true, status: true, isCorrected: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.leaveBalance.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, balances: true },
          })
        : Promise.resolve([]),
    ]);

    const byUser = new Map<
      string,
      { presents: number; halfDays: number; correctionsUsed: number }
    >();
    for (const u of users as any[]) {
      byUser.set(u.id, { presents: 0, halfDays: 0, correctionsUsed: 0 });
    }
    for (const r of attendanceRecords as any[]) {
      const agg = byUser.get(r.userId);
      if (!agg) continue;
      if (r.status === "Present") agg.presents++;
      else if (r.status === "Half Day") agg.halfDays++;
      if (r.isCorrected) agg.correctionsUsed++;
    }

    const balanceMap = new Map(
      (leaveBalances as any[]).map((lb) => [lb.userId, lb]),
    );

    const records = (users as any[]).map((u) => {
      const agg = byUser.get(u.id)!;
      const lb = balanceMap.get(u.id) as any;
      let paidLeaves = 0,
        unpaidLeaves = 0;
      if (lb?.balances && Array.isArray(lb.balances)) {
        const mb = lb.balances.find(
          (b: any) =>
            String(b.year) === String(year) &&
            String(b.month) === String(month),
        );
        if (mb) {
          paidLeaves = mb.usedPL || 0;
          unpaidLeaves = mb.usedLWP || 0;
        }
      }
      const userInfo = userMap.get(u.id);
      return {
        username: userInfo?.username,
        firstName: userInfo?.first_name,
        lastName: userInfo?.last_name,
        presents: agg.presents,
        halfDays: agg.halfDays,
        totalLeaves: paidLeaves + unpaidLeaves,
        paidLeaves,
        unpaidLeaves,
        correctionsUsed: agg.correctionsUsed,
      };
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Attendance records fetched",
      data: {
        records,
        pagination: {
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error: unknown) {
    logger.error("getAllAttendances error:", { error });
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

    const requestingUserIsSuperUser = await isSuperUser(user!.userId);
    const isPrivileged =
      requestingUserIsSuperUser ||
      ["owner", "admin", "hr"].includes(user!.tenantRole ?? "");
    if (!requestingUserIsSuperUser && user!.userId !== targetUserId)
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });

    // Regularization backdating window — HR/admin/superusers are exempt, so
    // they can always fix an old record; everyone else is bounded by the
    // tenant's configured window (default 3 days, matching today's behavior
    // for tenants that never touch this setting).
    if (!isPrivileged && date && user!.tenantId) {
      const settings = await getActiveSettings(user!.tenantId);
      const windowDays = settings?.regularizationBackdateWindowDays ?? 3;
      const oldestAllowed = dayjs
        .utc()
        .subtract(windowDays, "day")
        .startOf("day");
      if (dayjs.utc(date).isBefore(oldestAllowed)) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `Attendance can only be corrected up to ${windowDays} day(s) back. Ask an admin or HR for older corrections.`,
        });
      }
    }

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
    const authReq = req as AuthRequest;
    const { user } = authReq;
    const userId = String(req.params.userId);
    if (userId !== user!.userId && !(await isPrivileged(authReq))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You do not have permission to view this user's attendance.",
      });
    }
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

    const [records, leaveBalance, tenantSettings, holidayRecords] =
      await Promise.all([
        prisma.attendanceRecord.findMany({
          where: { userId, date: { gte: startDate, lte: endDate } },
          select: { date: true, status: true, isCorrected: true },
        }),
        prisma.leaveBalance.findFirst({
          where: { userId },
          select: { balances: true },
        }),
        user?.tenantId
          ? getActiveSettings(user.tenantId)
          : Promise.resolve(null),
        (prisma as any).holiday.findMany({ where: { year: yearNum } }),
      ]);
    const workingDays: number[] = (tenantSettings as any)?.workWeekPattern
      ?.workingDays ?? [1, 2, 3, 4, 5];
    const holidayDateKeys = new Set<string>(
      (holidayRecords as any[]).flatMap((r) =>
        (Array.isArray(r.holidays) ? r.holidays : []).map((h: any) => h.date),
      ),
    );

    const recordMap = new Map<string, string>();
    let correctionsUsed = 0;
    for (const r of records) {
      const dateStr = dayjs.utc(r.date).format("YYYY-MM-DD");
      recordMap.set(dateStr, r.status || "");
      if (r.isCorrected) correctionsUsed++;
    }

    let presents = 0,
      late = 0,
      halfDays = 0,
      leaves = 0,
      weekOffs = 0,
      holidays = 0,
      wfh = 0;
    for (let day = 1; day <= endDay; day++) {
      const dateStr = monthStart.date(day).format("YYYY-MM-DD");
      const s = recordMap.get(dateStr) || "";
      if (s === "Present") presents++;
      else if (s === "Late") late++;
      else if (s === "Half Day") halfDays++;
      else if (s === "Week Off") weekOffs++;
      else if (s === "Holiday") holidays++;
      else if (s === "WFH") wfh++;
      // No record for this date at all — if it's a configured holiday or
      // not a working day per the tenant's work-week pattern, it's an
      // implicit (unbackfilled) day off, not an unaccounted leave. Only
      // reconcileAttendance.ts writes an explicit "Holiday"/"Week Off"
      // record, and only once its nightly run catches up, so this covers
      // the gap until then.
      else if (!s && holidayDateKeys.has(dateStr)) holidays++;
      else if (!s && !workingDays.includes(monthStart.date(day).day()))
        weekOffs++;
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
        late,
        halfDays,
        leaves,
        weekOffs,
        holidays,
        wfh,
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

    const records = await prisma.attendanceRecord.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: {
        userId: true,
        date: true,
        status: true,
        workingHours: true,
        isCorrected: true,
        timeIn: true,
      },
    });

    // Look up every user actually referenced by a record in this period —
    // not just currently-active employees — so someone who left mid-period
    // still resolves to their real name/department instead of "Unknown".
    const recordUserIds = [...new Set(records.map((r: any) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: recordUserIds } },
      select: {
        id: true,
        department: true,
        username: true,
        first_name: true,
        last_name: true,
      },
    });

    const userDeptMap = new Map<string, string>(
      users.map(
        (u: any) => [u.id, u.department || "Unknown"] as [string, string],
      ),
    );
    const userInfoMap = new Map<string, { username: string; name: string }>(
      users.map((u: any) => {
        const name =
          [u.first_name, u.last_name].filter(Boolean).join(" ") ||
          u.username ||
          "Unknown";
        return [u.id, { username: u.username || "", name }];
      }),
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
        const info = userInfoMap.get(userId);
        return {
          userId,
          username: info?.username || "",
          employeeName: info?.name || "Unknown",
          department: userDeptMap.get(userId) || "Unknown",
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
