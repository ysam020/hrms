import dayjs from "dayjs";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import useFetchData from "@web/shared/hooks/useFetchData";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  Columns,
  DataTable,
  ErrorState,
  Meter,
  Metric,
  Metrics,
  OTHER,
  Page,
  SERIES,
  Skeleton,
  type Column,
  ChartBodySkeleton,
  MetricsSkeleton,
} from "@next/ui";
import { fmtMoney } from "@next/lib/format";
import { NotFound } from "../system/System";

// Analytics — the same 21 analytics endpoints as Classic's Analytics module,
// fetched with Classic's useFetchData (which caches /get-* analytics for five
// minutes in IndexedDB). Charts follow the dataviz method: bars over pies,
// one axis, labels and tables always present.

const SECTIONS: Record<string, { title: string; body: () => ReactNode }> = {
  workforce: { title: "Workforce Analytics", body: () => <Workforce /> },
  "leave-attendance": {
    title: "Leave & Attendance Analytics",
    body: () => <LeaveAttendance />,
  },
  recruitment: { title: "Recruitment Analytics", body: () => <Recruitment /> },
  salary: { title: "Salary Analytics", body: () => <Salary /> },
};

export default function Analytics() {
  const { section = "workforce" } = useParams();
  const s = SECTIONS[section];
  if (!s) return <NotFound />;
  return (
    <Page title={s.title}>
      <div style={{ display: "grid", gap: 40 }}>{s.body()}</div>
    </Page>
  );
}

/** Fetch one analytics endpoint and render its chart (or its own state). */
function Data<T = any>({
  url,
  children,
  skeleton = <ChartBodySkeleton />,
}: {
  url: string;
  children: (data: T) => ReactNode;
  /** Placeholder shaped like what this endpoint renders. */
  skeleton?: ReactNode;
}) {
  const { data, loading, error, refetch } = useFetchData<T>(url, "get", []);
  if (loading && (!data || (Array.isArray(data) && data.length === 0)))
    return <>{skeleton}</>;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return <>{children(data as T)}</>;
}

const list = (d: any): any[] =>
  Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
const nameOf = (i: any, ...keys: string[]) =>
  String(
    keys.map((k) => i?.[k]).find((v) => v != null && v !== "") ??
      i?._id ??
      "Unknown",
  );
const capital = (v: string) =>
  v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ── Workforce ───────────────────────────────────────────────────────────────

