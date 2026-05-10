import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getLeaveConfig } from "../config";

interface BalanceEntry {
  month: number;
  year: number;
  earnedPL: number;
  usedPL: number;
  usedLWP: number;
  remainingPL: number;
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function generateAllDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(toDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function getHolidaysInRange(
  startYear: number,
  endYear: number,
): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = await prisma.holiday.findMany({ where: { year } });
    for (const record of yearHolidays) {
      const list = (record.holidays as Array<{ date: string }>) ?? [];
      list.forEach((h) => holidays.add(h.date));
    }
  }
  return holidays;
}

async function processEmployee(
  username: string,
  startDate: Date,
  endDate: Date,
  targetMonth: number,
  targetYear: number,
): Promise<void> {
  const leaveConfig = getLeaveConfig();

  const allDates = generateAllDates(startDate, endDate);

  const existing = await prisma.attendanceRecord.findMany({
    where: {
      username,
      date: { gte: startDate, lte: endDate },
    },
    select: { date: true },
  });
  const existingDates = new Set(existing.map((r) => toDateStr(r.date)));

  const missingDates = allDates.filter((d) => !existingDates.has(d));
  if (missingDates.length === 0) return;

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const holidays = await getHolidaysInRange(startYear, endYear);

  // Get or create leave balance
  let lb = await prisma.leaveBalance.findUnique({ where: { username } });
  const balances: BalanceEntry[] =
    (lb?.balances as unknown as BalanceEntry[]) ?? [];
  const accumulated = lb?.accumulatedPLBeforeCurrentMonth ?? 0;

  let targetBalance = balances.find(
    (b) => b.month === targetMonth && b.year === targetYear,
  );
  if (!targetBalance) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!lb) {
      // Create the record first
      lb = await prisma.leaveBalance.create({
        data: {
          username,
          accumulatedPLBeforeCurrentMonth: accumulated,
          balances: [],
        },
      });
    }
    targetBalance = {
      month: targetMonth,
      year: targetYear,
      earnedPL: leaveConfig.monthlyPaidLeaves,
      usedPL: 0,
      usedLWP: 0,
      remainingPL: leaveConfig.monthlyPaidLeaves,
    };
    balances.push(targetBalance);
  }

  // Categorise missing dates
  const holidayDates: string[] = [];
  const weekOffDates: string[] = [];
  const regularDates: string[] = [];

  for (const date of missingDates) {
    if (holidays.has(date)) {
      holidayDates.push(date);
    } else {
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      if (dow === 0 || dow === 6) {
        weekOffDates.push(date);
      } else {
        regularDates.push(date);
      }
    }
  }

  // Calculate leave distribution for regular missing dates
  let remaining = regularDates.length;
  let plUsed = 0;
  let lwpUsed = 0;

  if (remaining > 0) {
    const availablePL = Math.max(
      0,
      targetBalance.earnedPL - targetBalance.usedPL,
    );
    const currentPL = Math.min(remaining, availablePL);
    if (currentPL > 0) {
      plUsed += currentPL;
      remaining -= currentPL;
      targetBalance.usedPL += currentPL;
      targetBalance.remainingPL = Math.max(
        0,
        targetBalance.earnedPL - targetBalance.usedPL,
      );
    }

    const accPL = lb?.accumulatedPLBeforeCurrentMonth ?? 0;
    if (remaining > 0 && accPL > 0) {
      const accToUse = Math.min(remaining, accPL);
      plUsed += accToUse;
      remaining -= accToUse;
      targetBalance.usedPL += accToUse;
      // We'll update accumulatedPLBeforeCurrentMonth when we save
    }

    if (remaining > 0) {
      lwpUsed = remaining;
      targetBalance.usedLWP += lwpUsed;
    }
  }

  const attendanceRecords = [
    ...holidayDates.map((date) => ({
      username,
      date: new Date(date + "T00:00:00.000Z"),
      workingHours: 0,
      status: "Holiday",
      isCorrected: false,
    })),
    ...weekOffDates.map((date) => ({
      username,
      date: new Date(date + "T00:00:00.000Z"),
      workingHours: 0,
      status: "Week Off",
      isCorrected: false,
    })),
    ...regularDates.map((date) => ({
      username,
      date: new Date(date + "T00:00:00.000Z"),
      workingHours: 0,
      status: "Leave",
      isCorrected: false,
    })),
  ];

  if (attendanceRecords.length > 0) {
    // skipDuplicates is typed as `never` on this model in the current Prisma version
    await (prisma.attendanceRecord.createMany as any)({
      data: attendanceRecords,
      skipDuplicates: true,
    });
  }

  const now = new Date().toISOString();
  const leaveApplications: Array<{
    username: string;
    from: string;
    to: string;
    leaveType: string;
    days: number;
    status: string;
    reason: string;
    appliedOn: string;
    approvedByUsername: string;
    approvedOn: string;
  }> = [];

  for (const date of regularDates.slice(0, plUsed)) {
    leaveApplications.push({
      username,
      from: date,
      to: date,
      leaveType: "PL",
      days: 1,
      status: "Approved",
      reason: "System generated - No attendance record found",
      appliedOn: now,
      approvedByUsername: "SYSTEM",
      approvedOn: now,
    });
  }

  for (const date of regularDates.slice(plUsed)) {
    leaveApplications.push({
      username,
      from: date,
      to: date,
      leaveType: "LWP",
      days: 1,
      status: "Approved",
      reason: "System generated - No attendance record found",
      appliedOn: now,
      approvedByUsername: "SYSTEM",
      approvedOn: now,
    });
  }

  if (leaveApplications.length > 0) {
    await prisma.leaveApplication.createMany({ data: leaveApplications });
  }

  // Update leave balance
  const newAccumulated = Math.max(
    0,
    (lb?.accumulatedPLBeforeCurrentMonth ?? 0) -
      (plUsed > targetBalance.earnedPL - (targetBalance.usedPL - plUsed)
        ? plUsed - (targetBalance.earnedPL - (targetBalance.usedPL - plUsed))
        : 0),
  );

  await prisma.leaveBalance.upsert({
    where: { username },
    update: {
      accumulatedPLBeforeCurrentMonth: newAccumulated,
      balances: balances as any,
    },
    create: {
      username,
      accumulatedPLBeforeCurrentMonth: newAccumulated,
      balances: balances as any,
    },
  });
}

