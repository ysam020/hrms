import dayjs from "dayjs";
import { useContext, useMemo, useState } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Card,
  DataTable,
  DateTile,
  PeriodStepper,
  PrimaryCell,
  Section,
  StatTile,
  StatTiles,
  Status,
  toneForStatus,
  type Column,
  type Tone,
} from "@next/ui";
import a from "../attendance.module.css";
import { useGet } from "@next/lib/hooks";
import { fmtTime } from "@next/lib/format";

// ── My month ────────────────────────────────────────────────────────────────

/** "half_day" / "half Day" / "Half Day" → "Half Day". */
const attendanceLabel = (status?: string | null) =>
  status
    ? status
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

const STRIP_LEGEND: { tone: Tone; label: string }[] = [
  { tone: "success", label: "Present" },
  { tone: "warning", label: "Late or half day" },
  { tone: "accent", label: "Leave or holiday" },
  { tone: "danger", label: "Absent" },
  { tone: "neutral", label: "No record" },
];

/**
 * The month at a glance: one cell per day, filled by its status tone. The
 * table below carries the same data as text, so the strip is decorative for
 * assistive tech beyond its one-line summary.
 */
function MonthStrip({
  month,
  byDay,
}: {
  month: dayjs.Dayjs;
  byDay: Map<number, string>;
}) {
  const today = dayjs();
  const days = month.daysInMonth();
  const lead = month.startOf("month").day(); // 0 = Sunday
  const counts = new Map<string, number>();
  for (const st of byDay.values()) counts.set(st, (counts.get(st) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([st, n]) => `${n} ${st}`)
    .join(", ");
  return (
    <div className={a.stripWrap}>
      <div
        className={a.strip}
        role="img"
        aria-label={`${month.format("MMMM")}: ${summary || "no records yet"}`}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`h${i}`} className={a.stripHead} aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const date = month.date(day);
          const status = byDay.get(day);
          const future = date.isAfter(today, "day");
          return (
            <span
              key={day}
              className={a.stripDay}
              data-tone={status ? toneForStatus(status) : undefined}
              data-future={future || undefined}
              data-today={date.isSame(today, "day") || undefined}
              title={`${date.format("ddd D MMM")}${status ? ` · ${status}` : ""}`}
              aria-hidden
            >
              {day}
            </span>
          );
        })}
      </div>
      <ul className={a.legend} aria-hidden>
        {STRIP_LEGEND.map((l) => (
          <li key={l.label}>
            <i data-tone={l.tone} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyMonth() {
  const { user } = useContext(UserContext);
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const y = month.year();
  const m = month.month() + 1;
  const records = useGet<any[]>(API_ENDPOINTS.GET_EMPLOYEE_ATTENDANCE(y, m));
  const summary = useGet<any>(
    user?.id ? API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(user.id, y, m) : null,
  );
  const rows = useMemo(
    () =>
      (Array.isArray(records.data) ? records.data : [])
        .slice()
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()),
    [records.data],
  );
  const sm = summary.data || {};
  const tIn = (r: any) => r.checkIn ?? r.timeIn;
  const tOut = (r: any) => r.checkOut ?? r.timeOut;
  const statusOf = (r: any) =>
    r.status ? attendanceLabel(r.status) : tIn(r) ? "Present" : "";
  const byDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      const st = statusOf(r);
      if (st) map.set(dayjs(r.date).date(), st);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const isThisMonth = month.isSame(dayjs(), "month");
  const maxCorr = Number(sm.maxCorrectionsPerMonth) || 0;
  const leftCorr = sm.remainingCorrections;

  const columns: Column<any>[] = [
    {
      key: "date",
      header: "Date",
      priority: "primary",
      render: (r) => (
        <PrimaryCell
          leading={
            <DateTile
              date={r.date}
              size="small"
              tone={toneForStatus(statusOf(r))}
              muted={!statusOf(r)}
            />
          }
          title={dayjs(r.date).format("dddd")}
        />
      ),
    },
    {
      key: "in",
      header: "In",
      priority: "secondary",
      stackLabel: "In",
      render: (r) => (
        <span className="px-num">{tIn(r) ? fmtTime(tIn(r)) : "—"}</span>
      ),
    },
    {
      key: "out",
      header: "Out",
      priority: "secondary",
      stackLabel: "Out",
      render: (r) => (
        <span className="px-num">{tOut(r) ? fmtTime(tOut(r)) : "—"}</span>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      priority: "secondary",
      stackLabel: "Hours",
      render: (r) => {
        if (!tIn(r) || !tOut(r)) return <span className="px-tertiary">—</span>;
        const mins = dayjs(tOut(r)).diff(dayjs(tIn(r)), "minute");
        return (
          <span className="px-num">
            {`${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (r) => <Status value={statusOf(r) || null} />,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <PeriodStepper
        label={month.format("MMMM YYYY")}
        previousLabel="Previous month"
        nextLabel="Next month"
        onPrevious={() => setMonth((d) => d.subtract(1, "month"))}
        onNext={() => setMonth((d) => d.add(1, "month"))}
        nextDisabled={isThisMonth}
        onReset={
          isThisMonth ? undefined : () => setMonth(dayjs().startOf("month"))
        }
        resetLabel="This Month"
      />
      <div data-tour="attendance-summary">
        <StatTiles label="Month summary">
          <StatTile
            label="Present"
            icon="checkCircle"
            tone="success"
            value={sm.presents ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Half Days"
            icon="halfDay"
            tone="warning"
            value={sm.halfDays ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Paid Leave"
            icon="leave"
            tone="accent"
            value={sm.paidLeaves ?? "—"}
            loading={summary.loading}
          />
          <StatTile
            label="Unpaid Leave"
            icon="calendar"
            tone={Number(sm.unpaidLeaves) > 0 ? "danger" : "neutral"}
            value={sm.unpaidLeaves ?? "—"}
            note="Loss of pay"
            loading={summary.loading}
          />
          <StatTile
            label="Corrections Left"
            icon="edit"
            tone={
              leftCorr == null
                ? "neutral"
                : Number(leftCorr) === 0
                  ? "danger"
                  : "neutral"
            }
            value={leftCorr ?? "—"}
            note={maxCorr ? `of ${maxCorr} this month` : undefined}
            progress={
              maxCorr && leftCorr != null
                ? Number(leftCorr) / maxCorr
                : undefined
            }
            loading={summary.loading}
          />
        </StatTiles>
      </div>
      {rows.length > 0 && (
        <Section
          title="At a Glance"
          detail={month.format("MMMM YYYY")}
          headingLevel={2}
        >
          <Card style={{ justifySelf: "start", maxWidth: "100%" }}>
            <MonthStrip month={month} byDay={byDay} />
          </Card>
        </Section>
      )}
      <Section title="Daily Record" detail={`${rows.length} days recorded`}>
        <DataTable
          label={`Attendance for ${month.format("MMMM YYYY")}`}
          tour="attendance-daily"
          columns={columns}
          rows={rows}
          rowId={(r) => String(r._id || r.id || r.date)}
          loading={records.loading}
          error={records.error}
          onRetry={records.refetch}
          stickyOffset={52}
          empty={{
            icon: "clock",
            title: isThisMonth
              ? "No attendance recorded yet"
              : `No attendance for ${month.format("MMMM")}`,
            body: isThisMonth
              ? "Punch in from Today to start this month’s record."
              : "Nothing was recorded for you this month.",
          }}
        />
      </Section>
    </div>
  );
}
