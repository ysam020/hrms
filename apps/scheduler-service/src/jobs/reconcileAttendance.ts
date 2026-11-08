import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getLeaveConfig } from "../config";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export interface BalanceEntry {
  month: number;
  year: number;
  earnedPL: number;
  usedPL: number;
  usedLWP: number;
  remainingPL: number;
}

/**
 * The monthly ledger as an array. Older leave-service code could spread the
 * array into an object ({"0": {...}, "1": {...}, PL: n}); recover the
 * numbered entries from such a hybrid instead of crashing on it. Anything
 * else (a flat {PL: n} map, null) has no ledger yet.
 */
export function ledgerEntries(raw: unknown): BalanceEntry[] {
  if (Array.isArray(raw)) return raw as BalanceEntry[];
  if (!raw || typeof raw !== "object") return [];
  return Object.keys(raw)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (raw as Record<string, BalanceEntry>)[k]);
}

async function getHolidaysInRange(
  startYear: number,
  endYear: number,
): Promise<Set<string>> {
  const holidays = new Set<string>();
  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = await (prismaWithTenant as any).holiday.findMany({
      where: { year },
    });
    for (const record of yearHolidays) {
      const list = (record.holidays as Array<{ date: string }>) ?? [];
      list.forEach((h) => holidays.add(h.date));
    }
  }
  return holidays;
}

/**
 * Working days of the week (0=Sun..6=Sat) from the tenant's active
 * TenantSettings.workWeekPattern, defaulting to Mon-Fri when the tenant
 * hasn't configured one yet — mirrors SETTINGS_DEFAULTS.workWeekPattern in
 * apps/api-gateway/src/handlers/general.ts (duplicated here since
 * scheduler-service can't import across app boundaries).
 */
async function getWorkingDays(tenantId: string): Promise<number[]> {
  const settings = await (prismaWithTenant as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { workWeekPattern: true },
  });
  const pattern = settings?.workWeekPattern as
    | { workingDays?: number[] }
    | null
    | undefined;
  return pattern?.workingDays ?? [1, 2, 3, 4, 5];
}

