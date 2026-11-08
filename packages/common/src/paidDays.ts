/**
 * The single definition of how many days of a month are paid. The payroll
 * run, the payslip and the attendance summary all call this, so they can't
 * disagree.
 *
 * paid days = credited attendance + implied holidays/weekly offs + paid
 * leave, capped at the days in the month. Each calendar date earns at most
 * one day, whatever mix of records exists for it.
 *
 * Rules:
 *  - A leave application counts while it is Approved or Cancellation
 *    Requested; a cancellation only takes effect once approved.
 *  - A leave type is paid unless it is LWP or a policy marks it isPaid:false.
 *  - Leave falling on a holiday or weekly off earns nothing extra: that day
 *    is already paid.
 *  - Leave credit is limited to the employee's employment window.
 *  - Paid leave is the larger of the applications and the legacy ledger's
 *    usedPL. The two can describe the same days, so they are never added.
 */

export interface PaidDaysLeave {
  from: Date | string;
  to: Date | string;
  leaveType: string;
  status: string;
  unit?: string | null;
  session?: string | null;
  shortLeaveHours?: number | null;
}

export interface PaidDaysAttendance {
  date: Date | string;
  status?: string | null;
}

export interface LeaveTypePolicy {
  key?: string;
  name?: string;
  isPaid?: boolean;
}

export interface PaidDaysInput {
  year: number;
  /** 1-indexed. */
  month: number;
  workingDays: number[];
  holidayDateKeys: Set<string>;
  attendance: PaidDaysAttendance[];
  leaves?: PaidDaysLeave[];
  ledgerUsedPL?: number;
  policies?: LeaveTypePolicy[];
  /** Inclusive 1-indexed employment window within the month. */
  startDay?: number;
  endDay?: number;
}

export interface PaidDaysBreakdown {
  totalMonthDays: number;
  present: number;
  late: number;
  halfDay: number;
  holiday: number;
  weekOff: number;
  wfh: number;
  absent: number;
  paidLeaves: number;
  unpaidLeaves: number;
  paidDays: number;
  lopDays: number;
}

export const LEAVE_STATUSES_IN_EFFECT = [
  "Approved",
  "Cancellation Requested",
] as const;

const UNPAID_NAMES = new Set([
  "lwp",
  "leave without pay",
  "loss of pay",
  "lop",
  "unpaid",
  "unpaid leave",
]);

export function isPaidLeaveType(
  leaveType: string,
  policies: LeaveTypePolicy[] = [],
): boolean {
  const type = (leaveType ?? "").trim().toLowerCase();
  const policy = policies.find(
    (p) => p.key?.toLowerCase() === type || p.name?.toLowerCase() === type,
  );
  if (typeof policy?.isPaid === "boolean") return policy.isPaid;
  return !UNPAID_NAMES.has(type);
}

const dateKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function classifyImpliedNonWorkingDays(
  year: number,
  month: number,
  totalMonthDays: number,
  workingDays: number[],
  holidayDateKeys: Set<string>,
  recordedDateKeys: Set<string>,
  startDay = 1,
  endDay = totalMonthDays,
): { impliedHolidays: number; impliedWeekOffs: number } {
  let impliedHolidays = 0;
  let impliedWeekOffs = 0;
  for (let day = startDay; day <= endDay; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const key = d.toISOString().slice(0, 10);
    if (recordedDateKeys.has(key)) continue;
    if (holidayDateKeys.has(key)) impliedHolidays++;
    else if (!workingDays.includes(d.getUTCDay())) impliedWeekOffs++;
  }
  return { impliedHolidays, impliedWeekOffs };
}

type Bucket = "present" | "late" | "halfDay" | "holiday" | "weekOff" | "wfh";

const ATTENDANCE_CREDIT: Record<string, { bucket: Bucket; credit: number }> = {
  present: { bucket: "present", credit: 1 },
  late: { bucket: "late", credit: 1 },
  "half day": { bucket: "halfDay", credit: 0.5 },
  holiday: { bucket: "holiday", credit: 1 },
  "week off": { bucket: "weekOff", credit: 1 },
  wfh: { bucket: "wfh", credit: 1 },
};

interface LeaveDay {
  full: boolean;
  sessions: Set<string>;
  shortHours: number;
}

function leaveDayCredit(day: LeaveDay): number {
  if (day.full) return 1;
  // A first-half and a second-half application together make one day; two
  // applications for the same half do not.
  const halves = day.sessions.size * 0.5;
  return Math.min(1, halves + Math.round((day.shortHours / 8) * 100) / 100);
}

