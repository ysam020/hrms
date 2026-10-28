import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  Columns,
  DataTable,
  Meter,
  Metric,
  Metrics,
  OTHER,
  SERIES,
  type Column,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import { InsightsFrame, pct } from "../insights/shared";

// KYC insights — GET /get-kyc-insights (Classic's KYC Insights tab).

export default function KycInsights() {
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.GET_KYC_INSIGHTS,
  );
  const o = data?.overview ?? {};
  const extra = data?.insights ?? {};
  const depts: any[] = data?.departmentBreakdown ?? [];
  const trend: any[] = data?.completionTrends ?? [];
  const cols: Column<any>[] = [
    {
      key: "d",
      header: "Department",
      priority: "primary",
      render: (d) => <span className="px-headline">{d.department || "—"}</span>,
    },
    {
      key: "t",
      header: "People",
      align: "right",
      priority: "secondary",
      stackLabel: "People",
      render: (d) => d.total ?? "—",
    },
    {
      key: "a",
      header: "Approved",
      align: "right",
      priority: "secondary",
      stackLabel: "Approved",
      render: (d) => d.approved ?? 0,
    },
    {
      key: "p",
      header: "Pending",
      align: "right",
      priority: "hidden",
      render: (d) => d.pending ?? 0,
    },
    {
      key: "c",
      header: "Complete",
      align: "right",
      priority: "trailing",
      render: (d) => pct(d.completionRate),
    },
  ];
  return (
    <InsightsFrame
      title="KYC Insights"
      loading={loading}
      error={error}
      onRetry={refetch}
      updated={data?.lastUpdated}
    >
      <Metrics label="KYC overview">
        <Metric label="Completion" value={pct(o.completionRate)} />
        <Metric label="Approved" value={o.approvedKyc ?? "—"} />
        <Metric label="Pending" value={o.pendingKyc ?? "—"} />
        <Metric label="Not Started" value={o.incompleteKyc ?? "—"} />
        <Metric
          label="Avg Processing"
          value={
            extra.averageProcessingTime != null
              ? `${extra.averageProcessingTime} days`
              : "—"
          }
          size="sm"
        />
      </Metrics>
      <ChartGrid>
        <ChartBlock title="Status" note={`${o.totalEmployees ?? 0} employees`}>
          <Meter
            label="KYC status"
            parts={[
              {
                label: "Approved",
                value: o.approvedKyc ?? 0,
                color: SERIES[2],
              },
              { label: "Pending", value: o.pendingKyc ?? 0, color: SERIES[3] },
              {
                label: "Rejected",
                value: o.rejectedKyc ?? 0,
                color: SERIES[7],
              },
              {
                label: "Not Started",
                value: o.incompleteKyc ?? 0,
                color: OTHER,
              },
            ]}
          />
        </ChartBlock>
        <ChartBlock title="Completions Over Time">
          <Columns
            label="KYC completions over time"
            data={trend.slice(-12).map((t) => ({
              label: dayjs(t.date).format("D MMM"),
              value: Number(t.completed ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Completion by Department">
          <BarList
            label="Completion by department"
            max={100}
            format={(v) => pct(v)}
            data={depts.map((d) => ({
              label: d.department || "—",
              value: Number(d.completionRate ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Department Detail">
          <DataTable
            label="KYC by department"
            columns={cols}
            rows={depts}
            rowId={(d) => String(d.department)}
            empty={{ title: "No department data" }}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
