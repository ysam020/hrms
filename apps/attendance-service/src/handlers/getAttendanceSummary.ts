import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

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

    const monthNum = parseInt(String(month));
    const yearNum = parseInt(String(year));

    const today = dayjs.utc();
    const isCurrentMonth =
      yearNum === today.year() && monthNum === today.month() + 1;
    const monthStart = dayjs.utc(
      `${yearNum}-${String(monthNum).padStart(2, "0")}-01`,
    );
    const endDay = isCurrentMonth ? today.date() : monthStart.daysInMonth();

    const records = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: {
          gte: monthStart.toDate(),
          lte: monthStart.date(endDay).endOf("day").toDate(),
        },
      },
      select: { date: true, status: true, isCorrected: true },
    });

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
    const leaveBalance = await prisma.leaveBalance.findUnique({
      where: { userId },
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
