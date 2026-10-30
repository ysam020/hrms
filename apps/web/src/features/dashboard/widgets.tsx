import dayjs from "dayjs";
import type { ReactNode } from "react";
import { TransitionLink } from "@next/motion";
import {
  Avatar,
  BarList,
  Columns,
  EmptyState,
  Meter,
  Metric,
  Metrics,
  SERIES,
  OTHER,
  StatusBadge,
  toneForStatus,
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

function More({ to, children }: { to: string; children: ReactNode }) {
  return (
    <TransitionLink to={to} className={d.more}>
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
function PresenceSplit({ counts }: { counts: any }) {
  const office = Math.max(0, counts.in - counts.wfh);
  return (
    <>
      <Metrics label="Today">
        <Metric
          label="In"
          value={fmtNumber(counts.in)}
          note={counts.wfh ? `${counts.wfh} remote` : undefined}
        />
        <Metric label="On Leave" value={fmtNumber(counts.leave)} />
        <Metric label="Not Punched In Yet" value={fmtNumber(counts.notIn)} />
        <Metric label="Headcount" value={fmtNumber(counts.total)} />
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
      <PresenceSplit counts={data.counts} />
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
            <span className={d.when}>{range(l.from, l.to)}</span>
            <span className={d.rowText}>
              <span className={d.rowTitle}>{l.name}</span>
              <span className={d.rowMeta}>
                {l.leaveType}
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
      <PresenceSplit counts={data.counts} />
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
        <Metric label="Active Employees" value={fmtNumber(data.active)} />
        <Metric
          label="Joined This Month"
          value={fmtNumber(data.joinersThisMonth)}
        />
        <Metric
          label="Leaving This Month"
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

function PeopleList({ items, empty }: { items: any[]; empty: string }) {
  if (items.length === 0) return <p className={d.note}>{empty}</p>;
  return (
    <ul className={d.rows}>
      {items.map((p) => (
        <li key={p.id} className={d.row}>
          <span className={d.when}>{fmtDateShort(p.date)}</span>
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
            empty="No one joins in the next 30 days."
          />
        </div>
      )}
      <div className={d.stack}>
        <h3 className={d.subhead}>Leaving</h3>
        <PeopleList
          items={data.leaving ?? []}
          empty="No one leaves in the next 30 days."
        />
        <More to="/resignation-process/view-resignations">Resignations</More>
      </div>
    </div>
  );
}

const QUEUE: { key: string; label: string; to: string }[] = [
  { key: "kyc", label: "KYC to review", to: "/kyc/view-employee-kycs" },
  {
    key: "exits",
    label: "Resignations to decide",
    to: "/resignation-process/view-resignations",
  },
  { key: "tickets", label: "Open helpdesk tickets", to: "/helpdesk" },
  { key: "assetIssues", label: "Open asset issues", to: "/assets/issues" },
  {
    key: "advances",
    label: "Salary advances to approve",
    to: "/payroll/salary-advances",
  },
  { key: "joins", label: "Requests to join", to: "/settings/join-requests" },
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
              <span>{q.label}</span>
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
          value={fmtNumber(last)}
          note={
            first
              ? `${last - first >= 0 ? "+" : ""}${last - first} since ${dayjs(series[0].month).format("MMM")}`
              : undefined
          }
        />
        <Metric
          label="Joined"
          value={fmtNumber(joined)}
          note={`Last ${data.months} months`}
        />
        <Metric
          label="Left"
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
          value={`${Math.round(avg * 100)}%`}
          note={`${plural(series.length, "working day")}`}
        />
        <Metric
          label="Today"
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
        <Metric label="Open Roles" value={fmtNumber(data.openRoles)} />
        <Metric label="Offers Out" value={fmtNumber(data.offersOut)} />
        <Metric
          label="Interviews This Week"
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
              <span className={d.when}>{dayjs(i.at).format("ddd h:mm A")}</span>
              <span className={d.rowText}>
                <span className={d.rowTitle}>{i.candidate}</span>
                <span className={d.rowMeta}>
                  {[i.stage, i.role].filter(Boolean).join(" · ")}
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
          value={fmtNumber(run.employeeCount)}
          size="sm"
        />
        <Metric label="Gross" value={fmtMoney(run.totalGross)} size="sm" />
        <Metric label="Net" value={fmtMoney(run.totalNet)} size="sm" />
      </Metrics>
      {(data.openRuns > 1 || data.pendingAdvances) && (
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
              <span>Requests to join</span>
              <b>{fmtNumber(data.joinRequests)}</b>
            </TransitionLink>
          </li>
        )}
        {sub && (
          <>
            <li>
              <TransitionLink to="/subscription" className={d.queueRow}>
                <span>
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
                <span>
                  {sub.subscriptionStatus === "trialing"
                    ? "Trial ends"
                    : "Renews"}
                </span>
                <b>{fmtDate(sub.planExpiresAt)}</b>
              </li>
            )}
            {sub.seatsUsed != null && (
              <li className={d.queueRow} data-static>
                <span>Seats used</span>
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

export function LeaveBalance({ data }: { data: any }) {
  const types: any[] = data.types ?? [];
  const upcoming: any[] = data.upcoming ?? [];
  return (
    <div className={d.stack}>
      {types.length === 0 ? (
        <p className={d.note}>No leave types are set up yet.</p>
      ) : (
        <dl className={d.balances}>
          {types.map((t) => (
            <div key={t.key}>
              <dt>{t.name}</dt>
              <dd>
                {Number.isInteger(t.remaining)
                  ? t.remaining
                  : t.remaining.toFixed(1)}
                <span> days</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {upcoming.length > 0 && (
        <ul className={d.rows}>
          {upcoming.map((l) => (
            <li key={l.id} className={d.row}>
              <span className={d.when}>{range(l.from, l.to)}</span>
              <span className={d.rowText}>
                <span className={d.rowTitle}>{l.leaveType}</span>
              </span>
              <StatusBadge tone={toneForStatus(l.status)}>
                {l.status}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      <More to="/attendance/apply-leave">Apply for Leave</More>
    </div>
  );
}

export function MyRequests({ data }: { data: any }) {
  const rows: {
    id: string;
    title: string;
    meta: string;
    status: string;
    to: string;
  }[] = [
    ...(data.leaves ?? []).map((l: any) => ({
      id: l.id,
      title: `Leave · ${l.leaveType}`,
      meta: range(l.from, l.to),
      status: l.status,
      to: "/attendance/view-leave-applications",
    })),
    ...(data.wfh ?? []).map((w: any) => ({
      id: w.id,
      title: "Work from home",
      meta: range(w.date, w.toDate),
      status: w.status,
      to: "/wfh/requests",
    })),
    ...(data.tickets ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      meta: `Ticket #${t.ticketNo}`,
      status: label(t.status),
      to: "/helpdesk",
    })),
    ...(data.advances ?? []).map((a: any) => ({
      id: a.id,
      title: "Salary advance",
      meta: fmtMoney(a.amount),
      status: a.status,
      to: "/payroll/salary-advances",
    })),
  ];
  if (rows.length === 0)
    return <p className={d.note}>Nothing waiting on anyone else.</p>;
  return (
    <ul className={d.rows}>
      {rows.slice(0, 6).map((r) => (
        <li key={r.id}>
          <TransitionLink to={r.to} className={d.row}>
            <span className={d.rowText}>
              <span className={d.rowTitle}>{r.title}</span>
              <span className={d.rowMeta}>{r.meta}</span>
            </span>
            <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge>
          </TransitionLink>
        </li>
      ))}
    </ul>
  );
}

export function MyReviews({ data }: { data: any }) {
  const mine: any[] = data.mine ?? [];
  const toReview: any[] = data.toReview ?? [];
  if (mine.length === 0 && toReview.length === 0)
    return <p className={d.note}>No reviews in progress.</p>;
  return (
    <div className={d.stack}>
      <ul className={d.rows}>
        {mine.map((r) => (
          <li key={r.id}>
            <TransitionLink to="/performance-reviews/reviews" className={d.row}>
              <span className={d.rowText}>
                <span className={d.rowTitle}>Your review · {r.cycle}</span>
                <span className={d.rowMeta}>
                  {REVIEW_LABEL[r.status] ?? r.status}
                  {r.due ? ` · cycle ends ${fmtDateShort(r.due)}` : ""}
                </span>
              </span>
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
          value={fmtMoney(p.net)}
          note={`Net pay${p.paidOn ? ` · paid ${fmtDateShort(p.paidOn)}` : ""}`}
        />
      </Metrics>
      <More to="/payroll/my-payslips">Payslips</More>
    </div>
  );
}
