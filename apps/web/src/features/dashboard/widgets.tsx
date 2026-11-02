import dayjs from "dayjs";
import type { ReactNode } from "react";
import { TransitionLink } from "@next/motion";
import {
  Avatar,
  BarList,
  Columns,
  DateTile,
  EmptyState,
  Icon,
  Meter,
  Metric,
  Metrics,
  SERIES,
  OTHER,
  StatusBadge,
  toneForStatus,
  type IconName,
  type Tone,
} from "@next/ui";
import {
  fmtDate,
  fmtDateShort,
  fmtMoney,
  fmtNumber,
  fmtTime,
  plural,
} from "@next/lib/format";
import d from "./dashboard.module.css";
import { useMarkWidgetSource } from "./widgetSource";

// Presenters for the server-computed widgets. Each receives exactly what its
// loader in api-gateway/src/handlers/dashboard.ts returns. Lists are short by
// design and end in a link to the screen that owns the full view.

/** Backend status words ("in_progress", "active") as badge text. */
const label = (s?: string | null) =>
  s ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—";

const range = (from: string, to: string) => {
  const a = dayjs(from);
  const b = dayjs(to);
  return a.isSame(b, "day")
    ? a.format("ddd D MMM")
    : `${a.format("D MMM")} – ${b.format(a.isSame(b, "month") ? "D" : "D MMM")}`;
};

/** A small tinted square with an icon, leading a list row. */
function RowIcon({ icon, tone = "accent" }: { icon: IconName; tone?: Tone }) {
  return (
    <span
      className={d.rowIcon}
      style={{
        background: `var(--px-${tone}-soft)`,
        color: `var(--px-${tone})`,
      }}
      aria-hidden
    >
      <Icon name={icon} size={15} />
    </span>
  );
}

function More({ to, children }: { to: string; children: ReactNode }) {
  const markSource = useMarkWidgetSource();
  return (
    <TransitionLink to={to} className={d.more} onClick={markSource}>
      {children}
    </TransitionLink>
  );
}

function DayNote({ type }: { type?: string }) {
  if (type === "holiday") return <p className={d.note}>Today is a holiday.</p>;
  if (type === "weekoff")
    return <p className={d.note}>Today isn’t a working day.</p>;
  return null;
}

/** In / WFH / on leave / not punched in yet — a meter plus the figures. */
function PresenceSplit({
  counts,
  working = true,
}: {
  counts: any;
  working?: boolean;
}) {
  const office = Math.max(0, counts.in - counts.wfh);
  return (
    <>
      <Metrics label="Today">
        <Metric
          label="In"
          icon="checkCircle"
          tone="success"
          value={fmtNumber(counts.in)}
          note={counts.wfh ? `${counts.wfh} remote` : undefined}
        />
        <Metric
          label="On Leave"
          icon="leave"
          tone="warning"
          value={fmtNumber(counts.leave)}
        />
        <Metric
          label="Not Punched In Yet"
          icon="clock"
          // Only a concern on a working day; on a week-off it's expected.
          tone={working && counts.notIn > 0 ? "danger" : "neutral"}
          value={fmtNumber(counts.notIn)}
        />
        <Metric
          label="Headcount"
          icon="people"
          tone="accent"
          value={fmtNumber(counts.total)}
        />
      </Metrics>
      {counts.total > 0 && (
        <Meter
          label="Where people are today"
          parts={[
            { label: "In the office", value: office, color: SERIES[0] },
            { label: "Remote", value: counts.wfh, color: SERIES[1] },
            { label: "On leave", value: counts.leave, color: SERIES[3] },
            { label: "Not punched in yet", value: counts.notIn, color: OTHER },
          ]}
        />
      )}
    </>
  );
}

// ── Team ────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in: "In",
  done: "Done for today",
  leave: "On leave",
  notIn: "Not punched in yet",
};
const STATUS_TONE: Record<
  string,
  "success" | "neutral" | "warning" | "accent"
> = {
  in: "success",
  done: "neutral",
  leave: "warning",
  notIn: "neutral",
};