function collectLeaveDays(
  input: PaidDaysInput,
  totalMonthDays: number,
  startDay: number,
  endDay: number,
  isPaid: boolean,
): Map<string, LeaveDay> {
  const days = new Map<string, LeaveDay>();
  const windowStart = Date.UTC(input.year, input.month - 1, startDay);
  const windowEnd = Date.UTC(
    input.year,
    input.month - 1,
    Math.min(endDay, totalMonthDays),
  );
  for (const leave of input.leaves ?? []) {
    if (!(LEAVE_STATUSES_IN_EFFECT as readonly string[]).includes(leave.status))
      continue;
    if (isPaidLeaveType(leave.leaveType, input.policies) !== isPaid) continue;
    const from = Date.parse(`${dateKey(leave.from)}T00:00:00Z`);
    const to = Date.parse(`${dateKey(leave.to)}T00:00:00Z`);
    for (
      let t = Math.max(from, windowStart);
      t <= Math.min(to, windowEnd);
      t += 86_400_000
    ) {
      const d = new Date(t);
      const key = d.toISOString().slice(0, 10);
      if (
        input.holidayDateKeys.has(key) ||
        !input.workingDays.includes(d.getUTCDay())
      ) {
        continue;
      }
      const entry = days.get(key) ?? {
        full: false,
        sessions: new Set<string>(),
        shortHours: 0,
      };
      if (leave.unit === "half_day") {
        entry.sessions.add(leave.session || "unspecified");
      } else if (leave.unit === "short_leave") {
        entry.shortHours += leave.shortLeaveHours ?? 0;
      } else {
        entry.full = true;
      }
      days.set(key, entry);
    }
  }
  return days;
}

export function computeMonthlyPaidDays(
  input: PaidDaysInput,
): PaidDaysBreakdown {
  const totalMonthDays = new Date(
    Date.UTC(input.year, input.month, 0),
  ).getUTCDate();
  const startDay = input.startDay ?? 1;
  const endDay = input.endDay ?? totalMonthDays;

  // One entry per date, keeping the record that earns the most, so a
  // duplicate attendance row can't pay a day twice.
  const byDate = new Map<string, { bucket?: Bucket; credit: number }>();
  let absent = 0;
  for (const r of input.attendance) {
    const key = dateKey(r.date);
    const status = (r.status ?? "").toLowerCase();
    const known = ATTENDANCE_CREDIT[status];
    const current = byDate.get(key);
    if (!current) {
      byDate.set(key, known ?? { credit: 0 });
      if (status === "absent") absent++;
    } else if (known && known.credit > current.credit) {
      byDate.set(key, known);
    }
  }

  const counts: Record<Bucket, number> = {
    present: 0,
    late: 0,
    halfDay: 0,
    holiday: 0,
    weekOff: 0,
    wfh: 0,
  };
  for (const { bucket } of byDate.values()) if (bucket) counts[bucket]++;

  const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
    input.year,
    input.month,
    totalMonthDays,
    input.workingDays,
    input.holidayDateKeys,
    new Set(byDate.keys()),
    startDay,
    endDay,
  );
  counts.holiday += impliedHolidays;
  counts.weekOff += impliedWeekOffs;

  let applicationCredit = 0;
  for (const [key, day] of collectLeaveDays(
    input,
    totalMonthDays,
    startDay,
    endDay,
    true,
  )) {
    const attended = byDate.get(key)?.credit ?? 0;
    applicationCredit += Math.min(leaveDayCredit(day), 1 - attended);
  }
  applicationCredit = Math.max(0, applicationCredit);

  let unpaidLeaves = 0;
  for (const day of collectLeaveDays(
    input,
    totalMonthDays,
    startDay,
    endDay,
    false,
  ).values()) {
    unpaidLeaves += leaveDayCredit(day);
  }

  const paidLeaves = Math.max(applicationCredit, input.ledgerUsedPL ?? 0);
  const paidDays = Math.min(
    counts.present +
      counts.late +
      counts.halfDay * 0.5 +
      counts.holiday +
      counts.weekOff +
      counts.wfh +
      paidLeaves,
    totalMonthDays,
  );

  return {
    totalMonthDays,
    ...counts,
    absent,
    paidLeaves,
    unpaidLeaves,
    paidDays,
    lopDays: totalMonthDays - paidDays,
  };
}

/** Finds usedPL for a month in the legacy array-shaped LeaveBalance ledger. */
export function ledgerUsedPLFor(
  balances: unknown,
  year: number,
  month: number,
): number {
  if (!Array.isArray(balances)) return 0;
  const entry = balances.find(
    (b: { year?: unknown; month?: unknown }) =>
      String(b?.year) === String(year) && String(b?.month) === String(month),
  ) as { usedPL?: number } | undefined;
  return entry?.usedPL ?? 0;
}
