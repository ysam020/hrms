import { prisma, runWithTenant, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getLeaveConfig } from "../config";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

interface BalanceEntry {
  month: number;
  year: number;
  earnedPL: number;
  usedPL: number;
  usedLWP: number;
  remainingPL: number;
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
  userId: string,
  startDate: Date,
  endDate: Date,
  targetMonth: number,
  targetYear: number,
): Promise<void> {
  const leaveConfig = getLeaveConfig();

  const start = dayjs.utc(startDate).startOf("day");
  const end = dayjs.utc(endDate).startOf("day");

  const allDates: string[] = [];
  let cur = start;
  while (!cur.isAfter(end)) {
    allDates.push(cur.format("YYYY-MM-DD"));
    cur = cur.add(1, "day");
  }

  const existing = await prisma.attendanceRecord.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    select: { date: true },
  });
  const existingDates = new Set(
    existing.map((r) => dayjs.utc(r.date).format("YYYY-MM-DD")),
  );

  // A date already covered by a real leave application (applied by the
  // employee, however it was decided) is NOT a reconciliation gap — only
  // Rejected/Cancelled applications leave the date genuinely unaccounted
  // for. Without this check, every properly-approved leave day (which
  // correctly has no AttendanceRecord) would get a second, duplicate
  // system-generated leave stacked on top of it here, double-debiting the
  // balance for a day that was already paid for once on approval.
  const existingLeaves = await prisma.leaveApplication.findMany({
    where: {
      userId,
      status: { notIn: ["Rejected", "Cancelled"] },
      from: { lte: endDate },
      to: { gte: startDate },
    },
    select: { from: true, to: true },
  });
  const leaveCoveredDates = new Set<string>();
  for (const leave of existingLeaves) {
    let d = dayjs.utc(leave.from).startOf("day");
    const leaveEnd = dayjs.utc(leave.to).startOf("day");
    while (!d.isAfter(leaveEnd)) {
      leaveCoveredDates.add(d.format("YYYY-MM-DD"));
      d = d.add(1, "day");
    }
  }

  const missingDates = allDates.filter(
    (d) => !existingDates.has(d) && !leaveCoveredDates.has(d),
  );
  if (missingDates.length === 0) return;

  const startYear = start.year();
  const endYear = end.year();
  const holidays = await getHolidaysInRange(startYear, endYear);

  let lb = await prisma.leaveBalance.findFirst({
    where: { tenantId: getTenantId(), userId },
  });
  const balances: BalanceEntry[] =
    (lb?.balances as unknown as BalanceEntry[]) ?? [];
  const accumulated = lb?.accumulatedPLBeforeCurrentMonth ?? 0;

  let targetBalance = balances.find(
    (b) => b.month === targetMonth && b.year === targetYear,
  );
  if (!targetBalance) {
    if (!lb) {
      lb = await prisma.leaveBalance.create({
        data: {
          tenantId: getTenantId()!,
          userId,
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

  const holidayDates: string[] = [];
  const weekOffDates: string[] = [];
  const regularDates: string[] = [];

  for (const date of missingDates) {
    if (holidays.has(date)) {
      holidayDates.push(date);
    } else {
      const dow = dayjs.utc(date).day();
      if (dow === 0 || dow === 6) {
        weekOffDates.push(date);
      } else {
        regularDates.push(date);
      }
    }
  }

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
    }

    if (remaining > 0) {
      lwpUsed = remaining;
      targetBalance.usedLWP += lwpUsed;
    }
  }

  const now = new Date();

  const attendanceRecords = [
    ...holidayDates.map((date) => ({
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Holiday",
      isCorrected: false,
    })),
    ...weekOffDates.map((date) => ({
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Week Off",
      isCorrected: false,
    })),
    ...regularDates.map((date) => ({
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Leave",
      isCorrected: false,
    })),
  ];

  if (attendanceRecords.length > 0) {
    await (prisma.attendanceRecord.createMany as any)({
      data: attendanceRecords,
      skipDuplicates: true,
    });
  }

  const leaveApplications: Array<{
    userId: string;
    from: Date;
    to: Date;
    leaveType: string;
    days: number;
    status: string;
    reason: string;
    appliedOn: Date;
    approvedOn: Date;
  }> = [];

  for (const date of regularDates.slice(0, plUsed)) {
    const d = dayjs.utc(date).startOf("day").toDate();
    leaveApplications.push({
      userId,
      from: d,
      to: d,
      leaveType: "PL",
      days: 1,
      status: "Approved",
      reason: "System generated - No attendance record found",
      appliedOn: now,
      approvedOn: now,
    });
  }

  for (const date of regularDates.slice(plUsed)) {
    const d = dayjs.utc(date).startOf("day").toDate();
    leaveApplications.push({
      userId,
      from: d,
      to: d,
      leaveType: "LWP",
      days: 1,
      status: "Approved",
      reason: "System generated - No attendance record found",
      appliedOn: now,
      approvedOn: now,
    });
  }

  if (leaveApplications.length > 0) {
    const tenantId = getTenantId()!;
    await prisma.leaveApplication.createMany({
      data: leaveApplications.map((la) => ({ ...la, tenantId })),
    });
  }

  const newAccumulated = Math.max(
    0,
    (lb?.accumulatedPLBeforeCurrentMonth ?? 0) -
      (plUsed > targetBalance.earnedPL - (targetBalance.usedPL - plUsed)
        ? plUsed - (targetBalance.earnedPL - (targetBalance.usedPL - plUsed))
        : 0),
  );

  const tenantId = getTenantId()!;
  await prisma.leaveBalance.upsert({
    where: { tenantId_userId: { tenantId, userId } },
    update: {
      accumulatedPLBeforeCurrentMonth: newAccumulated,
      balances: balances as any,
    },
    create: {
      tenantId,
      userId,
      accumulatedPLBeforeCurrentMonth: newAccumulated,
      balances: balances as any,
    },
  });
}

export async function reconcileAttendance(): Promise<void> {
  try {
    const today = dayjs.utc();
    const yesterday = today.subtract(1, "day");

    let targetMonth: number;
    let targetYear: number;
    let startDate: Date;
    let endDate: Date;

    if (today.date() === 1) {
      const prevMonth = today.subtract(1, "month");
      targetMonth = prevMonth.month() + 1;
      targetYear = prevMonth.year();
      startDate = prevMonth.startOf("month").toDate();
      endDate = prevMonth.endOf("month").startOf("day").toDate();
    } else {
      targetMonth = today.month() + 1;
      targetYear = today.year();
      startDate = today.startOf("month").toDate();
      endDate = yesterday.startOf("day").toDate();
    }

    if (startDate > endDate) {
      logger.warn("reconcileAttendance: invalid date range, skipping");
      return;
    }

    const employees = await prisma.user.findMany({
      where: { employeeStatus: "Active" },
      select: { id: true, tenantId: true },
    });

    let processed = 0;
    let errors = 0;
    for (const emp of employees) {
      if (!emp.tenantId) continue;
      try {
        await runWithTenant(emp.tenantId, null, () =>
          processEmployee(emp.id, startDate, endDate, targetMonth, targetYear),
        );
        processed++;
      } catch (err) {
        errors++;
        logger.error(`reconcileAttendance: error processing ${emp.id}`, {
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
