import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  DataTable,
  Metric,
  Metrics,
  SERIES,
  type Column,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import { fmtMoney } from "@next/lib/format";
import { ActionList, InsightsFrame, pct } from "../insights/shared";

// Recruitment insights — GET /job-openings-insights (Classic's Insights tab).

const entries = (o?: Record<string, number>) =>
  Object.entries(o ?? {}).map(([label, value]) => ({
    label,
    value: Number(value) || 0,
  }));

export default function RecruitmentInsights() {
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.JOB_OPENINGS_INSIGHTS,
  );
  const o = data?.overview ?? {};
  const deadlines = data?.deadlines ?? {};
  const jobs: any[] = data?.topPerformingJobs ?? [];
  const managers: any[] = data?.hiringManagers?.topPerformers ?? [];
  const status: any[] = data?.statusDistribution ?? data?.statusBreakdown ?? [];
  const managerCols: Column<any>[] = [
    {
      key: "n",
      header: "Hiring Manager",
      priority: "primary",
      render: (m) => <span className="px-headline">{m.name}</span>,
    },
    {
      key: "j",
      header: "Openings",
      align: "right",
      priority: "secondary",
      stackLabel: "Openings",
      render: (m) => m.totalJobs ?? "—",
    },
    {
      key: "a",
      header: "Active",
      align: "right",
      priority: "secondary",
      stackLabel: "Active",
      render: (m) => m.activeJobs ?? "—",
    },
    {
      key: "h",
      header: "Hired",
      align: "right",
      priority: "trailing",
      render: (m) => <b>{m.totalHired ?? 0}</b>,
    },
  ];
  return (
    <InsightsFrame
      title="Recruitment Insights"
      loading={loading}
      error={error}
      onRetry={refetch}
      updated={data?.lastUpdated}
    >
      <Metrics label="Recruitment overview">
        <Metric
          label="Active Openings"
          tone="accent"
          icon="briefcase"
          value={o.activeJobOpenings ?? "—"}
          note={`${o.totalJobOpenings ?? 0} total`}
        />
        <Metric
          label="Applications"
          tone="success"
          icon="doc"
          value={
            o.totalApplications ?? data?.applications?.totalApplications ?? "—"
          }
        />
        <Metric
          label="Per Opening"
          tone="neutral"
          icon="chart"
          value={
            o.averageApplicationsPerJob != null
              ? Number(o.averageApplicationsPerJob).toFixed(1)
              : "—"
          }
        />
        <Metric
          label="Hiring Success"
          tone="success"
          icon="trendUp"
          value={pct(o.hiringSuccessRate)}
        />
        <Metric
          label="Overdue"
          tone="warning"
          icon="alert"
          value={deadlines.overdueJobs ?? 0}
          note={`${deadlines.deadlinesThisWeek ?? 0} due this week`}
        />
      </Metrics>
      <ActionList items={data?.actionableInsights} />
      <ChartGrid>
        <ChartBlock
          title="Hiring Rate by Opening"
          note="Top openings by share of applicants hired"
        >
          <BarList
            label="Hiring rate by opening"
            max={100}
            format={(v) => pct(v)}
            data={jobs.map((j) => ({
              label: j.jobTitle,
              value: Number(j.hiringRate ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Openings by Status">
          <BarList
            label="Openings by status"
            color={SERIES[6]}
            data={status.map((s0: any) => ({
              label: s0.status,
              value: s0.count ?? 0,
            }))}
          />
        </ChartBlock>
        <ChartBlock
          title="Experience Asked For"
          note={
            data?.experienceRequirements?.mostCommonRange
              ? `Most common: ${data.experienceRequirements.mostCommonRange}`
              : undefined
          }
        >
          <BarList
            label="Experience requirements"
            color={SERIES[2]}
            data={entries(data?.experienceRequirements?.breakdown)}
          />
        </ChartBlock>
        <ChartBlock
          title="Budget Ranges"
          note={
            data?.budgetAnalysis?.averageBudget
              ? `Average ${fmtMoney(data.budgetAnalysis.averageBudget)}`
              : undefined
          }
        >
          <BarList
            label="Budget ranges"
            color={SERIES[3]}
            data={entries(data?.budgetAnalysis?.budgetRanges)}
          />
        </ChartBlock>
        <ChartBlock title="Hiring Managers" span={2}>
          <DataTable
            label="Hiring managers"
            columns={managerCols}
            rows={managers}
            rowId={(m) => String(m.name)}
            empty={{ title: "No hiring managers yet" }}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
