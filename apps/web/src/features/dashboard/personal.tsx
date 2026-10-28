import dayjs from "dayjs";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useAttendanceData } from "@web/shared/hooks/useAttendanceData";
import { TransitionLink } from "@next/motion";
import { Button, EmptyState, Icon, Skeleton, type IconName } from "@next/ui";
import { apiClient, isCanceled } from "@next/lib/api";
import { fmtDateShort, fmtTime, plural } from "@next/lib/format";
import { usePunch } from "./usePunch";
import s from "./Today.module.css";

// The personal widgets — Your Day, Announcements and Coming Up — read the
// signed-in person's own data from the same self-scoped endpoints the rest of
// the app uses. (The old DashboardProvider also fetched organisation-wide
// insights for everyone; those now come, permission-checked, from
// /dashboard/data.)

export interface PersonalData {
  attendances: any[];
  summary: any;
  holidays: any[];
  events: any[];
  people: any[];
  announcements: any[];
}

type Part = "day" | "agenda" | "announcements";

/** Fetches only what the visible personal widgets need, once each. */
export function usePersonalData(user: { id?: string } | null, parts: Part[]) {
  const [data, setData] = useState<PersonalData>({
    attendances: [],
    summary: null,
    holidays: [],
    events: [],
    people: [],
    announcements: [],
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<Set<keyof PersonalData>>(new Set());
  const key = [...parts].sort().join(",");

  const load = useCallback(() => {
    if (!user?.id) return;
    const ctrl = new AbortController();
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const want = new Set(parts);
    const jobs: [keyof PersonalData, string, (d: any) => any][] = [];
    if (want.has("day")) {
      jobs.push([
        "attendances",
        API_ENDPOINTS.GET_EMPLOYEE_ATTENDANCE(y, m),
        (d) => d.data,
      ]);
      jobs.push([
        "summary",
        API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(user.id, y, m),
        (d) => d.data,
      ]);
    }
    if (want.has("day") || want.has("agenda"))
      jobs.push(["holidays", API_ENDPOINTS.GET_HOLIDAYS(y), (d) => d.data]);
    if (want.has("agenda")) {
      jobs.push(["events", API_ENDPOINTS.GET_CALENDAR_EVENTS, (d) => d.data]);
      jobs.push([
        "people",
        API_ENDPOINTS.GET_BIRTHDAYS_ANNIVERSARIES(m, y),
        (d) => d.data,
      ]);
    }
    if (want.has("announcements"))
      jobs.push([
        "announcements",
        API_ENDPOINTS.GET_HR_ACTIVITIES(),
        (d) => d.data?.activities ?? [],
      ]);

    setLoading(true);
    void Promise.allSettled(
      jobs.map(([, url]) => apiClient.get(url, { signal: ctrl.signal })),
    ).then((results) => {
      if (ctrl.signal.aborted) return;
      const next: Partial<PersonalData> = {};
      const bad = new Set<keyof PersonalData>();
      results.forEach((r, i) => {
        const [field, , pick] = jobs[i];
        if (r.status === "fulfilled") next[field] = pick(r.value.data) ?? null;
        else if (!isCanceled(r.reason)) bad.add(field);
      });
      setData((prev) => ({ ...prev, ...next }));
      setFailed(bad);
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [user?.id, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => load(), [load]);

  return { data, loading, failed, refetch: load };
}

// ── Your day ────────────────────────────────────────────────────────────────

const recIn = (r: any) => r?.checkIn ?? r?.timeIn;
const recOut = (r: any) => r?.checkOut ?? r?.timeOut;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const hm = (mins: number) =>
  `${Math.floor(mins / 60)}h ${String(Math.max(0, mins % 60)).padStart(2, "0")}m`;

export function YourDay({
  data,
  loading,
  refresh,
}: {
  data: PersonalData;
  loading: boolean;
  refresh: () => void;
}) {
  const punch = usePunch(refresh);
  const now = useNow();
  const records = data.attendances;
  const today = (records || []).find((r) =>
    dayjs(r.date).isSame(dayjs(), "day"),
  );
  const inAt = recIn(today);
  const outAt = recOut(today);
  const worked = inAt
    ? Math.max(0, dayjs(outAt || now).diff(dayjs(inAt), "minute"))
    : 0;
  const state = !inAt ? "out" : outAt ? "done" : "in";

  return (
    <div className={s.day}>
      <div className={s.punchRow}>
        <div className={s.clock}>
          <span className={s.clockState}>
            {state === "in" && <span className={s.liveDot} aria-hidden />}
            {loading
              ? "Checking…"
              : state === "in"
                ? "Working"
                : state === "done"
                  ? "Done for Today"
                  : "Not Punched In"}
          </span>
          <span className={s.clockValue}>
            {loading ? (
              <Skeleton width={140} height={36} />
            ) : state === "out" ? (
              dayjs(now).format("h:mm A")
            ) : (
              hm(worked)
            )}
          </span>
          <span className={s.clockNote}>
            {state === "out"
              ? "Punch in when you start work."
              : state === "in"
                ? `Since ${fmtTime(inAt)}`
                : `${fmtTime(inAt)} – ${fmtTime(outAt)}`}
          </span>
        </div>
        <div className={s.punchActions}>
          {state !== "done" && (
            <Button
              variant="primary"
              size="large"
              icon={state === "out" ? "clock" : "logout"}
              busy={punch.busy}
              disabled={loading}
              onClick={() =>
                punch.start(state === "out" ? "timeIn" : "timeOut")
              }
            >
              {state === "out" ? "Punch In" : "Punch Out"}
            </Button>
          )}
          {punch.preparingNotice}
        </div>
      </div>
      <MonthRibbon records={records} holidays={data.holidays} />
      <Legend summary={data.summary} />
      {punch.dialogs}
    </div>
  );
}

type Kind =
  | "present"
  | "partial"
  | "leave"
  | "holiday"
  | "weekoff"
  | "absent"
  | "future";

function MonthRibbon({
  records,
  holidays,
}: {
  records: any[];
  holidays: any[];
}) {
  const today = dayjs();
  const n = today.daysInMonth();
  const days = useMemo(() => {
    const holidaySet = new Set(
      (holidays || []).map((h: any) => dayjs(h.date).format("YYYY-MM-DD")),
    );
    return Array.from({ length: n }, (_, i) => {
      const d = today.date(i + 1);
      const key = d.format("YYYY-MM-DD");
      const r = (records || []).find(
        (x) => (x.date || "").startsWith(key) || dayjs(x.date).isSame(d, "day"),
      );
      const st = (r?.status || "").toLowerCase();
      let kind: Kind;
      if (d.isAfter(today, "day"))
        kind = holidaySet.has(key) ? "holiday" : "future";
      else if (st === "leave") kind = "leave";
      else if (st === "holiday" || holidaySet.has(key)) kind = "holiday";
      else if (st === "week-off") kind = "weekoff";
      else if (
        st === "half-day" ||
        (recIn(r) && !recOut(r) && !d.isSame(today, "day"))
      )
        kind = "partial";
      else if (recIn(r) || st === "present") kind = "present";
      else kind = "absent";
      return { d, kind, today: d.isSame(today, "day") };
    });
  }, [records, holidays, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (k: Kind) =>
    ({
      present: "Present",
      partial: "Partial day",
      leave: "On leave",
      holiday: "Holiday",
      weekoff: "Week off",
      absent: "No record",
      future: "Upcoming",
    })[k];

  return (
    <figure style={{ display: "grid", gap: 6 }}>
      <figcaption className="px-sr-only">
        Your attendance for {today.format("MMMM YYYY")}, one mark per day
      </figcaption>
      <div
        className={s.ribbon}
        style={{ "--_days": n } as CSSProperties}
        role="list"
      >
        {days.map(({ d, kind, today: isToday }) => (
          <span
            key={d.date()}
            role="listitem"
            className={s.mark}
            data-kind={kind}
            data-today={isToday || undefined}
            title={`${d.format("ddd D MMM")} · ${label(kind)}`}
            aria-label={`${d.format("D MMMM")}: ${label(kind)}${isToday ? ", today" : ""}`}
          />
        ))}
      </div>
      <div className={s.ribbonAxis} aria-hidden>
        <span>1 {today.format("MMM")}</span>
        <span>{today.format("D MMM")} · Today</span>
        <span>
          {n} {today.format("MMM")}
        </span>
      </div>
    </figure>
  );
}

function Legend({ summary }: { summary: any }) {
  const items: [string, string, number | undefined][] = [
    ["Present", "var(--px-accent)", summary?.presents],
    [
      "Leave",
      "var(--px-danger)",
      (summary?.paidLeaves ?? 0) + (summary?.unpaidLeaves ?? 0) ||
        summary?.paidLeaves,
    ],
    ["Holidays", "var(--px-warning)", summary?.holidays],
    ["Week Offs", "var(--px-neutral-soft)", summary?.weekOffs],
  ];
  return (
    <div className={s.legend}>
      {items.map(([l, c, v]) => (
        <span key={l}>
          <i style={{ background: c }} />
          {l}
          {v != null && <b>{v}</b>}
        </span>
      ))}
      {summary?.remainingCorrections != null && (
        <TransitionLink
          to="/attendance/attendance-correction"
          style={{ marginLeft: "auto" }}
        >
          {plural(summary.remainingCorrections, "correction")} left this month
        </TransitionLink>
      )}
    </div>
  );
}

// ── Announcements ───────────────────────────────────────────────────────────

const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  return doc.body.textContent || "";
};

export function Announcements({ items }: { items: any[] }) {
  const list = (items || []).slice(0, 3);
  if (list.length === 0)
    return (
      <p className="px-tertiary px-callout">No announcements right now.</p>
    );
  return (
    <div className={s.news}>
      {list.map((a: any) => (
        <article key={a._id || a.id || a.title} className={s.newsItem}>
          <span className="px-meta">{fmtDateShort(a.date || a.createdAt)}</span>
          <h3 className={s.newsTitle}>{a.title}</h3>
          {a.description && (
            <p className={s.newsBody}>{stripHtml(a.description)}</p>
          )}
        </article>
      ))}
    </div>
  );
}

// ── Coming up ───────────────────────────────────────────────────────────────

type AgendaEntry = {
  date: dayjs.Dayjs;
  title: string;
  meta?: string;
  icon: IconName;
  tone: string;
};

export function Agenda({ data }: { data: PersonalData }) {
  const { events, holidays, people } = data;
  const groups = useMemo(() => {
    const start = dayjs().startOf("day");
    const horizon = start.add(30, "day");
    const entries: AgendaEntry[] = [];
    for (const h of holidays || [])
      entries.push({
        date: dayjs(h.date),
        title: h.name || h.title,
        meta: "Holiday",
        icon: "flag",
        tone: "warning",
      });
    for (const e of events || [])
      entries.push({
        date: dayjs(e.date),
        title: e.title,
        meta: e.startTime ? `Event · ${e.startTime}` : "Event",
        icon: "calendar",
        tone: "accent",
      });
    for (const p of Array.isArray(people) ? people : []) {
      const d = dayjs().date(p.day);
      const anniv = p.type === "anniversary";
      entries.push({
        date: d,
        title: p.name,
        meta: anniv ? `${plural(p.years ?? 1, "year")} at work` : "Birthday",
        icon: anniv ? "sparkle" : "cake",
        tone: anniv ? "success" : "danger",
      });
    }
    const upcoming = entries
      .filter((e) => !e.date.isBefore(start, "day") && e.date.isBefore(horizon))
      .sort((a, b) => a.date.valueOf() - b.date.valueOf())
      .slice(0, 10);
    const map = new Map<string, AgendaEntry[]>();
    for (const e of upcoming) {
      const k = e.date.format("YYYY-MM-DD");
      map.set(k, [...(map.get(k) || []), e]);
    }
    return Array.from(map.entries());
  }, [events, holidays, people]);

  const dayLabel = (k: string) => {
    const d = dayjs(k);
    if (d.isSame(dayjs(), "day")) return "Today";
    if (d.isSame(dayjs().add(1, "day"), "day")) return "Tomorrow";
    return d.format("ddd D MMM");
  };

  if (groups.length === 0)
    return (
      <EmptyState icon="calendar" title="A quiet month">
        No holidays, events, or celebrations in the next 30 days.
      </EmptyState>
    );
  return (
    <div>
      {groups.map(([k, items]) => (
        <div key={k} className={s.agendaDay}>
          <p
            className={s.agendaDate}
            data-today={dayLabel(k) === "Today" || undefined}
          >
            {dayLabel(k)}
          </p>
          {items.map((e, i) => (
            <div key={i} className={s.agendaItem}>
              <span
                className={s.agendaIcon}
                style={{
                  background: `var(--px-${e.tone}-soft)`,
                  color: `var(--px-${e.tone})`,
                }}
              >
                <Icon name={e.icon} />
              </span>
              <span className={s.agendaText}>
                <span className={s.agendaTitle}>{e.title}</span>
                {e.meta && <span className={s.agendaMeta}>{e.meta}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
