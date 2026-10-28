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
import { fmtDate } from "@next/lib/format";
import { ActionList, InsightsFrame, pct } from "../insights/shared";

// Resignation insights — GET /resignation-insights (Classic's Insights tab).

export default function ResignationInsights() {
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.RESIGNATION_INSIGHTS,
  );
  const o = data?.overview ?? {};
  const p = data?.processingMetrics ?? {};
  const fb = data?.exitFeedback ?? {};
  const upcoming: any[] = data?.upcomingDepartures ?? [];
  const cols: Column<any>[] = [
    {
      key: "u",
      header: "Employee",
      priority: "primary",
      render: (d) => (
        <span className="px-headline">{d.name || d.username}</span>
      ),
    },
    {
      key: "d",
      header: "Department",
      priority: "secondary",
      render: (d) => d.department || "—",
    },
    {
      key: "l",
      header: "Last Day",
      priority: "trailing",
      render: (d) => (
        <span className="px-num">{fmtDate(d.lastWorkingDay)}</span>
      ),
    },
  ];
  return (
    <InsightsFrame
      title="Resignation Insights"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      <Metrics label="Resignations">
        <Metric label="Total" value={o.total ?? "—"} />
        <Metric label="Pending" value={o.submitted ?? "—"} />
        <Metric label="Approved" value={o.approved ?? "—"} />
        <Metric label="Approval Rate" value={pct(o.approvalRate)} />
        <Metric
          label="Avg Processing"
          value={
            p.averageProcessingTime != null
              ? `${p.averageProcessingTime} days`
              : "—"
          }
          note={p.pendingOverdue ? `${p.pendingOverdue} overdue` : undefined}
        />
      </Metrics>
      <ActionList items={data?.actionableInsights} />
      <ChartGrid>
        <ChartBlock title="Top Reasons">
          <BarList
            label="Resignation reasons"
            data={(data?.reasonAnalysis?.topReasons ?? []).map((r: any) => ({
              label: r.reason,
              value: r.count ?? 0,
            }))}
          />
        </ChartBlock>
        <ChartBlock title="By Department">
          <BarList
            label="Resignations by department"
            color={SERIES[1]}
            data={(data?.departmentAnalysis?.topDepartments ?? []).map(
              (d: any) => ({
                label: d.department || "—",
                value: d.totalResignations ?? 0,
              }),
            )}
          />
        </ChartBlock>
        <ChartBlock
          title="Exit Feedback"
          note={`${fb.totalResponses ?? 0} responses · ${pct(fb.recommendationRate)} would recommend working here`}
        >
          <BarList
            label="Average exit ratings"
            color={SERIES[6]}
            max={5}
            format={(v) => `${v.toFixed(1)} / 5`}
            data={Object.entries(fb.averageRatings ?? {}).map(([k, v]) => ({
              label: k
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase()),
              value: Number(v) || 0,
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Upcoming Departures">
          <DataTable
            label="Upcoming departures"
            columns={cols}
            rows={upcoming}
            rowId={(d) => String(d.username ?? d.name)}
            empty={{ icon: "door", title: "No departures scheduled" }}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
