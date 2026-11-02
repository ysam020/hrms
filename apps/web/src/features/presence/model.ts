import dayjs from "dayjs";
import { fmtTime, fromNow } from "@next/lib/format";

// Client half of employee availability (docs/presence.md). The server owns
// the rules; this file names and colours what it sends, and holds the live
// store that indicators read from.

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
export type DisplayStatus = Availability | "offline";
export type Connectivity = "online" | "idle" | "offline";
export type WorkMode = "office" | "remote" | "field";
export type Duration = "30m" | "1h" | "2h" | "end_of_day" | "until_changed";

export const MESSAGE_MAX = 140;

/** What colleagues receive (gateway services/presence.ts PresenceView). */
export interface PresenceView {
  userId: string;
  availability: Availability;
  status: DisplayStatus;
  connectivity: Connectivity;
  source: "manual" | "default";
  message: string | null;
  expiresAt: string | null;
  workMode: WorkMode | null;
  lastSeenAt: string | null;
  revision: number;
  at: number;
}

export interface OwnPresence extends PresenceView {
  previous: { availability: Availability; message: string | null } | null;
  timeZone: string | null;
}

/**
 * Each status has a label, a token colour and a glyph inside the dot, so the
 * indicator never relies on colour alone.
 */
export const STATUS: Record<
  DisplayStatus,
  {
    label: string;
    color: string;
    glyph: "check" | "minus" | "clock" | "ring" | "fill";
  }
> = {
  available: { label: "Available", color: "var(--px-success)", glyph: "check" },
  busy: { label: "Busy", color: "var(--px-danger)", glyph: "fill" },
  dnd: { label: "Do Not Disturb", color: "var(--px-danger)", glyph: "minus" },
  meeting: {
    label: "In a Meeting",
    color: "var(--px-series-7)",
    glyph: "fill",
  },
  break: { label: "On a Break", color: "var(--px-series-2)", glyph: "fill" },
  lunch: {
    label: "On Lunch Break",
    color: "var(--px-series-2)",
    glyph: "fill",
  },
  focusing: { label: "Focusing", color: "var(--px-accent)", glyph: "fill" },
  away: { label: "Away", color: "var(--px-series-4)", glyph: "clock" },
  offline: { label: "Offline", color: "var(--px-text-3)", glyph: "ring" },
};

export const DURATIONS: { value: Duration; label: string }[] = [
  { value: "until_changed", label: "Until I change it" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "2h", label: "2 hours" },
  { value: "end_of_day", label: "Until the end of the workday" },
];

export const WORK_MODE: Record<WorkMode, { label: string } | null> = {
  office: null, // the usual case — not worth a badge
  remote: { label: "Working Remotely" },
  field: { label: "In the Field" },
};

/** Same rule as the server's displayStatus. */
export function displayStatus(
  availability: Availability,
  connectivity: Connectivity,
): DisplayStatus {
  if (connectivity === "offline") return "offline";
  if (connectivity === "idle" && availability === "available") return "away";
  return availability;
}

/** "until 3:30 PM", or "until Tue 9:00 AM" when it's not today. */
export function untilLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const d = dayjs(expiresAt);
  return d.isSame(dayjs(), "day")
    ? `until ${fmtTime(d.toDate())}`
    : `until ${d.format("ddd h:mm A")}`;
}

/** One line for screen readers and tooltips: "Busy — On a call, until 3 PM". */
export function describe(v: PresenceView | null | undefined): string {
  if (!v) return "Status unknown";
  const parts = [STATUS[v.status].label];
  if (v.status === "offline" && v.availability !== "available")
    parts.push(`(set to ${STATUS[v.availability].label})`);
  const tail = [v.message, untilLabel(v.expiresAt)].filter(Boolean).join(", ");
  if (tail) parts.push(`— ${tail}`);
  if (v.status === "offline" && v.lastSeenAt)
    parts.push(`· last active ${fromNow(v.lastSeenAt)}`);
  return parts.join(" ");
}

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export const PRESENCE_API = {
  me: "/presence/me",
  restore: "/presence/me/restore",
  message: "/presence/me/message",
  batch: (ids: string[]) => `/presence?ids=${ids.join(",")}`,
};

// ── Live store ──────────────────────────────────────────────────────────────
// One entry per person, replaced only by something newer: a higher revision
// (they changed their status) or, at the same revision, a later snapshot (a
// connectivity change). Duplicate and out-of-order events are dropped.
// Indicators subscribe to a single person, so an update re-renders only the
// dots for that person.

const views = new Map<string, PresenceView>();
const listeners = new Set<() => void>();

export const presenceStore = {
  get: (userId: string) => views.get(userId),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** Returns whether the view was newer than what the store had. */
  merge(view: PresenceView): boolean {
    const cur = views.get(view.userId);
    if (
      cur &&
      (view.revision < cur.revision ||
        (view.revision === cur.revision && view.at <= cur.at))
    )
      return false;
    views.set(view.userId, view);
    listeners.forEach((l) => l());
    return true;
  },
  clear() {
    views.clear();
    listeners.forEach((l) => l());
  },
};
