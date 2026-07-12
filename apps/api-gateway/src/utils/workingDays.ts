import { prismaWithTenant as prisma } from "@hrms/db";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/** Working days of the week (0=Sun..6=Sat) from the tenant's active work-week pattern. */
export function getWorkingDays(
  settings: { workWeekPattern?: unknown } | null,
): number[] {
  const pattern = settings?.workWeekPattern as
    | { workingDays?: number[] }
    | null
    | undefined;
  return pattern?.workingDays ?? [1, 2, 3, 4, 5];
}

/** True if `date` (UTC midnight) falls on a tenant-declared holiday. */
export async function isHoliday(date: Date): Promise<boolean> {
  const d = dayjs.utc(date);
  const record = await (prisma as any).holiday.findFirst({
    where: { year: d.year(), month: d.month() + 1 },
  });
  const list = Array.isArray(record?.holidays) ? record.holidays : [];
  const dateStr = d.format("YYYY-MM-DD");
  return list.some((h: any) => h?.date === dateStr);
}

/** Every UTC-midnight date from `start` to `end` inclusive. */
export function eachDate(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let d = dayjs.utc(start);
  const last = dayjs.utc(end);
  while (!d.isAfter(last)) {
    dates.push(d.toDate());
    d = d.add(1, "day");
  }
  return dates;
}
