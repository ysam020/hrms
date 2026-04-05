import { useEffect, useState } from "react";
import { lazy, Suspense } from "react";
import LoadingState from "./LoadingState";
const ReactApexChart = lazy(() => import("react-apexcharts"));

function sanitizeSeries(series: any) {
  if (!Array.isArray(series)) return series;
  return series.map((s) => {
    if (s === null || s === undefined) return { name: "", data: [] };
    if (typeof s === "number") return isFinite(s) ? s : 0;
    if (!Array.isArray(s.data)) return s;
    return {
      ...s,
      data: s.data
        .filter((d: any) => d !== undefined && d !== null)
        .map((d: any) => {
          if (typeof d === "number") return isFinite(d) ? d : 0;
          if (typeof d === "object") {
            return { ...d, y: d.y !== undefined && isFinite(d.y) ? d.y : 0 };
          }
          return 0;
        }),
    };
  });
}

export default function SafeApexChart(props: any) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          height: props.height || 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.6,
        }}
      >
        <span>Loading chart...</span>
      </div>
    );
  }

  const safeSeries = sanitizeSeries(props.series);

  return (
    <Suspense fallback={<LoadingState />}>
      <ReactApexChart {...props} series={safeSeries} />
    </Suspense>
  );
}
