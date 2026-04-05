import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const JobStatusPie = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-job-openings-by-status`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading job openings..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Job Openings by Status
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const labels = data.map((item) => item._id);
  const series = data.map((item) => item.count);
  const total = series.reduce((a, b) => a + b, 0);

  const statusColors = {
    Active: "#4caf50",
    Closed: "#2196f3",
    "On Hold": "#ff9800",
  };

  const colors = labels.map((label) => statusColors[label] || "#9e9e9e");

  const chartOptions = {
    chart: {
      type: "pie",
      fontFamily: "inherit",
    },
    labels: labels,
    colors: colors,
    legend: {
      position: "bottom",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    dataLabels: {
      enabled: true,
      formatter: function (val, opts) {
        return opts.w.config.series[opts.seriesIndex];
      },
      style: {
        fontSize: "14px",
        fontWeight: 600,
        colors: ["#fff"],
      },
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val) {
          return val + " jobs";
        },
      },
    },
  };

  return (
    <Card elevation={2}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Job Openings by Status
          </Typography>
          <Chip label={`${total} total`} size="small" color="primary" />
        </Box>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="pie"
            height={350}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default React.memo(JobStatusPie);
