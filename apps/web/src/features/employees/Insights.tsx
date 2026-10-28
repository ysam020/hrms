import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  Legend,
  Meter,
  Metric,
  Metrics,
  SERIES,
  OTHER,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import { InsightsFrame, pct } from "../insights/shared";

// Employee insights — GET /employee-insights (Classic's EmployeeInsights).

export default function EmployeeInsights() {
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.EMPLOYEE_INSIGHTS,
  );
  const o = data?.overview ?? {};
  const depts: any[] = data?.departmentBreakdown ?? [];
  const statusParts = [
    { label: "Active", value: o.activeEmployees ?? 0, color: SERIES[2] },
    { label: "Resigned", value: o.resignedEmployees ?? 0, color: SERIES[3] },
    {
      label: "Terminated",
      value: o.terminatedEmployees ?? 0,
      color: SERIES[7],
    },
    { label: "Absconded", value: o.abscondedEmployees ?? 0, color: OTHER },
  ];
  return (
    <InsightsFrame
      title="Employee Insights"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      <Metrics label="Headcount">
        <Metric label="Total" value={o.totalEmployees ?? "—"} />
        <Metric label="Active" value={o.activeEmployees ?? "—"} />
        <Metric label="Resigned" value={o.resignedEmployees ?? "—"} />
        <Metric label="Terminated" value={o.terminatedEmployees ?? "—"} />
      </Metrics>
      <ChartGrid>
        <ChartBlock
          title="Workforce Status"
          note="Everyone on record, by employment status"
        >
          <Meter label="Workforce status" parts={statusParts} />
        </ChartBlock>
        <ChartBlock title="Headcount by Department">
          <BarList
            label="Headcount by department"
            data={depts.map((d) => ({
              label: d.department || "Unassigned",
              value: d.count ?? 0,
            }))}
          />
        </ChartBlock>
        <ChartBlock
          title="Active Rate by Department"
          note="Share of each department currently active"
        >
          <BarList
            label="Active rate by department"
            color={SERIES[2]}
            max={100}
            format={(v) => pct(v)}
            data={depts.map((d) => ({
              label: d.department || "Unassigned",
              value: Number(d.activeRate ?? 0),
            }))}
          />
        </ChartBlock>
        <ChartBlock
          title="PF and WFH Coverage"
          note="Share of each department enrolled"
        >
          <Legend
            items={[
              { label: "PF", color: SERIES[0] },
              { label: "WFH", color: SERIES[6] },
            ]}
          />
          <BarList
            label="PF coverage"
            max={100}
            format={(v) => pct(v)}
            data={depts.map((d) => ({
              label: `${d.department || "—"} · PF`,
              value: Number(d.pfRate ?? 0),
            }))}
          />
          <BarList
            label="WFH coverage"
            color={SERIES[6]}
            max={100}
            format={(v) => pct(v)}
            data={depts.map((d) => ({
              label: `${d.department || "—"} · WFH`,
              value: Number(d.wfhRate ?? 0),
            }))}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
