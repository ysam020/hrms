// Tenant-local calendar arithmetic, using only Intl (no tz database of our
// own). Every organisation has one IANA time zone (Tenant.timeZone); reminders,
// deadlines and "today" are computed in it rather than in the process's TZ,
// which happens to be Asia/Kolkata in every container (docker/base.Dockerfile)
// and must not be relied on.

/** Used when a tenant has no time zone stored (every tenant created before the field existed). */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/**
 * True for an IANA zone name such as "Asia/Kolkata", "Europe/London" or
 * "UTC". Abbreviations Intl happens to accept ("IST", "EST") are refused:
 * they are ambiguous (IST is India, Israel and Ireland) and not stable.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  if (tz !== "UTC" && !/^[A-Za-z]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(tz)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The tenant's stored zone if valid, else DEFAULT_TIME_ZONE. Never throws. */
export function resolveTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday, matching workWeekPattern.workingDays. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Wall-clock fields of `instant` as seen in `tz`. */
export function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(tz).formatToParts(instant))
    parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar date of `instant` in `tz`, as "YYYY-MM-DD" (the format Holiday.holidays[].date uses). */
export function zonedDateKey(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Offset of `tz` from UTC at `instant`, in minutes (IST → +330). */
export function timeZoneOffsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round(
    (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000,
  );
}

/**
 * The instant at which the wall clock in `tz` reads `dateKey` `hour:minute`.
 * Hours/minutes may overflow (e.g. hour 25 = 01:00 next day), which is how
 * "shift start + 9h + 60min" is expressed. In a DST gap the result lands on
 * the first valid instant after it; in an overlap, the earlier one.
 */
export function zonedTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hour, minute, 0);
  // The answer is wall − offset, with the offset taken at the answer itself.
  // Offsets change at most once near any wall time, so the two offsets in
  // play are the one at the naive guess and the one on the other side of
  // the change; try both.
  const offsetAt = (t: number) =>
    timeZoneOffsetMinutes(new Date(t), tz) * 60000;
  const first = wallAsUtc - offsetAt(wallAsUtc);
  const second = wallAsUtc - offsetAt(first);
  const reads = (t: number) => t + offsetAt(t) === wallAsUtc;
  const exact = [first, second].filter(reads);
  // Overlap (clocks go back): both read correctly — take the earlier.
  // Gap (clocks go forward): neither does — take the later, which is the
  // same distance past the gap as the wall time was into it.
  return new Date(
    exact.length > 0 ? Math.min(...exact) : Math.max(first, second),
  );
}

/** Start of the calendar day `dateKey` in `tz`, as an instant. */
export function zonedStartOfDay(dateKey: string, tz: string): Date {
  return zonedTimeToUtc(dateKey, 0, 0, tz);
}

/** `dateKey` shifted by `days` calendar days (pure date arithmetic, zone-free). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Day of week (0 = Sunday) of a "YYYY-MM-DD" calendar date. */
export function weekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