export function TeamToday({ data, wide }: { data: any; wide: boolean }) {
  const members: any[] = data.members ?? [];
  if (members.length === 0)
    return (
      <EmptyState icon="people" title="No one on your team yet">
        Team members appear here once they’re added to a team you lead.
      </EmptyState>
    );
  // Leave and not-in first: those are the ones a lead acts on.
  const order = { leave: 0, notIn: 1, in: 2, done: 3 } as Record<
    string,
    number
  >;
  const sorted = [...members].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className={d.stack}>
      <DayNote type={data.dayType} />
      <PresenceSplit
        counts={data.counts}
        working={!data.dayType || data.dayType === "working"}
      />
      <ul className={d.people} data-columns={wide ? 2 : 1}>
        {sorted.slice(0, wide ? 12 : 6).map((m) => (
          <li key={m.id} className={d.person}>
            <Avatar name={m.name} size={28} />
            <span className={d.personText}>
              <span className={d.personName}>{m.name}</span>
              <span className={d.personMeta}>
                {m.status === "in" || m.status === "done"
                  ? `Since ${fmtTime(m.since)}${m.wfh ? " · Remote" : ""}`
                  : m.status === "leave"
                    ? m.leaveType || "Leave"
                    : m.wfh
                      ? "Remote today"
                      : m.designation || ""}
              </span>
            </span>
            <StatusBadge
              tone={STATUS_TONE[m.status]}
              plain={m.status === "notIn"}
            >
              {STATUS_LABEL[m.status]}
            </StatusBadge>
          </li>
        ))}
      </ul>
      {members.length > (wide ? 12 : 6) && (
        <More to="/organization-tree">All {members.length} team members</More>
      )}
    </div>
  );
}

export function TeamLeave({ data }: { data: any }) {
  const items: any[] = data.items ?? [];
  if (items.length === 0)
    return (
      <EmptyState icon="leave" title="Everyone’s around">
        No leave on your team in the next {data.days} days.
      </EmptyState>
    );
  return (
    <div className={d.stack}>
      <ul className={d.rows}>
        {items.slice(0, 6).map((l) => (
          <li key={l.id} className={d.row}>
            <DateTile date={l.from} tone="warning" size="small" />
            <span className={d.rowText}>
              <span className={d.rowTitle}>{l.name}</span>
              <span className={d.rowMeta}>
                {range(l.from, l.to)} · {l.leaveType}
                {l.unit === "half_day" ? " · Half day" : ""}
              </span>
            </span>
            {l.status !== "Approved" && (
              <StatusBadge tone={toneForStatus(l.status)}>
                {l.status}
              </StatusBadge>
            )}
          </li>
        ))}
      </ul>
      {items.some((l) => l.status === "Pending") && (
        <More to="/approvals">Review pending requests</More>
      )}
    </div>
  );
}

// ── Organisation ────────────────────────────────────────────────────────────

export function OrgToday({ data }: { data: any }) {
  return (
    <div className={d.stack}>
      <DayNote type={data.dayType} />
      <PresenceSplit
        counts={data.counts}
        working={!data.dayType || data.dayType === "working"}
      />
      <More to="/attendance/view-all-attendances">Attendance</More>
    </div>
  );
}

export function Workforce({ data }: { data: any }) {
  const depts: any[] = data.departments ?? [];
  const top = depts.slice(0, 5);
  const rest = depts.slice(5).reduce((a, x) => a + x.count, 0);
  return (
    <div className={d.stack}>
      <Metrics label="Workforce">
        <Metric
          label="Active Employees"
          icon="people"
          tone="accent"
          value={fmtNumber(data.active)}
        />
        <Metric
          label="Joined This Month"
          icon="trendUp"
          tone="success"
          value={fmtNumber(data.joinersThisMonth)}
        />
        <Metric
          label="Leaving This Month"
          icon="door"
          tone="warning"
          value={fmtNumber(data.leavingThisMonth)}
        />
      </Metrics>
      {top.length > 0 && (
        <Meter
          label="Active employees by department"
          parts={[
            ...top.map((x, i) => ({
              label: x.department,
              value: x.count,
              color: SERIES[i],
            })),
            ...(rest ? [{ label: "Other", value: rest, color: OTHER }] : []),
          ]}
        />
      )}
      <More to="/employee-management/employee-list">Directory</More>
    </div>
  );
}

