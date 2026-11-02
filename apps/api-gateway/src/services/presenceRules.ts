import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Pure rules for employee availability (docs/presence.md). Three separate
// things are modelled, and none implies another:
//
//   availability  what the person chose for colleagues (busy, lunch…), durable
//   connectivity  whether a session is open right now: online | idle | offline
//   work mode     office | remote | field, from attendance mode and approved WFH
//
// Nothing here touches the database, Redis or the clock — callers pass `now`.

export const AVAILABILITIES = [
  "available",
  "busy",
  "dnd",
  "meeting",
  "break",
  "lunch",
  "focusing",
  "away",
] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const DURATIONS = [
  "30m",
  "1h",
  "2h",
  "end_of_day",
  "until_changed",
] as const;
export type Duration = (typeof DURATIONS)[number];

export type Connectivity = "online" | "idle" | "offline";
/** What an indicator shows: the availability, or offline. */
export type DisplayStatus = Availability | "offline";
export const DISPLAY_STATUSES: readonly DisplayStatus[] = [
  ...AVAILABILITIES,
  "offline",
];
export type WorkMode = "office" | "remote" | "field";

export const MESSAGE_MAX = 140;

export const isAvailability = (v: unknown): v is Availability =>
  typeof v === "string" && (AVAILABILITIES as readonly string[]).includes(v);

/** The stored row, as far as these rules care. */
export interface StoredStatus {
  availability: string;
  source: string;
  message: string | null;
  expiresAt: Date | null;
  previousAvailability: string | null;
  previousMessage: string | null;
  revision: number;
  changedAt: Date | null;
}

export interface Choice {
  availability: Availability;
  message: string | null;
}

/** A row as it reads at a given instant, with timed statuses already ended. */
export interface EffectiveStatus extends Choice {
  source: "manual" | "default";
  expiresAt: Date | null;
  /** The untimed status a timed one returns to (null = Available). */
  previous: Choice | null;
  revision: number;
  changedAt: Date | null;
}

const DEFAULT: Choice = { availability: "available", message: null };

function previousOf(row: StoredStatus): Choice | null {
  return isAvailability(row.previousAvailability)
    ? {
        availability: row.previousAvailability,
        message: row.previousMessage ?? null,
      }
    : null;
}

const isDefault = (c: Choice) =>
  c.availability === "available" && c.message === null;

/**
 * The status at `now`. A timed status whose end has passed reads as the
 * status it returns to even before the expiry job has run, so a late job
 * never shows anyone a stale "In a Meeting".
 */
export function effectiveStatus(
  row: StoredStatus | null,
  now: Date,
): EffectiveStatus {
  if (!row)
    return {
      ...DEFAULT,
      source: "default",
      expiresAt: null,
      previous: null,
      revision: 0,
      changedAt: null,
    };
  const previous = previousOf(row);
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    const back = previous ?? DEFAULT;
    return {
      ...back,
      source: previous ? "manual" : "default",
      expiresAt: null,
      previous: null,
      revision: row.revision,
      changedAt: row.expiresAt,
    };
  }
  return {
    availability: isAvailability(row.availability)
      ? row.availability
      : "available",
    message: row.message ?? null,
    source: row.source === "default" ? "default" : "manual",
    expiresAt: row.expiresAt,
    previous,
    revision: row.revision,
    changedAt: row.changedAt,
  };
}

