import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import PeopleIcon from "@mui/icons-material/People";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const EmployeeDepartments = ({ theme }) => {
  const { data, loading } = useFetchData(
    "/get-employee-departments",
    "get",
    [],
  );

  const labels = data.map((item) => item._id);
  const seriesData = data.map((item) => Number(item.count));
  const totalEmployees = seriesData.reduce((sum, val) => sum + val, 0);

  const chartOptions = {
    chart: {
      type: "donut",
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      toolbar: {
        show: false,
      },
      background: "transparent",
      foreColor: theme === "dark" ? "#A5A9AB" : "#374151",
    },
    theme: {
      mode: theme === "dark" ? "dark" : "light",
    },
    plotOptions: {
      pie: {
        startAngle: -90,
        endAngle: 270,
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: "14px",
              fontWeight: 600,
              color: theme === "dark" ? "#A5A9AB" : "#374151",
            },
            value: {
              show: true,
              fontSize: "24px",
              fontWeight: 700,
              color: theme === "dark" ? "#fff" : "#111827",
              formatter: (val) => val,
            },
            total: {
              show: true,
              label: "Total",
              fontSize: "14px",
              fontWeight: 600,
              color: theme === "dark" ? "#A5A9AB" : "#64748b",
              formatter: () => totalEmployees,
            },
          },
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: theme === "dark" ? "dark" : "light",
        type: "horizontal",
        shadeIntensity: 0.5,
        gradientToColors: [
          "#6bb4d6",
          "#8975fd",
          "#81c784",
          "#ffb74d",
          "#e57373",
          "#ba68c8",
        ],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 0.85,
        stops: [0, 100],
      },
    },
    labels: labels,
    legend: {
      show: true,
      position: "bottom",
      horizontalAlign: "center",
      fontSize: "13px",
      fontWeight: 500,
      labels: {
        colors: theme === "dark" ? "#A5A9AB" : "#374151",
      },
      markers: {
        width: 10,
        height: 10,
        radius: 3,
      },
      itemMargin: {
        horizontal: 12,
        vertical: 6,
      },
    },
    tooltip: {
      enabled: true,
      theme: theme === "dark" ? "dark" : "light",
      style: {
        fontSize: "13px",
      },
      y: {
        formatter: (val) => `${val} employees`,
      },
    },
    stroke: {
      show: true,
      width: 2,
      colors: [theme === "dark" ? "#212e35" : "#fff"],
    },
    colors: ["#39a2cf", "#6c5dfc", "#4caf50", "#ff9800", "#f44336", "#9c27b0"],
    states: {
      hover: {
        filter: {
          type: theme === "dark" ? "lighten" : "darken",
          value: theme === "dark" ? 0.1 : 0.05,
        },
      },
      active: {
        filter: {
          type: theme === "dark" ? "lighten" : "darken",
          value: theme === "dark" ? 0.2 : 0.1,
        },
      },
    },
    responsive: [
      {
        breakpoint: 768,
        options: {
          chart: {
            height: 320,
          },
          legend: {
            position: "bottom",
            fontSize: "12px",
          },
        },
      },
    ],
  };

  if (loading) {
    return <LoadingState />;
  }

  if (data.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: "10px",
          backgroundColor: theme === "dark" ? "#212e35" : "#fff",
          boxShadow: "20px 50px 50px 4px rgba(0, 0, 0, 0.05)",
          height: "100%",
          minHeight: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PeopleIcon
          sx={{
            fontSize: 64,
            color: theme === "dark" ? "#374151" : "#e5e7eb",
            mb: 2,
          }}
        />
        <Typography
          variant="body1"
          sx={{
            color: theme === "dark" ? "#A5A9AB" : "#64748b",
            fontWeight: 500,
          }}
        >
          No department data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: "10px",
        backgroundColor: theme === "dark" ? "#212e35" : "#fff",
        boxShadow: "20px 50px 50px 4px rgba(0, 0, 0, 0.05)",
        height: "100%",
      }}
    >
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: "8px",
            backgroundColor: theme === "dark" ? "#1c262a" : "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PeopleIcon
            sx={{
              fontSize: 24,
              color: "#39a2cf",
            }}
          />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            fontSize: { xs: "16px", sm: "18px" },
            color: theme === "dark" ? "#fff" : "#111827",
            letterSpacing: "-0.01em",
          }}
        >
          Department Distribution
        </Typography>
      </Box>

      <Box sx={{ position: "relative" }}>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={seriesData}
            type="donut"
            height={350}
          />
        </Suspense>
      </Box>
    </Paper>
  );
};

export default React.memo(EmployeeDepartments);