export async function reconcileAttendance(): Promise<void> {
  try {
    const today = new Date();
    const yesterday = addDays(today, -1);

    let targetMonth: number;
    let targetYear: number;
    let startDate: Date;
    let endDate: Date;

    if (today.getDate() === 1) {
      // First of month: process entire previous month
      const firstOfPrevMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1,
      );
      const lastOfPrevMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        0,
      );
      targetMonth = firstOfPrevMonth.getMonth() + 1;
      targetYear = firstOfPrevMonth.getFullYear();
      startDate = firstOfPrevMonth;
      endDate = lastOfPrevMonth;
    } else {
      targetMonth = today.getMonth() + 1;
      targetYear = today.getFullYear();
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = yesterday;
    }

    if (startDate > endDate) {
      logger.warn("reconcileAttendance: invalid date range, skipping");
      return;
    }

    const employees = await prisma.user.findMany({
      where: { employeeStatus: "Active" },
      select: { username: true },
    });

    let processed = 0;
    let errors = 0;
    for (const emp of employees) {
      try {
        await processEmployee(
          emp.username,
          startDate,
          endDate,
          targetMonth,
          targetYear,
        );
        processed++;
      } catch (err) {
        errors++;
        logger.error(`reconcileAttendance: error processing ${emp.username}`, {
          err,
        });
      }
    }

    if (processed > 0) {
      await Promise.all([
        cacheManager.invalidatePattern("attendance:*"),
        cacheManager.invalidatePattern("todayAttendance:*"),
        cacheManager.invalidatePattern("attendanceSummary:*"),
        cacheManager.invalidatePattern("leaves:*"),
      ]);
    }

    logger.info(
      `reconcileAttendance: processed ${processed} employees, ${errors} errors`,
    );
  } catch (error) {
    logger.error("Error in attendance reconciliation job:", { error });
    throw error;
  }
}
