import React, { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import {
  usePrometheusQuery,
  usePrometheusInstant,
  type PrometheusRange,
} from "../hooks/usePrometheusQuery";

const ReactApexChart = lazy(() => import("react-apexcharts"));

const Loader = () => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
    <CircularProgress size={24} />
  </Box>
);

function fmtVal(val: number | undefined) {
  if (val == null || !isFinite(val)) return "0.00";
  return val.toFixed(2);
}

function buildOptions(theme: string, unit: string, title: string) {
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
    fill: { type: "gradient", gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
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
    title: {
      text: title,
      style: { color: isDark ? "#fff" : "#222", fontWeight: 600 },
    },
  };
}

function MetricCard({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: number | null;
  unit: string;
  color: string;
}) {
  return (
    <Card elevation={1} sx={{ textAlign: "center" }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={700} color={color}>
          {value !== null && !isNaN(value)
            ? value < 1
              ? value.toFixed(3)
              : value.toFixed(1)
            : "—"}
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

function HttpMetrics({ theme, range, service }: Props) {
  const svc = service || ".+";
  const { series: rateSeries, loading: rateLoading } = usePrometheusQuery(
    `sum by (service) (rate(http_requests_total{service=~"${svc}"}[5m]))`,
    range,
  );
  const { series: errorSeries, loading: errorLoading } = usePrometheusQuery(
    `100 * sum by (service) (rate(http_requests_total{service=~"${svc}",status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total{service=~"${svc}"}[5m]))`,
    range,
  );
  const { series: latSeries, loading: latLoading } = usePrometheusQuery(
    `histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_ms_bucket{service=~"${svc}"}[5m])))`,
    range,
  );
  const { series: p50Series } = usePrometheusQuery(
    `histogram_quantile(0.50, sum by (service, le) (rate(http_request_duration_ms_bucket{service=~"${svc}"}[5m])))`,
    range,
  );
  const { value: rps } = usePrometheusInstant(
    `sum(rate(http_requests_total{service=~"${svc}"}[5m]))`,
  );
  const { value: errPct } = usePrometheusInstant(
    `100 * sum(rate(http_requests_total{service=~"${svc}",status=~"5.."}[5m])) / sum(rate(http_requests_total{service=~"${svc}"}[5m]))`,
  );
  const { value: p95 } = usePrometheusInstant(
    `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket{service=~"${svc}"}[5m])))`,
  );

  const opts = buildOptions(theme, "", "");

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {/* Stat cards */}
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}
      >
        <MetricCard
          title="Request Rate"
          value={rps}
          unit="req/s"
          color="primary.main"
        />
        <MetricCard
          title="Error Rate"
          value={errPct}
          unit="%"
          color={errPct && errPct > 5 ? "error.main" : "success.main"}
        />
        <MetricCard
          title="p95 Latency"
          value={p95}
          unit="ms"
          color={p95 && p95 > 500 ? "warning.main" : "info.main"}
        />
      </Box>

      {/* Request rate */}
      <Card elevation={1}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Request Rate (req/s)
          </Typography>
          {rateLoading ? (
            <Loader />
          ) : (
            <Suspense fallback={<Loader />}>
              <ReactApexChart
                options={{ ...opts, ...buildOptions(theme, "req/s", "") }}
                series={rateSeries}
                type="area"
                height={220}
              />
            </Suspense>
          )}
        </CardContent>
      </Card>

      {/* Error rate + latency side by side */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
        }}
      >
        <Card elevation={1}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Error Rate (%)
            </Typography>
            {errorLoading ? (
              <Loader />
            ) : (
              <Suspense fallback={<Loader />}>
                <ReactApexChart
                  options={{
                    ...buildOptions(theme, "%", ""),
                    colors: ["#f44336", "#ff7961", "#e57373"],
                  }}
                  series={errorSeries}
                  type="area"
                  height={200}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>

        <Card elevation={1}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Latency — p50 / p95 (ms)
            </Typography>
            {latLoading ? (
              <Loader />
            ) : (
              <Suspense fallback={<Loader />}>
                <ReactApexChart
                  options={{
                    ...buildOptions(theme, "ms", ""),
                    colors: ["#2196f3", "#42a5f5", "#90caf9", "#64b5f6"],
                  }}
                  series={[
                    ...latSeries.map((s) => ({ ...s, name: `p95 ${s.name}` })),
                    ...p50Series.map((s) => ({ ...s, name: `p50 ${s.name}` })),
                  ]}
                  type="line"
                  height={200}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default React.memo(HttpMetrics);
