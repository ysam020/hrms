import React, { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import {
  usePrometheusQuery,
  type PrometheusRange,
} from "../hooks/usePrometheusQuery";

const ReactApexChart = lazy(() => import("react-apexcharts"));

const Loader = () => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
    <CircularProgress size={24} />
  </Box>
);

function fmtVal(val: number | undefined) {
  if (val == null || !isFinite(val)) return "0.00";
  return val.toFixed(2);
}

function chartOpts(theme: string, unit: string) {
  const isDark = theme === "dark";
  const textColor = isDark ? "#aaa" : "#666";
  const gridColor = isDark ? "#333" : "#e0e0e0";
  return {
    chart: {
      type: "area" as const,
      fontFamily: "inherit",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      background: "transparent",
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" as const, width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.25, opacityTo: 0.02 },
    },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    xaxis: {
      type: "datetime" as const,
      labels: { style: { colors: textColor }, datetimeUTC: false },
      axisBorder: { show: false },
    },
    yaxis: {
      title: { text: unit, style: { color: textColor } },
      labels: { style: { colors: textColor }, formatter: fmtVal },
    },
    legend: {
      labels: { colors: isDark ? "#ccc" : "#333" },
      position: "top" as const,
    },
    tooltip: {
      theme: isDark ? "dark" : "light",
      x: { format: "HH:mm:ss" },
      y: { formatter: fmtVal },
    },
  };
}

interface ChartCardProps {
  title: string;
  loading: boolean;
  series: any[];
  unit: string;
  theme: string;
  colors?: string[];
  height?: number;
}

function ChartCard({
  title,
  loading,
  series,
  unit,
  theme,
  colors,
  height = 200,
}: ChartCardProps) {
  return (
    <Card elevation={1}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {title}
        </Typography>
        {loading ? (
          <Loader />
        ) : (
          <Suspense fallback={<Loader />}>
            <ReactApexChart
              options={{
                ...chartOpts(theme, unit),
                ...(colors ? { colors } : {}),
              }}
              series={series}
              type="area"
              height={height}
            />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}

interface Props {
  theme: string;
  range: PrometheusRange;
  service: string;
}

function NodeMetrics({ theme, range, service }: Props) {
  const svc = service || ".+";

  const { series: cpuSeries, loading: cpuLoading } = usePrometheusQuery(
    `rate(process_cpu_seconds_total{service=~"${svc}"}[1m]) * 100`,
    range,
  );
  const { series: heapUsedSeries, loading: heapLoading } = usePrometheusQuery(
    `nodejs_heap_used_bytes{service=~"${svc}"} / 1024 / 1024`,
    range,
  );
  const { series: heapTotalSeries } = usePrometheusQuery(
    `nodejs_heap_size_total_bytes{service=~"${svc}"} / 1024 / 1024`,
    range,
  );
  const { series: rssSeries, loading: rssLoading } = usePrometheusQuery(
    `process_resident_memory_bytes{service=~"${svc}"} / 1024 / 1024`,
    range,
  );
  const { series: lagSeries, loading: lagLoading } = usePrometheusQuery(
    `nodejs_eventloop_lag_seconds{service=~"${svc}"} * 1000`,
    range,
  );
  const { series: gcSeries, loading: gcLoading } = usePrometheusQuery(
    `sum by (service) (rate(nodejs_gc_duration_seconds_sum{service=~"${svc}"}[5m]))`,
    range,
  );
  const { series: handlesSeries, loading: handlesLoading } = usePrometheusQuery(
    `nodejs_active_handles_total{service=~"${svc}"}`,
    range,
  );
  const { series: extSeries, loading: extLoading } = usePrometheusQuery(
    `nodejs_external_memory_bytes{service=~"${svc}"} / 1024 / 1024`,
    range,
  );

  const heapCombined = [
    ...heapUsedSeries.map((s) => ({ ...s, name: `used · ${s.name}` })),
    ...heapTotalSeries.map((s) => ({ ...s, name: `total · ${s.name}` })),
  ];

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
        }}
      >
        <ChartCard
          title="CPU Usage (%)"
          loading={cpuLoading}
          series={cpuSeries}
          unit="%"
          theme={theme}
          colors={["#ff5722", "#ff7043", "#ff8a65", "#ffab91"]}
          height={220}
        />
        <ChartCard
          title="Heap Used vs Total (MB)"
          loading={heapLoading}
          series={heapCombined}
          unit="MB"
          theme={theme}
          colors={[
            "#4caf50",
            "#81c784",
            "#2196f3",
            "#64b5f6",
            "#9c27b0",
            "#ba68c8",
          ]}
          height={220}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        <ChartCard
          title="RSS Memory (MB)"
          loading={rssLoading}
          series={rssSeries}
          unit="MB"
          theme={theme}
          colors={["#9c27b0", "#ba68c8", "#ce93d8"]}
        />
        <ChartCard
          title="Event Loop Lag (ms)"
          loading={lagLoading}
          series={lagSeries}
          unit="ms"
          theme={theme}
          colors={["#ff9800", "#ffb74d", "#ffd54f"]}
        />
        <ChartCard
          title="GC Duration Rate (s/s)"
          loading={gcLoading}
          series={gcSeries}
          unit="s/s"
          theme={theme}
          colors={["#00bcd4", "#4dd0e1", "#80deea"]}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
        }}
      >
        <ChartCard
          title="Active Handles"
          loading={handlesLoading}
          series={handlesSeries}
          unit="handles"
          theme={theme}
          colors={["#607d8b", "#90a4ae", "#b0bec5"]}
        />
        <ChartCard
          title="External Memory (MB)"
          loading={extLoading}
          series={extSeries}
          unit="MB"
          theme={theme}
          colors={["#795548", "#a1887f", "#bcaaa4"]}
        />
      </Box>
    </Box>
  );
}

export default React.memo(NodeMetrics);
