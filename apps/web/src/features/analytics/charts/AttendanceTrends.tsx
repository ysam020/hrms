import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import SafeApexChart from "@web/shared/components/SafeApexChart";

const AttendanceTrends = ({ theme }) => {
  const { data, loading } = useFetchData(`/get-attendance-trends`, "get", []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading attendance trends..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Attendance Trends
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const categories = data.map((item) =>
    item._id
      ? `${item._id.year}-${String(item._id.month).padStart(2, "0")}`
      : "",
  );
  const attendanceRates = data.map((item) =>
    item.attendanceRate != null
      ? parseFloat(item.attendanceRate.toFixed(1))
      : 0,
  );
  const avgHours = data.map((item) => item.avgWorkingHours ?? 0);

  const chartOptions = {
    chart: {
      type: "area",
      fontFamily: "inherit",
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
      width: [3, 3],
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    yaxis: [
      {
        title: {
          text: "Attendance Rate (%)",
          style: {
            color: theme === "dark" ? "#fff" : "#666",
          },
        },
        labels: {
          style: {
            colors: theme === "dark" ? "#fff" : "#666",
          },
          formatter: function (val) {
            return val.toFixed(0) + "%";
          },
        },
        min: 0,
        max: 100,
      },
      {
        opposite: true,
        title: {
          text: "Avg Working Hours",
          style: {
            color: theme === "dark" ? "#fff" : "#666",
          },
        },
        labels: {
          style: {
            colors: theme === "dark" ? "#fff" : "#666",
          },
          formatter: function (val) {
            return val.toFixed(1) + "h";
          },
        },
      },
    ],
    colors: ["#2196f3", "#4caf50"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.2,
        stops: [0, 90, 100],
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      shared: true,
      intersect: false,
    },
  };

  const series = [
    {
      name: "Attendance Rate",
      type: "area",
      data: attendanceRates,
    },
    {
      name: "Avg Working Hours",
      type: "line",
      data: avgHours,
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Attendance Trends Over Time
          </Typography>
        </Box>
        <SafeApexChart
          options={chartOptions}
          series={series}
          type="area"
          height={350}
        />
      </CardContent>
    </Card>
  );
};

export default React.memo(AttendanceTrends);