async function processEmployee(
  userId: string,
  startDate: Date,
  endDate: Date,
  targetMonth: number,
  targetYear: number,
): Promise<void> {
  const leaveConfig = getLeaveConfig();
  const tenantId = getTenantId()!;

  const start = dayjs.utc(startDate).startOf("day");
  const end = dayjs.utc(endDate).startOf("day");

  const allDates: string[] = [];
  let cur = start;
  while (!cur.isAfter(end)) {
    allDates.push(cur.format("YYYY-MM-DD"));
    cur = cur.add(1, "day");
  }

  const existing = await (prismaWithTenant as any).attendanceRecord.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    select: { date: true },
  });
  const existingDates = new Set(
    existing.map((r: any) => dayjs.utc(r.date).format("YYYY-MM-DD")),
  );

  // A date already covered by a real leave application (applied by the
  // employee, however it was decided) is NOT a reconciliation gap — only
  // Rejected/Cancelled applications leave the date genuinely unaccounted
  // for. Without this check, every properly-approved leave day (which
  // correctly has no AttendanceRecord) would get a second, duplicate
  // system-generated leave stacked on top of it here, double-debiting the
  // balance for a day that was already paid for once on approval.
  const existingLeaves = await (
    prismaWithTenant as any
  ).leaveApplication.findMany({
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
  const [holidays, workingDays] = await Promise.all([
    getHolidaysInRange(startYear, endYear),
    getWorkingDays(tenantId),
  ]);

  const holidayDates: string[] = [];
  const weekOffDates: string[] = [];
  const regularDates: string[] = [];

  for (const date of missingDates) {
    if (holidays.has(date)) {
      holidayDates.push(date);
    } else {
      const dow = dayjs.utc(date).day();
      if (!workingDays.includes(dow)) {
        weekOffDates.push(date);
      } else {
        regularDates.push(date);
      }
    }
  }

  const now = new Date();

  const attendanceRecords = [
    ...holidayDates.map((date) => ({
      tenantId,
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Holiday",
      isCorrected: false,
    })),
    ...weekOffDates.map((date) => ({
      tenantId,
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Week Off",
      isCorrected: false,
    })),
    ...regularDates.map((date) => ({
      tenantId,
      userId,
      date: dayjs.utc(date).startOf("day").toDate(),
      workingHours: 0,
      status: "Leave",
      isCorrected: false,
    })),
  ];

  // The ledger charge, the attendance records and the
  // system-generated leave applications are one unit. If any part fails — or
  // the balance row keeps changing under us — nothing is written, and the
  // next nightly run finds the same dates still missing and retries them
  // (the run is idempotent: dates it has handled are no longer "missing").
  await (prismaWithTenant as any).$transaction(async (tx: any) => {
    const { plUsed } = await chargeLedger(tx, {
      tenantId,
      userId,
      regularDays: regularDates.length,
      targetMonth,
      targetYear,
      monthlyPaidLeaves: leaveConfig.monthlyPaidLeaves,
    });

    if (attendanceRecords.length > 0) {
      await tx.attendanceRecord.createMany({
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
      await tx.leaveApplication.createMany({
        data: leaveApplications.map((la) => ({ ...la, tenantId })),
      });
    }
  });
}

/**
 * The `balances` column is shared by two systems —
 *   - leave-service's policy entitlements, a flat map ({CL: 5, SL: 7, …})
 *     debited with an updatedAt compare-and-swap (leaveBalanceHelpers.ts);
 *   - this job's monthly PL ledger, an array of BalanceEntry (or, on rows a
 *     spread turned into an object, numbered keys "0", "1", …).
 * This job owns ONLY the ledger. It used to read the ledger, then write the
 * whole column back as an array with an unconditional upsert — deleting
 * every named entitlement, and overwriting any debit made in between.
 *
 * Now: the ledger is merged back into whatever else the row holds (named
 * keys untouched), with the same updatedAt compare-and-swap leave-service
 * uses, re-read and recomputed on a lost race.
 */
export function mergeLedger(raw: unknown, ledger: BalanceEntry[]): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) kept[k] = v; // named entitlements: not ours
    }
    if (Object.keys(kept).length === 0) return ledger; // pure ledger row
    ledger.forEach((entry, i) => {
      kept[String(i)] = entry;
    });
    return kept;
  }
  return ledger;
}

const LEDGER_CAS_ATTEMPTS = 5;

async function chargeLedger(
  tx: any,
  args: {
    tenantId: string;
    userId: string;
    regularDays: number;
    targetMonth: number;
    targetYear: number;
    monthlyPaidLeaves: number;
  },
): Promise<{ plUsed: number; lwpUsed: number }> {
  const { tenantId, userId, targetMonth, targetYear, monthlyPaidLeaves } = args;
  for (let attempt = 0; attempt < LEDGER_CAS_ATTEMPTS; attempt++) {
    let lb = await tx.leaveBalance.findFirst({
      where: { tenantId, userId },
      orderBy: { id: "asc" },
    });
    if (!lb) {
      lb = await tx.leaveBalance.create({
        data: {
          tenantId,
          userId,
          accumulatedPLBeforeCurrentMonth: 0,
          balances: [],
        },
      });
    }

    // Copies: a retry must start from the fresh row, not a mutated one.
    const balances: BalanceEntry[] = ledgerEntries(lb.balances).map((e) => ({
      ...e,
    }));

    let targetBalance = balances.find(
      (b) => b.month === targetMonth && b.year === targetYear,
    );
    if (!targetBalance) {
      targetBalance = {
        month: targetMonth,
        year: targetYear,
        earnedPL: monthlyPaidLeaves,
        usedPL: 0,
        usedLWP: 0,
        remainingPL: monthlyPaidLeaves,
      };
      balances.push(targetBalance);
    }

    // Deduction rules unchanged from the previous implementation.
    let remaining = args.regularDays;
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

      const accPL = lb.accumulatedPLBeforeCurrentMonth ?? 0;
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

    const newAccumulated = Math.max(
      0,
      (lb.accumulatedPLBeforeCurrentMonth ?? 0) -
        (plUsed > targetBalance.earnedPL - (targetBalance.usedPL - plUsed)
          ? plUsed - (targetBalance.earnedPL - (targetBalance.usedPL - plUsed))
          : 0),
    );

    const result = await tx.leaveBalance.updateMany({
      where: { id: lb.id, updatedAt: lb.updatedAt },
      data: {
        accumulatedPLBeforeCurrentMonth: newAccumulated,
        balances: mergeLedger(lb.balances, balances),
      },
    });
    if (result.count === 1) return { plUsed, lwpUsed };
    // The row changed between our read and write (e.g. a leave approval
    // debited it) — re-read and recompute instead of overwriting it.
  }
  throw new Error(
    `reconcileAttendance: leave balance for user ${userId} kept changing; retried ${LEDGER_CAS_ATTEMPTS} times`,
  );
}

