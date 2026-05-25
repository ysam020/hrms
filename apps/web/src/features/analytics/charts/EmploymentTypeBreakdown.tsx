import { Suspense, lazy, memo, useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const EmploymentTypeBreakdown = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-employment-type-breakdown`,
    "get",
    [],
  );

  const series = useMemo(() => {
    const wfh = data && Number.isFinite(data.wfhCount) ? data.wfhCount : 0;
    const office =
      data && Number.isFinite(data.officeCount) ? data.officeCount : 0;
    return [wfh, office];
  }, [data]);

  const labels = useMemo(() => ["Work From Home", "Office"], []);

  const chartOptions = useMemo(() => {
    return {
      chart: {
        type: "pie",
        fontFamily: "inherit",
      },
      labels,
      colors: ["#9c27b0", "#2196f3"],
      legend: {
        position: "bottom",
        labels: {
          colors: theme === "dark" ? "#fff" : "#000",
        },
      },
      dataLabels: {
        enabled: true,
        formatter: function (val) {
          const safeVal = typeof val === "number" ? val : 0;
          return safeVal.toFixed(1) + "%";
        },
        style: {
          fontSize: "12px",
          colors: ["#fff"],
        },
      },
      tooltip: {
        theme: theme === "dark" ? "dark" : "light",
        y: {
          formatter: function (_val, opts) {
            try {
              const idx = opts?.seriesIndex ?? 0;
              const count = series?.[idx] ?? 0;
              return `${count} employees`;
            } catch (e) {
              return String(_val);
            }
          },
        },
      },
    };
  }, [labels, series, theme]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading employment type data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.totalEmployees) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Employment Type Breakdown
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Employment Type Breakdown
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Work location distribution
        </Typography>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="pie"
            height={280}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default memo(EmploymentTypeBreakdown);