function PeopleList({
  items,
  empty,
  tone,
}: {
  items: any[];
  empty: string;
  tone: Tone;
}) {
  if (items.length === 0) return <p className={d.note}>{empty}</p>;
  return (
    <ul className={d.rows}>
      {items.map((p) => (
        <li key={p.id} className={d.row}>
          <DateTile date={p.date} tone={tone} size="small" />
          <span className={d.rowText}>
            <span className={d.rowTitle}>{p.name}</span>
            <span className={d.rowMeta}>
              {[p.designation, p.department].filter(Boolean).join(" · ")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function JoinersLeavers({ data }: { data: any }) {
  return (
    <div className={d.columns2}>
      {data.joining && (
        <div className={d.stack}>
          <h3 className={d.subhead}>Joining</h3>
          <PeopleList
            items={data.joining}
            tone="success"
            empty="No one joins in the next 30 days."
          />
        </div>
      )}
      <div className={d.stack}>
        <h3 className={d.subhead}>Leaving</h3>
        <PeopleList
          items={data.leaving ?? []}
          tone="warning"
          empty="No one leaves in the next 30 days."
        />
        <More to="/resignation-process/view-resignations">Resignations</More>
      </div>
    </div>
  );
}

const QUEUE: {
  key: string;
  label: string;
  to: string;
  icon: IconName;
  tone: Tone;
}[] = [
  {
    key: "kyc",
    label: "KYC to review",
    to: "/kyc/view-employee-kycs",
    icon: "idcard",
    tone: "accent",
  },
  {
    key: "exits",
    label: "Resignations to decide",
    to: "/resignation-process/view-resignations",
    icon: "door",
    tone: "warning",
  },
  {
    key: "tickets",
    label: "Open helpdesk tickets",
    to: "/helpdesk",
    icon: "ticket",
    tone: "danger",
  },
  {
    key: "assetIssues",
    label: "Open asset issues",
    to: "/assets/issues",
    icon: "laptop",
    tone: "warning",
  },
  {
    key: "advances",
    label: "Salary advances to approve",
    to: "/payroll/salary-advances",
    icon: "banknote",
    tone: "success",
  },
  {
    key: "joins",
    label: "Requests to join",
    to: "/settings/join-requests",
    icon: "person",
    tone: "accent",
  },
];

export function HrQueue({ data }: { data: any }) {
  const lines = QUEUE.filter((q) => data[q.key] != null);
  const total = lines.reduce((a, q) => a + (data[q.key] || 0), 0);
  return (
    <div className={d.stack}>
      {total === 0 && <p className={d.note}>Nothing waiting. Nice.</p>}
      <ul className={d.queue}>
        {lines.map((q) => (
          <li key={q.key}>
            <TransitionLink
              to={q.to}
              className={d.queueRow}
              data-zero={!data[q.key] || undefined}
            >
              <span className={d.queueLabel}>
                <RowIcon
                  icon={q.icon}
                  tone={data[q.key] ? q.tone : "neutral"}
                />
                {q.label}
              </span>
              {q.key === "tickets" && data.breached > 0 && (
                <StatusBadge tone="danger">
                  {data.breached} past SLA
                </StatusBadge>
              )}
              <b>{fmtNumber(data[q.key])}</b>
            </TransitionLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HeadcountTrend({ data }: { data: any }) {
  const series: any[] = data.series ?? [];
  const exits = series.reduce((a, x) => a + x.exits, 0);
  const joined = series.reduce((a, x) => a + x.joined, 0);
  const first = series[0]?.headcount ?? 0;
  const last = series[series.length - 1]?.headcount ?? 0;
  return (
    <div className={d.stack}>
      <Metrics label="Headcount">
        <Metric
          label="Now"
          icon="people"
          tone="accent"
          value={fmtNumber(last)}
          note={
            first
              ? `${last - first >= 0 ? "+" : ""}${last - first} since ${dayjs(series[0].month).format("MMM")}`
              : undefined
          }
        />
        <Metric
          label="Joined"
          icon="trendUp"
          tone="success"
          value={fmtNumber(joined)}
          note={`Last ${data.months} months`}
        />
        <Metric
          label="Left"
          icon="door"
          tone="warning"
          value={fmtNumber(exits)}
          note={`Last ${data.months} months`}
        />
      </Metrics>
      <Columns
        label="Headcount at the end of each month"
        data={series.map((x) => ({
          label: dayjs(x.month).format("MMM"),
          value: x.headcount,
        }))}
        height={140}
        unit="people"
      />
      {data.undatedExits > 0 && (
        <p className={d.footnote}>
          {plural(data.undatedExits, "former employee")} without an exit date{" "}
          {data.undatedExits === 1 ? "isn’t" : "aren’t"} counted in past months.
        </p>
      )}
    </div>
  );
}

export function AttendanceTrend({ data }: { data: any }) {
  const series: any[] = data.series ?? [];
  if (series.length === 0)
    return <p className={d.note}>No working days in this period.</p>;
  const avg = series.reduce((a, x) => a + x.rate, 0) / series.length;
  return (
    <div className={d.stack}>
      <Metrics label="Attendance">
        <Metric
          label="Average"
          icon="percent"
          tone="accent"
          value={`${Math.round(avg * 100)}%`}
          note={`${plural(series.length, "working day")}`}
        />
        <Metric
          label="Today"
          icon="checkCircle"
          tone="success"
          value={
            series.at(-1)?.today
              ? `${Math.round(series.at(-1).rate * 100)}%`
              : "—"
          }
          note="So far"
        />
      </Metrics>
      <Columns
        label="Share of active employees who punched in, per working day"
        data={series.map((x) => ({
          label: dayjs(x.date).format("D MMM"),
          value: Math.round(x.rate * 100),
        }))}
        height={140}
        unit="%"
      />
      <p className={d.footnote}>
        Share of today’s {fmtNumber(data.headcount)} active employees who
        punched in. People on leave count as not in.
      </p>
    </div>
  );
}

export function Hiring({ data }: { data: any }) {
  const apps: any[] = data.applications ?? [];
  return (
    <div className={d.stack}>
      <Metrics label="Hiring">
        <Metric
          label="Open Roles"
          icon="briefcase"
          tone="accent"
          value={fmtNumber(data.openRoles)}
        />
        <Metric
          label="Offers Out"
          icon="doc"
          tone="success"
          value={fmtNumber(data.offersOut)}
        />
        <Metric
          label="Interviews This Week"
          icon="calendar"
          tone="warning"
          value={fmtNumber(data.interviews?.length ?? 0)}
        />
      </Metrics>
      {apps.length > 0 && (
        <BarList
          label="Applications by stage"
          data={apps.map((a) => ({ label: a.status, value: a.count }))}
          limit={5}
        />
      )}
      {data.interviews?.length > 0 && (
        <ul className={d.rows}>
          {data.interviews.map((i: any) => (
            <li key={i.id} className={d.row}>
              <RowIcon icon="calendar" tone="warning" />
              <span className={d.rowText}>
                <span className={d.rowTitle}>{i.candidate}</span>
                <span className={d.rowMeta}>
                  {[dayjs(i.at).format("ddd h:mm A"), i.stage, i.role]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <More to="/job-openings/view-job-openings">Job Openings</More>
    </div>
  );
}

const RUN_STEPS = ["draft", "approved", "disbursing", "disbursed"];
const RUN_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  disbursing: "Paying out",
  disbursed: "Paid",
};

export function Payroll({ data }: { data: any }) {
  const run = data.latest;
  if (!run)
    return (
      <EmptyState icon="banknote" title="No payroll runs yet">
        Start the first run from Payroll.
      </EmptyState>
    );
  const step = RUN_STEPS.indexOf(run.status);
  return (
    <div className={d.stack}>
      <p className={d.lead}>
        {dayjs(`${run.year}-${String(run.month).padStart(2, "0")}-01`).format(
          "MMMM YYYY",
        )}
      </p>
      <ol className={d.steps} aria-label="Payroll run progress">
        {RUN_STEPS.map((st, i) => (
          <li
            key={st}
            data-done={i < step || run.status === "disbursed" || undefined}
            data-current={i === step || undefined}
          >
            {RUN_LABEL[st]}
          </li>
        ))}
      </ol>
      <Metrics label="Payroll">
        <Metric
          label="Employees"
          icon="people"
          tone="accent"
          value={fmtNumber(run.employeeCount)}
          size="sm"
        />
        <Metric
          label="Gross"
          icon="banknote"
          tone="warning"
          value={fmtMoney(run.totalGross)}
          size="sm"
        />
        <Metric
          label="Net"
          icon="bank"
          tone="success"
          value={fmtMoney(run.totalNet)}
          size="sm"
        />
      </Metrics>
      {(data.openRuns > 1 || data.pendingAdvances > 0) && (
        <p className={d.note}>
          {[
            data.openRuns > 1
              ? `${plural(data.openRuns, "run")} not paid yet`
              : null,
            data.pendingAdvances
              ? `${plural(data.pendingAdvances, "salary advance")} to approve`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <More to="/payroll/payroll-runs">Payroll Runs</More>
    </div>
  );
}

const REVIEW_LABEL: Record<string, string> = {
  draft: "Self-assessment due",
  self_assessment_submitted: "With manager",
  manager_review_submitted: "Manager reviewed",
  finalized: "Finalised",
};

export function ReviewCycle({ data }: { data: any }) {
  if (!data.cycle)
    return (
      <EmptyState icon="star" title="No active review cycle">
        Start one from Review Cycles.
      </EmptyState>
    );
  const statuses: any[] = data.statuses ?? [];
  const total = statuses.reduce((a, x) => a + x.count, 0);
  const done = statuses.find((x) => x.status === "finalized")?.count ?? 0;
  return (
    <div className={d.stack}>
      <p className={d.lead}>
        {data.cycle.name}{" "}
        <span className={d.rowMeta}>
          · ends {fmtDate(data.cycle.periodEnd)}
        </span>
      </p>
      <Meter
        label="Reviews by stage"
        parts={[
          "draft",
          "self_assessment_submitted",
          "manager_review_submitted",
          "finalized",
        ].map((st, i) => ({
          label: REVIEW_LABEL[st],
          value: statuses.find((x) => x.status === st)?.count ?? 0,
          color: i === 3 ? SERIES[0] : i === 0 ? OTHER : SERIES[i],
        }))}
      />
      <p className={d.note}>
        {done} of {plural(total, "review")} finalised.
      </p>
      <More to="/performance-reviews/review-cycles">Review Cycles</More>
    </div>
  );
}

export function OrgAdmin({ data }: { data: any }) {
  const sub = data.subscription;
  return (
    <div className={d.stack}>
      <ul className={d.queue}>
        {data.joinRequests != null && (
          <li>
            <TransitionLink
              to="/settings/join-requests"
              className={d.queueRow}
              data-zero={!data.joinRequests || undefined}
            >
              <span className={d.queueLabel}>
                <RowIcon
                  icon="person"
                  tone={data.joinRequests ? "accent" : "neutral"}
                />
                Requests to join
              </span>
              <b>{fmtNumber(data.joinRequests)}</b>
            </TransitionLink>
          </li>
        )}
        {sub && (
          <>
            <li>
              <TransitionLink to="/subscription" className={d.queueRow}>
                <span className={d.queueLabel}>
                  <RowIcon icon="star" tone="accent" />
                  {sub.planTier
                    ? sub.planTier[0].toUpperCase() + sub.planTier.slice(1)
                    : "Plan"}{" "}
                  plan
                </span>
                {sub.subscriptionStatus === "trialing" ? (
                  <StatusBadge tone="accent">Free trial</StatusBadge>
                ) : (
                  <StatusBadge tone={toneForStatus(sub.subscriptionStatus)}>
                    {label(sub.subscriptionStatus)}
                  </StatusBadge>
                )}
              </TransitionLink>
            </li>
            {sub.planExpiresAt && (
              <li className={d.queueRow} data-static>
                <span className={d.queueLabel}>
                  <RowIcon icon="calendar" tone="success" />
                  {sub.subscriptionStatus === "trialing"
                    ? "Trial ends"
                    : "Renews"}
                </span>
                <b>{fmtDate(sub.planExpiresAt)}</b>
              </li>
            )}
            {sub.seatsUsed != null && (
              <li className={d.queueRow} data-static>
                <span className={d.queueLabel}>
                  <RowIcon icon="people" tone="warning" />
                  Seats used
                </span>
                <b>
                  {fmtNumber(sub.seatsUsed)}
                  {sub.seatLimit ? ` of ${fmtNumber(sub.seatLimit)}` : ""}
                </b>
              </li>
            )}
          </>
        )}
      </ul>
    </div>
  );
}

// ── Personal ────────────────────────────────────────────────────────────────

// Built-in types get a fixed look; anything tenant-defined cycles through
// the remaining tones so neighbouring tiles never match.
const LEAVE_LOOK: Record<string, { icon: IconName; tone: Tone }> = {
  PL: { icon: "leave", tone: "accent" },
  SL: { icon: "heart", tone: "danger" },
  CL: { icon: "sun", tone: "warning" },
  COMP_OFF: { icon: "refresh", tone: "success" },
};
const LEAVE_CYCLE: { icon: IconName; tone: Tone }[] = [
  { icon: "calendar", tone: "success" },
  { icon: "halfDay", tone: "accent" },
  { icon: "star", tone: "warning" },
];
const leaveLook = (key: string, i: number) =>
  LEAVE_LOOK[key?.toUpperCase()] ?? LEAVE_CYCLE[i % LEAVE_CYCLE.length];
const days = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

export function LeaveBalance({ data }: { data: any }) {
  const types: any[] = data.types ?? [];
  const upcoming: any[] = data.upcoming ?? [];
  return (
    <div className={d.stack}>
      {types.length === 0 ? (
        <p className={d.note}>No leave types are set up yet.</p>
      ) : (
        <Metrics label="Leave balance">
          {types.map((t, i) => {
            const look = leaveLook(t.key, i);
            return (
              <Metric
                key={t.key}
                label={t.name}
                icon={look.icon}
                tone={t.remaining > 0 ? look.tone : "neutral"}
                value={days(t.remaining)}
                note={t.remaining === 1 ? "day left" : "days left"}
                size="sm"
              />
            );
          })}
        </Metrics>
      )}
      {upcoming.length > 0 && (
        <>
          <h3 className={d.subhead}>Upcoming leave</h3>
          <ul className={d.rows}>
            {upcoming.map((l) => (
              <li key={l.id} className={d.row}>
                <DateTile
                  date={l.from}
                  tone={toneForStatus(l.status)}
                  size="small"
                />
                <span className={d.rowText}>
                  <span className={d.rowTitle}>{l.leaveType}</span>
                  <span className={d.rowMeta}>{range(l.from, l.to)}</span>
                </span>
                <StatusBadge tone={toneForStatus(l.status)}>
                  {l.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </>
      )}
      <More to="/attendance/apply-leave">Apply for Leave</More>
    </div>
  );
}

type RequestRow = {
  id: string;
  title: string;
  meta: string;
  status: string;
  to: string;
  icon: IconName;
  tone: Tone;
};

export function MyRequests({ data }: { data: any }) {
  const rows: RequestRow[] = [
    ...(data.leaves ?? []).map((l: any) => ({
      id: l.id,
      title: `${l.leaveType} leave`,
      meta: range(l.from, l.to),
      status: l.status,
      to: "/attendance/view-leave-applications",
      icon: "leave",
      tone: "accent",
    })),
    ...(data.wfh ?? []).map((w: any) => ({
      id: w.id,
      title: "Work from home",
      meta: range(w.date, w.toDate),
      status: w.status,
      to: "/wfh/requests",
      icon: "wfh",
      tone: "success",
    })),
    ...(data.tickets ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      meta: `Helpdesk · #${t.ticketNo}`,
      status: label(t.status),
      to: "/helpdesk",
      icon: "lifebuoy",
      tone: "warning",
    })),
    ...(data.advances ?? []).map((a: any) => ({
      id: a.id,
      title: "Salary advance",
      meta: fmtMoney(a.amount),
      status: a.status,
      to: "/payroll/salary-advances",
      icon: "banknote",
      tone: "danger",
    })),
  ];
  if (rows.length === 0)
    return (
      <EmptyState icon="checkCircle" title="All caught up">
        Nothing waiting on anyone else.
      </EmptyState>
    );
  // How many requests sit in each status, most common first.
  const byStatus = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((x, y) => y[1] - x[1]);
  return (
    <div className={d.stack}>
      <div className={d.chips} aria-label="Requests by status">
        {byStatus.map(([st, n]) => (
          <StatusBadge key={st} tone={toneForStatus(st)}>
            {n} {st.toLowerCase()}
          </StatusBadge>
        ))}
      </div>
      <ul className={d.rows}>
        {rows.slice(0, 6).map((r) => (
          <li key={r.id}>
            <TransitionLink to={r.to} className={d.row}>
              <RowIcon icon={r.icon} tone={r.tone} />
              <span className={d.rowText}>
                <span className={d.rowTitle}>{r.title}</span>
                <span className={d.rowMeta}>{r.meta}</span>
              </span>
              <StatusBadge tone={toneForStatus(r.status)}>
                {r.status}
              </StatusBadge>
            </TransitionLink>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <More to="/attendance/view-leave-applications">
          {plural(rows.length - 6, "more request")}
        </More>
      )}
    </div>
  );
}

export function MyReviews({ data }: { data: any }) {
  const mine: any[] = data.mine ?? [];
  const toReview: any[] = data.toReview ?? [];
  if (mine.length === 0 && toReview.length === 0)
    return (
      <EmptyState icon="star" title="No reviews in progress">
        Reviews appear here when a cycle starts.
      </EmptyState>
    );
  return (
    <div className={d.stack}>
      <ul className={d.rows}>
        {mine.map((r) => (
          <li key={r.id}>
            <TransitionLink to="/performance-reviews/reviews" className={d.row}>
              <RowIcon icon="star" tone="warning" />
              <span className={d.rowText}>
                <span className={d.rowTitle}>Your review · {r.cycle}</span>
                <span className={d.rowMeta}>
                  {r.due ? `Cycle ends ${fmtDateShort(r.due)}` : r.cycle}
                </span>
              </span>
              <StatusBadge
                tone={r.status === "finalized" ? "success" : "accent"}
              >
                {REVIEW_LABEL[r.status] ?? label(r.status)}
              </StatusBadge>
            </TransitionLink>
          </li>
        ))}
        {toReview.map((r) => (
          <li key={r.id}>
            <TransitionLink to="/performance-reviews/reviews" className={d.row}>
              <Avatar name={r.name} size={28} />
              <span className={d.rowText}>
                <span className={d.rowTitle}>Review {r.name}</span>
                <span className={d.rowMeta}>
                  {r.cycle} · self-assessment in
                </span>
              </span>
            </TransitionLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Payslip({ data }: { data: any }) {
  const p = data.latest;
  if (!p)
    return (
      <p className={d.note}>
        No payslips yet. They appear here once a payroll run is paid.
      </p>
    );
  return (
    <div className={d.stack}>
      <Metrics label="Latest payslip">
        <Metric
          label={dayjs(
            `${p.year}-${String(p.month).padStart(2, "0")}-01`,
          ).format("MMMM YYYY")}
          icon="banknote"
          tone="success"
          value={fmtMoney(p.net)}
          note={`Net pay${p.paidOn ? ` · paid ${fmtDateShort(p.paidOn)}` : ""}`}
        />
      </Metrics>
      <More to="/payroll/my-payslips">Payslips</More>
    </div>
  );
}