/** Plain text, one line, at most MESSAGE_MAX characters; blank → null. */
export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    // eslint-disable-next-line no-control-regex
    .replace(
      /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text ? Array.from(text).slice(0, MESSAGE_MAX).join("") : null;
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Workday {
  startHour: number;
  startMinute: number;
  /** Length of the working day in hours (TenantSettings.fullDayMinHours). */
  hours: number;
}

/**
 * The end of today's working day in the person's time zone. Once that has
 * passed (working late), it is the end of their calendar day instead, so a
 * status never silently runs into tomorrow morning.
 */
export function endOfWorkday(
  now: Date,
  timeZone: string,
  workday: Workday,
): Date {
  const local = dayjs(now).tz(timeZone);
  const end = local
    .startOf("day")
    .add(workday.startHour * 60 + workday.startMinute, "minute")
    .add(Math.round(workday.hours * 60), "minute");
  if (end.valueOf() > now.getTime()) return end.toDate();
  return local.endOf("day").toDate();
}

export function expiryFor(
  duration: Duration,
  now: Date,
  timeZone: string,
  workday: Workday,
): Date | null {
  const t = now.getTime();
  switch (duration) {
    case "30m":
      return new Date(t + 30 * 60_000);
    case "1h":
      return new Date(t + 60 * 60_000);
    case "2h":
      return new Date(t + 120 * 60_000);
    case "end_of_day":
      return endOfWorkday(now, timeZone, workday);
    default:
      return null;
  }
}

/** The fields a write stores, apart from bookkeeping (revision, changedAt). */
export interface NextStatus {
  availability: Availability;
  source: "manual" | "default";
  message: string | null;
  expiresAt: Date | null;
  previous: Choice | null;
}

/**
 * A new choice on top of the current status. A timed choice remembers the
 * untimed status underneath it (so "Lunch for 1 hour" over "Do Not Disturb"
 * returns to Do Not Disturb), and keeps remembering the same one when it
 * replaces another timed choice.
 */
export function applyChoice(
  current: EffectiveStatus,
  next: Choice,
  expiresAt: Date | null,
): NextStatus {
  const underneath: Choice | null = current.expiresAt
    ? current.previous
    : current.source === "manual" && !isDefault(current)
      ? { availability: current.availability, message: current.message }
      : null;
  const previous =
    underneath &&
    !(
      underneath.availability === next.availability &&
      underneath.message === next.message
    )
      ? underneath
      : null;
  return {
    availability: next.availability,
    source: "manual",
    message: next.message,
    expiresAt,
    previous,
  };
}

/** "Back to previous": the remembered status, else Available. */
export function restorePrevious(current: EffectiveStatus): NextStatus {
  const back = current.previous;
  return back
    ? {
        availability: back.availability,
        source: "manual",
        message: back.message,
        expiresAt: null,
        previous: null,
      }
    : {
        ...DEFAULT,
        source: "default",
        expiresAt: null,
        previous: null,
      };
}

/** The message alone changes; the status and its end time stay. */
export function withMessage(
  current: EffectiveStatus,
  message: string | null,
): NextStatus {
  return {
    availability: current.availability,
    source:
      current.source === "default" && message === null ? "default" : "manual",
    message,
    expiresAt: current.expiresAt,
    previous: current.previous,
  };
}

/**
 * What an indicator shows. Offline wins (nobody is there to answer); an idle
 * session only changes a plain Available to Away. Every other choice is the
 * person's own and stays as they set it — Busy while idle is still Busy.
 */
export function displayStatus(
  availability: Availability,
  connectivity: Connectivity,
): DisplayStatus {
  if (connectivity === "offline") return "offline";
  if (connectivity === "idle" && availability === "available") return "away";
  return availability;
}

/** Rank for "who can I reach" ordering — reachable people first. */
export function displayRank(status: DisplayStatus): number {
  return DISPLAY_STATUSES.indexOf(status);
}

/**
 * Connectivity from a person's connection entries ("active|<ms>" or
 * "idle|<ms>", one per open tab or device). Entries older than `staleMs`
 * are ignored: a crashed process can't leave someone online forever.
 */
export function aggregateConnectivity(
  entries: string[],
  now: number,
  staleMs: number,
): Connectivity {
  let idle = false;
  for (const e of entries) {
    const [state, at] = e.split("|");
    if (now - Number(at) > staleMs) continue;
    if (state === "active") return "online";
    if (state === "idle") idle = true;
  }
  return idle ? "idle" : "offline";
}

export function workModeFor(
  attendanceMode: string | null | undefined,
  approvedWfhToday: boolean,
): WorkMode {
  if (approvedWfhToday || attendanceMode === "remote") return "remote";
  if (attendanceMode === "field") return "field";
  return "office";
}
