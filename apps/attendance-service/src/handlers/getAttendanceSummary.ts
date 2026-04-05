import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

const isObjectId = (v: string) => /^[0-9a-f]{24}$/i.test(v);

export const getAttendanceSummary = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, month, year } = call.request;

    if (!userId || !month || !year) {
      return callback(null, {
        message: MESSAGES.USER_ID_MONTH_YEAR_REQUIRED,
        status: status.INVALID_ARGUMENT,
        data: {
          presents: 0,
          halfDays: 0,
          leaves: 0,
          weekOffs: 0,
          holidays: 0,
          paidLeaves: 0,
          unpaidLeaves: 0,
          totalLeaves: 0,
          correctionsUsed: 0,
          remainingCorrections: 3,
          maxCorrectionsPerMonth: 3,
        },
      });
    }

    const cacheKey = `attendanceSummary:${userId}:${month}:${year}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    // Resolve username
    let username: string = userId;
    if (isObjectId(userId)) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      username = user?.username || userId;
    }

    const monthNum = parseInt(String(month));
    const yearNum = parseInt(String(year));
    const monthPadded = String(monthNum).padStart(2, "0");

    const today = new Date();
    const isCurrentMonth =
      yearNum === today.getFullYear() && monthNum === today.getMonth() + 1;
    const endDay = isCurrentMonth
      ? today.getDate()
      : new Date(yearNum, monthNum, 0).getDate();

    const records = await prisma.attendanceRecord.findMany({
      where: {
        username,
        date: {
          gte: new Date(yearNum, monthNum - 1, 1),
          lte: new Date(yearNum, monthNum - 1, endDay, 23, 59, 59),
        },
      },
      select: { date: true, status: true, isCorrected: true },
    });

    const recordMap = new Map<string, string>();
    let correctionsUsed = 0;
    for (const r of records) {
      const dateStr = new Date(r.date).toISOString().split("T")[0];
      recordMap.set(dateStr, r.status || "");
      if (r.isCorrected) correctionsUsed++;
    }

    // Count by status across all days of the month up to today
    let presents = 0,
      halfDays = 0,
      leaves = 0,
      weekOffs = 0,
      holidays = 0;
    for (let day = 1; day <= endDay; day++) {
      const dateStr = `${yearNum}-${monthPadded}-${String(day).padStart(2, "0")}`;
      const s = recordMap.get(dateStr) || "";
      if (s === "Present") presents++;
      else if (s === "Half Day") halfDays++;
      else if (s === "Week Off") weekOffs++;
      else if (s === "Holiday") holidays++;
      else leaves++;
    }

    // Fetch leave balance for paidLeaves / unpaidLeaves
    let usedPL = 0,
      usedLWP = 0;
    const leaveBalance = await prisma.leaveBalance.findUnique({
      where: { username },
      select: { balances: true },
    });
    if (leaveBalance?.balances && Array.isArray(leaveBalance.balances)) {
      const monthBalance = (leaveBalance.balances as any[]).find(
        (b) =>
          String(b.year) === String(yearNum) &&
          String(b.month) === String(monthNum),
      );
      if (monthBalance) {
        usedPL = monthBalance.usedPL || 0;
        usedLWP = monthBalance.usedLWP || 0;
      }
    }

    const maxCorrectionsPerMonth = parseInt(
      process.env.ATTENDANCE_CORRECTIONS_PER_MONTH || "3",
    );
    const remainingCorrections = Math.max(
      0,
      maxCorrectionsPerMonth - correctionsUsed,
    );

    const response = {
      message: MESSAGES.ATTENDANCE_SUMMARY_FETCHED,
      status: status.OK,
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
    };
    await cacheManager.set(cacheKey, response, "attendance");
    return callback(null, response);
  } catch (err) {
    logger.error("GetAttendanceSummary error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
      data: {
        presents: 0,
        halfDays: 0,
        leaves: 0,
        weekOffs: 0,
        holidays: 0,
        paidLeaves: 0,
        unpaidLeaves: 0,
        totalLeaves: 0,
        correctionsUsed: 0,
        remainingCorrections: 3,
        maxCorrectionsPerMonth: 3,
      },
    });
  }
};