/**
 * OFF unless explicitly enabled. This job auto-files Approved PL/LWP
 * leave for every unexplained working day and writes the PL ledger that
 * payroll reads (and Prisma's MongoDB client rejects createMany's
 * `skipDuplicates`, so it cannot complete as written). Enabling it changes
 * pay outcomes and is a product decision, not a bug fix.
 */
export function isAttendanceReconcileEnabled(): boolean {
  return process.env.ATTENDANCE_RECONCILE_ENABLED === "true";
}

export async function reconcileAttendance(): Promise<void> {
  if (!isAttendanceReconcileEnabled()) {
    logger.info(
      "reconcileAttendance: disabled (ATTENDANCE_RECONCILE_ENABLED is not 'true'); nothing read or written",
    );
    return;
  }
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

    // Resolve each tenant's dedicated physical DB (if any) up front, so
    // every business-model query inside processEmployee — via
    // prismaWithTenant — is routed to the tenant's own database instead of
    // silently falling back to the shared default one.
    const tenants = await prisma.tenant.findMany({
      select: { id: true, dbName: true },
    });
    const dbNameByTenant = new Map(tenants.map((t) => [t.id, t.dbName]));

    let processed = 0;
    let errors = 0;
    const touchedTenants = new Set<string>();
    for (const emp of employees) {
      if (!emp.tenantId) continue;
      try {
        const dbName = dbNameByTenant.get(emp.tenantId);
        const tenantClient = dbName ? getClientForDb(dbName) : null;
        await runWithTenant(emp.tenantId, tenantClient, () =>
          processEmployee(emp.id, startDate, endDate, targetMonth, targetYear),
        );
        processed++;
        touchedTenants.add(emp.tenantId);
      } catch (err) {
        errors++;
        logger.error(`reconcileAttendance: error processing ${emp.id}`, {
          err,
        });
      }
    }

    // Cache keys are tenant-scoped (`t:${tenantId}:attendance:*` etc.) — a
    // global pattern with no tenant prefix matches nothing, so each tenant
    // actually touched above must be invalidated individually.
    if (touchedTenants.size > 0) {
      await Promise.all(
        [...touchedTenants].flatMap((tenantId) => [
          cacheManager.invalidatePattern(`t:${tenantId}:attendance:*`),
          cacheManager.invalidatePattern(`t:${tenantId}:todayAttendance:*`),
          cacheManager.invalidatePattern(`t:${tenantId}:attendanceSummary:*`),
          cacheManager.invalidatePattern(`t:${tenantId}:leaves:*`),
        ]),
      );
    }

    logger.info(
      `reconcileAttendance: processed ${processed} employees, ${errors} errors`,
    );
  } catch (error) {
    logger.error("Error in attendance reconciliation job:", { error });
    throw error;
  }
}
