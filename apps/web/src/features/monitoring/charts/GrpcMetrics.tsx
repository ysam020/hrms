import React, { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import {
  usePrometheusQuery,
  usePrometheusInstant,
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

function chartOpts(theme: string, unit: string, type: "line" | "bar" = "line") {
  const isDark = theme === "dark";
  const textColor = isDark ? "#aaa" : "#666";
  const gridColor = isDark ? "#333" : "#e0e0e0";
  return {
    chart: {
      type,
      fontFamily: "inherit",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      background: "transparent",
      stacked: false,
    },
    dataLabels: { enabled: false },
    stroke:
      type === "line"
        ? { curve: "smooth" as const, width: 2 }
        : { show: false },
    plotOptions:
      type === "bar" ? { bar: { horizontal: false, columnWidth: "60%" } } : {},
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

// Stat card for a single instant value
function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <Card elevation={1} sx={{ textAlign: "center" }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={700} color="primary">
          {value != null && isFinite(value) ? value.toFixed(2) : "—"}
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            ml={0.5}
          >
            {unit}
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

interface Props {
  theme: string;
  range: PrometheusRange;
  service: string;
}

function GrpcMetrics({ theme, range, service }: Props) {
  const svc = service || ".+";

  // Rate grouped by service — using increase() so services with any historical traffic appear
  const { series: rateSeries, loading: rateLoading } = usePrometheusQuery(
    `sum by (service) (rate(grpc_requests_total{service=~"${svc}"}[2m]))`,
    range,
  );

  // Rate grouped by method — most useful for debugging
  const { series: methodSeries, loading: methodLoading } = usePrometheusQuery(
    `sum by (service, method) (rate(grpc_requests_total{service=~"${svc}"}[2m]))`,
    range,
  );

  // Latency p95 + p50
  const { series: p95Series, loading: latLoading } = usePrometheusQuery(
    `histogram_quantile(0.95, sum by (service, le) (rate(grpc_request_duration_ms_bucket{service=~"${svc}"}[2m])))`,
    range,
  );
  const { series: p50Series } = usePrometheusQuery(
    `histogram_quantile(0.50, sum by (service, le) (rate(grpc_request_duration_ms_bucket{service=~"${svc}"}[2m])))`,
    range,
  );

  // Instant stats
  const { value: totalRps } = usePrometheusInstant(
    `sum(rate(grpc_requests_total{service=~"${svc}"}[2m]))`,
  );
  const { value: p95Instant } = usePrometheusInstant(
    `histogram_quantile(0.95, sum by (le) (rate(grpc_request_duration_ms_bucket{service=~"${svc}"}[2m])))`,
  );

  const latencySeries = [
    ...p95Series.map((s) => ({ ...s, name: `p95 · ${s.name}` })),
    ...p50Series.map((s) => ({ ...s, name: `p50 · ${s.name}` })),
  ];

  const noData = (series: any[]) =>
    series.length === 0 || series.every((s) => s.data.length === 0);

  const empty = (msg: string) => (
    <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
      {msg}
    </Typography>
  );

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {/* Stat strip */}
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}
      >
        <StatCard label="gRPC Request Rate" value={totalRps} unit="req/s" />
        <StatCard label="p95 gRPC Latency" value={p95Instant} unit="ms" />
      </Box>

      {/* Rate by service */}
      <Card elevation={1}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Request Rate by Service (req/s)
          </Typography>
          {rateLoading ? (
            <Loader />
          ) : noData(rateSeries) ? (
            empty("No gRPC traffic in this time window.")
          ) : (
            <Suspense fallback={<Loader />}>
              <ReactApexChart
                options={{
                  ...chartOpts(theme, "req/s"),
                  colors: [
                    "#2196f3",
                    "#4caf50",
                    "#ff9800",
                    "#9c27b0",
                    "#f44336",
                    "#00bcd4",
                    "#ff5722",
                    "#795548",
                    "#607d8b",
                    "#e91e63",
                    "#8bc34a",
                    "#ffc107",
                  ],
                }}
                series={rateSeries}
                type="line"
                height={240}
              />
            </Suspense>
          )}
        </CardContent>
      </Card>

      {/* Rate by method */}
      <Card elevation={1}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Request Rate by Method (req/s)
          </Typography>
          {methodLoading ? (
            <Loader />
          ) : noData(methodSeries) ? (
            empty("No gRPC traffic in this time window.")
          ) : (
            <Suspense fallback={<Loader />}>
              <ReactApexChart
                options={{
                  ...chartOpts(theme, "req/s"),
                  legend: {
                    position: "bottom" as const,
                    labels: { colors: theme === "dark" ? "#ccc" : "#333" },
                  },
                }}
                series={methodSeries}
                type="line"
                height={260}
              />
            </Suspense>
          )}
        </CardContent>
      </Card>

      {/* Latency */}
      <Card elevation={1}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Latency — p50 / p95 (ms)
          </Typography>
          {latLoading ? (
            <Loader />
          ) : noData(latencySeries) ? (
            empty("No latency data in this time window.")
          ) : (
            <Suspense fallback={<Loader />}>
              <ReactApexChart
                options={{
                  ...chartOpts(theme, "ms"),
                  colors: [
                    "#f44336",
                    "#ef9a9a",
                    "#ff5722",
                    "#ffab91",
                    "#4caf50",
                    "#a5d6a7",
                    "#2196f3",
                    "#90caf9",
                  ],
                }}
                series={latencySeries}
                type="line"
                height={240}
              />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default React.memo(GrpcMetrics);
