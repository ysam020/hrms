import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const LeaveTypeBar = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-leave-type-breakdown`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading leave type data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Leave Type Breakdown
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const categories = data.map((item) => item._id);
  const counts = data.map((item) => item.count);
  const totalDays = data.map((item) => item.totalDays);

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
        horizontal: true,
        barHeight: "25%",
        dataLabels: {
          position: "top",
        },
      },
    },
    dataLabels: {
      enabled: true,
      offsetX: 50,
      style: {
        fontSize: "12px",
        colors: [theme === "dark" ? "#fff" : "#000"],
      },
    },
    xaxis: {
      categories: categories,
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
          fontSize: "14px",
          fontWeight: 600,
        },
      },
    },
    colors: ["#4caf50", "#f44336"],
    legend: {
      position: "top",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val, { dataPointIndex, seriesIndex }) {
          return seriesIndex === 0 ? val + " applications" : val + " days";
        },
      },
    },
  };

  const series = [
    {
      name: "Applications",
      data: counts,
    },
    {
      name: "Total Days",
      data: totalDays,
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Leave Type Breakdown
        </Typography>

        <Suspense fallback={<LoadingState />}>
          <ReactApexChart options={chartOptions} series={series} type="bar" />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default React.memo(LeaveTypeBar);
