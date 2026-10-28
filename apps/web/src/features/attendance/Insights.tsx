import { useState } from "react";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  Columns,
  DataTable,
  Metric,
  Metrics,
  SegmentedControl,
  SERIES,
  type Column,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import { InsightsFrame, pct } from "../insights/shared";

// Attendance insights — GET /attendance-insights?period= (Classic's Insights tab).

const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

export default function AttendanceInsights() {
  const [period, setPeriod] = useState("month");
  const { data, loading, error, refetch } = useGet<any>(
    `/attendance-insights?period=${period}`,
  );
  const m = data?.primaryMetrics ?? {};
  const weekly: any[] = data?.trendAnalysis?.weeklyTrends ?? [];
  const peak: any[] = data?.attendancePatterns?.peakHours ?? [];
  const teams: any[] = data?.teamPerformance ?? [];
  const dist = m.statusDistribution;
  const distRows = Array.isArray(dist)
    ? dist.map((d: any) => ({
        label: d.status ?? d.label ?? d.name,
        value: d.count ?? d.value ?? 0,
      }))
    : Object.entries(dist ?? {}).map(([k, v]) => ({
        label: k,
        value: Number(v) || 0,
      }));
  const teamCols: Column<any>[] = [
    {
      key: "dept",
      header: "Department",
      priority: "primary",
      render: (t) => <span className="px-headline">{t.department || "—"}</span>,
    },
    {
      key: "n",
      header: "People",
      align: "right",
      priority: "secondary",
      stackLabel: "People",
      render: (t) => t.employeeCount ?? "—",
    },
    {
      key: "rate",
      header: "Attendance",
      align: "right",
      priority: "trailing",
      render: (t) => pct(t.attendanceRate),
    },
    {
      key: "hrs",
      header: "Avg Hours",
      align: "right",
      priority: "secondary",
      stackLabel: "Hours",
      render: (t) =>
        t.avgWorkingHours != null ? Number(t.avgWorkingHours).toFixed(1) : "—",
    },
    {
      key: "corr",
      header: "Corrections",
      align: "right",
      priority: "hidden",
      render: (t) => pct(t.correctionRate),
    },
  ];
  return (
    <InsightsFrame
      title="Attendance Insights"
      loading={loading && !data}
      error={error}
      onRetry={refetch}
      tabs={
        <SegmentedControl
          role="radiogroup"
          label="Period"
          value={period}
          onChange={setPeriod}
          segments={PERIODS}
        />
      }
    >
      <Metrics label="Attendance metrics">
        <Metric label="Attendance Rate" value={pct(m.overallAttendanceRate)} />
        <Metric
          label="Avg Working Hours"
          value={
            m.averageWorkingHours != null
              ? Number(m.averageWorkingHours).toFixed(1)
              : "—"
          }
        />
        <Metric label="Correction Rate" value={pct(m.correctionRate)} />
        <Metric
          label="Automated Punches"
          value={pct(m.automationRate)}
          note="Face check + location"
        />
      </Metrics>
      <ChartGrid>
        <ChartBlock
          title="Weekly Attendance Rate"
          note={
            data?.trendAnalysis?.trendDirection
              ? `Trend: ${data.trendAnalysis.trendDirection}`
              : undefined
          }
        >
          <Columns
            label="Weekly attendance rate"
            unit="%"
            format={(v) => `${Math.round(v)}%`}
            data={weekly.map((w) => ({
              label: String(w.week),
              value: Number(w.attendanceRate ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Punch-In Times" note="When people start their day">
          <Columns
            label="Punch-ins by hour"
            color={SERIES[6]}
            data={peak.map((h: any) => ({
              label: String(h.hour ?? h.label ?? h.time),
              value: Number(h.count ?? h.value ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock title="Status Mix">
          <BarList label="Attendance status mix" data={distRows} />
        </ChartBlock>
        <ChartBlock title="By Department" span={2}>
          <DataTable
            label="Attendance by department"
            columns={teamCols}
            rows={teams}
            rowId={(t) => t.department ?? Math.random().toString()}
            empty={{ title: "No department data" }}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
