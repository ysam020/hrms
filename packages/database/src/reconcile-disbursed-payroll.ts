/**
 * Read-only estimate of what approved paid leave cost employees in payroll
 * runs that have already been disbursed. Only `findMany` is ever called: no
 * record is changed and no payment can be started from here.
 *
 * Each employee line is recomputed twice with the shared calculator: as the
 * run computed it (no leave applications), and with approved paid leave.
 * The difference, valued at the gross the run actually used, is an ESTIMATE
 * of gross underpayment. It ignores PF, ESI, PT and TDS changes.
 *
 * The summary holds aggregates only. Per-employee rows use an HMAC of the
 * user id under a key generated for this run and discarded afterwards.
 */
import { createHmac, randomBytes } from "node:crypto";
import {
  computeMonthlyPaidDays,
  ledgerUsedPLFor,
  LEAVE_STATUSES_IN_EFFECT,
  isPaidLeaveType,
  type LeaveTypePolicy,
} from "@hrms/common";

export interface PayrollRunSummary {
  period: string;
  employees: number;
  employeesWithApprovedPaidLeave: number;
  employeesAffected: number;
  paidDaysDifference: number;
}

export interface TenantReconciliation {
  tenantLabel: string;
  runs: PayrollRunSummary[];
  employeesAffected: number;
  estimatedGrossUnderpayment: number;
  unableToEstimate: number;
}

export interface EmployeeRow {
  tenantLabel: string;
  period: string;
  employee: string;
  paidDaysAsRun: number;
  paidDaysCorrected: number;
  estimatedGrossUnderpayment: number | null;
}

type Client = any;

const inMonth = (d: Date, year: number, month: number) =>
  d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;

export async function reconcileTenant(
  client: Client,
  tenantLabel: string,
  joiningDates: Map<string, Date | null>,
  anonymise: (userId: string) => string,
): Promise<{ summary: TenantReconciliation; rows: EmployeeRow[] }> {
  const summary: TenantReconciliation = {
    tenantLabel,
    runs: [],
    employeesAffected: 0,
    estimatedGrossUnderpayment: 0,
    unableToEstimate: 0,
  };
  const rows: EmployeeRow[] = [];
  const affected = new Set<string>();

  const runs = await client.payrollRun.findMany({
    where: { status: "disbursed" },
    select: { id: true, month: true, year: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const settings = await client.tenantSettings.findFirst({
    orderBy: { effectiveFrom: "desc" },
    select: { workWeekPattern: true, leavePolicies: true },
  });
  const workingDays: number[] = settings?.workWeekPattern?.workingDays ?? [
    1, 2, 3, 4, 5,
  ];
  const policies = (settings?.leavePolicies ?? []) as LeaveTypePolicy[];

  for (const run of runs) {
    const { month, year } = run;
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const totalDays = last.getUTCDate();
    const period = `${year}-${String(month).padStart(2, "0")}`;

    const items = await client.payrollLineItem.findMany({
      where: { payrollRunId: run.id },
      select: { userId: true, grossSalary: true },
    });
    const userIds = items.map((i: { userId: string }) => i.userId);
    const [attendance, leaves, balances, holidayRows, exits] =
      await Promise.all([
        client.attendanceRecord.findMany({
          where: { userId: { in: userIds }, date: { gte: first, lte: last } },
          select: { userId: true, status: true, date: true },
        }),
        client.leaveApplication.findMany({
          where: {
            userId: { in: userIds },
            status: { in: [...LEAVE_STATUSES_IN_EFFECT] },
            from: { lte: last },
            to: { gte: first },
          },
          select: {
            userId: true,
            from: true,
            to: true,
            leaveType: true,
            status: true,
            unit: true,
            session: true,
            shortLeaveHours: true,
          },
        }),
        client.leaveBalance.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, balances: true },
        }),
        client.holiday.findMany({ where: { year } }),
        client.resignation.findMany({
          where: {
            userId: { in: userIds },
            lastWorkingDay: { gte: first, lte: last },
          },
          select: { userId: true, lastWorkingDay: true },
        }),
      ]);

    const holidayDateKeys = new Set<string>(
      (holidayRows as any[]).flatMap((r) =>
        (Array.isArray(r.holidays) ? r.holidays : []).map(
          (h: { date: string }) => h.date,
        ),
      ),
    );
    const exitBy = new Map<string, Date>(
      (exits as any[]).map((e) => [e.userId, new Date(e.lastWorkingDay)]),
    );
    const balanceBy = new Map<string, unknown>(
      (balances as any[]).map((b) => [b.userId, b.balances]),
    );

    const runSummary: PayrollRunSummary = {
      period,
      employees: items.length,
      employeesWithApprovedPaidLeave: 0,
      employeesAffected: 0,
      paidDaysDifference: 0,
    };

    for (const item of items as Array<{
      userId: string;
      grossSalary: number;
    }>) {
      const joined = joiningDates.get(item.userId) ?? null;
      const left = exitBy.get(item.userId) ?? null;
      const base = {
        year,
        month,
        workingDays,
        holidayDateKeys,
        policies,
        attendance: (attendance as any[]).filter(
          (a) => a.userId === item.userId,
        ),
        ledgerUsedPL: ledgerUsedPLFor(balanceBy.get(item.userId), year, month),
        startDay:
          joined && inMonth(joined, year, month) ? joined.getUTCDate() : 1,
        endDay:
          left && inMonth(left, year, month) ? left.getUTCDate() : totalDays,
      };
      const ownLeaves = (leaves as any[]).filter(
        (l) => l.userId === item.userId,
      );
      if (ownLeaves.some((l) => isPaidLeaveType(l.leaveType, policies))) {
        runSummary.employeesWithApprovedPaidLeave++;
      }

      const asRun = computeMonthlyPaidDays(base).paidDays;
      const corrected = computeMonthlyPaidDays({
        ...base,
        leaves: ownLeaves,
      }).paidDays;
      const difference = corrected - asRun;
      if (difference <= 0) continue;

      runSummary.employeesAffected++;
      runSummary.paidDaysDifference += difference;
      affected.add(item.userId);

      let estimate: number | null = null;
      if (asRun > 0) {
        estimate = Math.round((item.grossSalary / asRun) * difference);
        summary.estimatedGrossUnderpayment += estimate;
      } else {
        summary.unableToEstimate++;
      }
      rows.push({
        tenantLabel,
        period,
        employee: anonymise(item.userId),
        paidDaysAsRun: asRun,
        paidDaysCorrected: corrected,
        estimatedGrossUnderpayment: estimate,
      });
    }
    summary.runs.push(runSummary);
  }
  summary.employeesAffected = affected.size;
  return { summary, rows };
}

export function createAnonymiser(): (userId: string) => string {
  const key = randomBytes(32);
  return (userId) =>
    `emp_${createHmac("sha256", key).update(userId).digest("hex").slice(0, 10)}`;
}
