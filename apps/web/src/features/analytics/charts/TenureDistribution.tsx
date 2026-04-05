import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const TenureDistribution = ({ theme }) => {
  const { data, loading } = useFetchData(`/get-tenure-distribution`, "get", []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading tenure data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tenure Distribution
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const chartOptions = {
    chart: {
      type: "bar",
      fontFamily: "inherit",
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "70%",
        distributed: true,
        dataLabels: {
          position: "top",
        },
      },
    },
    dataLabels: {
      enabled: true,
      offsetY: -20,
      style: {
        fontSize: "12px",
        colors: [theme === "dark" ? "#fff" : "#000"],
      },
    },
    xaxis: {
      categories: data.map((item) => item._id),
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      title: {
        text: "Number of Employees",
        style: {
          color: theme === "dark" ? "#fff" : "#666",
        },
      },
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    colors: ["#4caf50", "#2196f3", "#ff9800", "#f44336", "#9c27b0"],
    legend: {
      show: false,
    },
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val) {
          return val + " employees";
        },
      },
    },
  };

  const series = [
    {
      name: "Employees",
      data: data.map((item) => item.count),
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Tenure Distribution
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Employee distribution by years of service
        </Typography>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="bar"
            height={350}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default React.memo(TenureDistribution);
