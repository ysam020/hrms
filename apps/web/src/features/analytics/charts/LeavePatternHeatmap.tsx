import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const LeavePatternHeatmap = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-monthly-leave-patterns`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading leave patterns..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Monthly Leave Patterns
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  // API returns [{ month: "YYYY-MM", count }]
  const series = [
    {
      name: "Leave Applications",
      data: data.map((item) => ({
        x: item.month || "",
        y: item.count || 0,
      })),
    },
  ];

  const maxValue = Math.max(...data.map((item) => item.count || 0), 1);

  const chartOptions = {
    chart: {
      type: "heatmap",
      fontFamily: "inherit",
      toolbar: {
        show: false,
      },
    },
    dataLabels: {
      enabled: true,
      style: {
        colors: ["#fff"],
        fontSize: "12px",
        fontWeight: 600,
      },
    },
    colors: ["#2196f3"],
    xaxis: {
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 4,
        colorScale: {
          ranges: [
            {
              from: 0,
              to: maxValue * 0.3,
              color: "#4caf50",
              name: "Low",
            },
            {
              from: maxValue * 0.3,
              to: maxValue * 0.7,
              color: "#ff9800",
              name: "Medium",
            },
            {
              from: maxValue * 0.7,
              to: maxValue,
              color: "#f44336",
              name: "High",
            },
          ],
        },
      },
    },
    legend: {
      show: true,
      position: "bottom",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val) {
          return val + " days";
        },
      },
    },
  };

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Monthly Leave Patterns (Heat Map)
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Leave density by month and type
        </Typography>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="heatmap"
            height={200}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default React.memo(LeavePatternHeatmap);