function Workforce() {
  return (
    <>
      <Data
        url="/get-employment-type-breakdown"
        skeleton={<MetricsSkeleton count={3} />}
      >
        {(d: any) => (
          <Metrics label="Workforce">
            <Metric label="Employees" value={d?.totalEmployees ?? "—"} />
            <Metric label="In Office" value={d?.officeCount ?? "—"} />
            <Metric label="Work From Home" value={d?.wfhCount ?? "—"} />
          </Metrics>
        )}
      </Data>
      <ChartGrid>
        <ChartBlock
          title="Headcount Growth"
          note="Cumulative headcount by month"
          span={2}
        >
          <Data url="/get-headcount-growth">
            {(d) => (
              <Columns
                label="Headcount by month"
                data={list(d).map((i) => ({
                  label: i.monthName
                    ? `${String(i.monthName).slice(0, 3)} ${String(i.year ?? "").slice(2)}`
                    : String(i._id),
                  value: Number(i.cumulativeHeadcount ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="New Joiners" note="Joinings per month">
          <Data url="/get-joining-data">
            {(d) => (
              <Columns
                label="Joinings per month"
                color={SERIES[2]}
                data={list(d).map((i) => ({
                  label: String(i.formattedDate ?? i._id),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Employment Status">
          <Data url="/get-employee-status-distribution">
            {(d) => (
              <Meter
                label="Employment status"
                parts={list(d).map((i, n) => ({
                  label: capital(nameOf(i, "status")),
                  value: Number(i.count ?? 0),
                  color: SERIES[n] ?? OTHER,
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Departments">
          <Data url="/get-employee-departments">
            {(d) => (
              <BarList
                label="Employees by department"
                data={list(d).map((i) => ({
                  label: nameOf(i, "department"),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Designations">
          <Data url="/get-employee-designations">
            {(d) => (
              <BarList
                label="Employees by designation"
                color={SERIES[6]}
                data={list(d).map((i) => ({
                  label: nameOf(i, "designation"),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Age">
          <Data url="/get-age-distribution">
            {(d) => (
              <Columns
                label="Employees by age group"
                color={SERIES[2]}
                data={list(d).map((i) => ({
                  label: nameOf(i, "ageGroup", "age_group"),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Tenure">
          <Data url="/get-tenure-distribution">
            {(d) => (
              <Columns
                label="Employees by tenure"
                color={SERIES[3]}
                data={list(d).map((i) => ({
                  label: nameOf(i, "range", "tenure"),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
      </ChartGrid>
    </>
  );
}

// ── Leave & attendance ──────────────────────────────────────────────────────

function LeaveAttendance() {
  return (
    <>
      <Data
        url="/get-leave-approval-rate"
        skeleton={<MetricsSkeleton count={4} />}
      >
        {(d: any) => (
          <Metrics label="Leave approvals">
            <Metric
              label="Approval Rate"
              value={
                d?.approvalRate != null ? `${Math.round(d.approvalRate)}%` : "—"
              }
            />
            <Metric label="Requests" value={d?.total ?? "—"} />
            <Metric label="Approved" value={d?.approved ?? "—"} />
            <Metric label="Pending" value={d?.pending ?? "—"} />
            <Metric label="Rejected" value={d?.rejected ?? "—"} />
          </Metrics>
        )}
      </Data>
      <ChartGrid>
        <ChartBlock title="Attendance Rate" note="By month" span={2}>
          <Data url="/get-attendance-trends">
            {(d) => (
              <Columns
                label="Attendance rate by month"
                unit="%"
                format={(v) => `${Math.round(v)}%`}
                data={list(d).map((i) => ({
                  label: monthLabel(i._id),
                  value: Number(i.attendanceRate ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Average Working Hours" note="By month">
          <Data url="/get-attendance-trends">
            {(d) => (
              <Columns
                label="Average working hours by month"
                color={SERIES[6]}
                unit="hours"
                format={(v) => v.toFixed(1)}
                data={list(d).map((i) => ({
                  label: monthLabel(i._id),
                  value: Number(i.avgWorkingHours ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock
          title="Daily Hours Worked"
          note="How long people work each day"
        >
          <Data url="/get-working-hours-distribution">
            {(d) => (
              <Columns
                label="Working hours distribution"
                color={SERIES[2]}
                data={list(d).map((i) => ({
                  label: String(i._id),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Leave by Type">
          <Data url="/get-leave-type-breakdown">
            {(d) => (
              <BarList
                label="Leave days by type"
                color={SERIES[1]}
                format={(v) => `${v} days`}
                data={list(d).map((i) => ({
                  label: nameOf(i, "leaveType"),
                  value: Number(i.totalDays ?? i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Leave by Month">
          <Data url="/get-monthly-leave-patterns">
            {(d) => (
              <Columns
                label="Leave applications by month"
                color={SERIES[1]}
                data={list(d).map((i) => ({
                  label: monthLabel(i.month),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
      </ChartGrid>
    </>
  );
}

const monthLabel = (v: unknown) => {
  if (typeof v === "number")
    return dayjs()
      .month(v - 1)
      .format("MMM");
  const d = dayjs(String(v));
  return d.isValid() ? d.format("MMM YY") : String(v);
};

// ── Recruitment ─────────────────────────────────────────────────────────────

function Recruitment() {
  const managerCols: Column<any>[] = [
    {
      key: "m",
      header: "Hiring Manager",
      priority: "primary",
      render: (r) => (
        <span className="px-headline">{r.hiringManager || r.name || "—"}</span>
      ),
    },
    {
      key: "t",
      header: "Openings",
      align: "right",
      priority: "secondary",
      stackLabel: "Openings",
      render: (r) => r.totalJobs ?? "—",
    },
    {
      key: "a",
      header: "Active",
      align: "right",
      priority: "secondary",
      stackLabel: "Active",
      render: (r) => r.activeJobs ?? "—",
    },
    {
      key: "c",
      header: "Closed",
      align: "right",
      priority: "hidden",
      render: (r) => r.closedJobs ?? "—",
    },
    {
      key: "s",
      header: "Success",
      align: "right",
      priority: "trailing",
      render: (r) =>
        r.successRate != null ? `${Number(r.successRate).toFixed(0)}%` : "—",
    },
  ];
  return (
    <ChartGrid>
      <ChartBlock
        title="Hiring Funnel"
        note="Applicants at each stage"
        span={2}
      >
        <Data url="/get-hiring-funnel">
          {(d: any) => {
            const stages = Array.isArray(d?.stages)
              ? d.stages.map((s: any) => ({
                  label: s.stage,
                  value: Number(s.count ?? 0),
                }))
              : [
                  { label: "Applied", value: Number(d?.applied ?? 0) },
                  {
                    label: "Interviewing",
                    value: Number(d?.interviewing ?? 0),
                  },
                  { label: "Hired", value: Number(d?.hired ?? 0) },
                  { label: "Rejected", value: Number(d?.rejected ?? 0) },
                ];
            return (
              <>
                <BarList label="Hiring funnel" data={stages} limit={10} />
                {d?.hireRate != null && (
                  <p className="px-meta">
                    Hire rate {Number(d.hireRate).toFixed(1)}% · interview rate{" "}
                    {Number(d.interviewingRate ?? 0).toFixed(1)}%
                  </p>
                )}
              </>
            );
          }}
        </Data>
      </ChartBlock>
      <ChartBlock title="Applications by Role">
        <Data url="/get-applications-by-job-role">
          {(d) => (
            <BarList
              label="Applications by role"
              color={SERIES[6]}
              data={list(d).map((i) => ({
                label: nameOf(i, "jobTitle"),
                value: Number(i.totalApplications ?? 0),
              }))}
            />
          )}
        </Data>
      </ChartBlock>
      <ChartBlock title="Openings by Status">
        <Data url="/get-job-openings-by-status">
          {(d) => (
            <BarList
              label="Openings by status"
              color={SERIES[2]}
              data={list(d).map((i) => ({
                label: capital(nameOf(i, "status")),
                value: Number(i.count ?? 0),
              }))}
            />
          )}
        </Data>
      </ChartBlock>
      <ChartBlock title="Hiring Managers" span={2}>
        <Data url="/get-hiring-manager-performance">
          {(d) => (
            <DataTable
              label="Hiring manager performance"
              columns={managerCols}
              rows={list(d)}
              rowId={(r) => String(r.hiringManager ?? r._id ?? r.name)}
              empty={{ title: "No hiring managers yet" }}
            />
          )}
        </Data>
      </ChartBlock>
    </ChartGrid>
  );
}

// ── Salary ──────────────────────────────────────────────────────────────────

function Salary() {
  const rangeCols: Column<any>[] = [
    {
      key: "d",
      header: "Department",
      priority: "primary",
      render: (r) => (
        <span className="px-headline">
          {r.department || r.designation || "—"}
        </span>
      ),
    },
    {
      key: "min",
      header: "Lowest",
      align: "right",
      priority: "secondary",
      stackLabel: "Low",
      render: (r) => fmtMoney(r.minSalary),
    },
    {
      key: "avg",
      header: "Average",
      align: "right",
      priority: "trailing",
      render: (r) => <b className="px-num">{fmtMoney(r.avgSalary)}</b>,
    },
    {
      key: "max",
      header: "Highest",
      align: "right",
      priority: "secondary",
      stackLabel: "High",
      render: (r) => fmtMoney(r.maxSalary),
    },
  ];
  return (
    <>
      <Data url="/get-compensation-breakdown">
        {(d: any) => {
          const c = d?.data ?? d ?? {};
          const parts = [
            ["Basic", c.avgBasicPay],
            ["HRA", c.avgHRA],
            ["Conveyance", c.avgConveyance],
            ["PF", c.avgPF],
            ["ESI", c.avgESI],
            ["Professional Tax", c.avgPT],
          ].filter(([, v]) => v != null) as [string, number][];
          return (
            <ChartBlock
              title="Average Monthly Compensation"
              note={
                c.employeeCount
                  ? `Across ${c.employeeCount} employees`
                  : undefined
              }
            >
              <BarList
                label="Average compensation components"
                format={(v) => fmtMoney(v)}
                data={parts.map(([label, value]) => ({
                  label,
                  value: Number(value) || 0,
                }))}
                limit={10}
              />
            </ChartBlock>
          );
        }}
      </Data>
      <ChartGrid>
        <ChartBlock
          title="Salary Bands"
          note="Employees per monthly salary band"
        >
          <Data url="/get-salary-bands">
            {(d) => (
              <Columns
                label="Employees per salary band"
                color={SERIES[2]}
                data={list(d).map((i) => ({
                  label: String(i.range ?? i._id),
                  value: Number(i.count ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Average Salary by Designation">
          <Data url="/get-average-salary-by-designation">
            {(d) => (
              <BarList
                label="Average salary by designation"
                color={SERIES[6]}
                format={(v) => fmtMoney(v)}
                data={list(d).map((i) => ({
                  label: nameOf(i, "designation"),
                  value: Number(i.avgSalary ?? 0),
                }))}
              />
            )}
          </Data>
        </ChartBlock>
        <ChartBlock title="Salary Range by Department" span={2}>
          <Data url="/get-salary-distribution-by-department">
            {(d) => (
              <DataTable
                label="Salary range by department"
                columns={rangeCols}
                rows={list(d)}
                rowId={(r) => String(r.department ?? r._id)}
                empty={{ title: "No salary data yet" }}
              />
            )}
          </Data>
        </ChartBlock>
      </ChartGrid>
    </>
  );
}
