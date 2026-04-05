import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import WorkIcon from "@mui/icons-material/Work";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const EmployeeDesignations = ({ theme }) => {
  const { data, loading } = useFetchData(
    "/get-employee-designations",
    "get",
    [],
  );

  const categories = data.map(
    (item) => item.designation || item._id || "Unknown",
  );
  const seriesData = data.map((item) => item.count || 0);

  const chartOptions = {
    chart: {
      type: "bar",
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
      background: "transparent",
      foreColor: theme === "dark" ? "#A5A9AB" : "#374151",
    },
    theme: {
      mode: theme === "dark" ? "dark" : "light",
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "60%",
        endingShape: "rounded",
        borderRadius: 6,
        dataLabels: {
          position: "top",
        },
      },
    },
    dataLabels: {
      enabled: true,
      offsetY: -20,
      style: {
        fontSize: "13px",
        fontWeight: 700,
        colors: ["#39a2cf"],
      },
      background: {
        enabled: false,
      },
      dropShadow: {
        enabled: true,
        top: 1,
        left: 1,
        blur: 2,
        opacity: 0.3,
      },
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: categories.map(() =>
            theme === "dark" ? "#A5A9AB" : "#374151",
          ),
          fontSize: "12px",
          fontWeight: 500,
        },
        rotate: -45,
        rotateAlways: categories.length > 5,
        trim: true,
        hideOverlappingLabels: true,
      },
      axisBorder: {
        show: true,
        color: theme === "dark" ? "#374151" : "#e5e7eb",
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: [theme === "dark" ? "#A5A9AB" : "#374151"],
          fontSize: "12px",
          fontWeight: 500,
        },
        formatter: (val) => Math.floor(val),
      },
      title: {
        text: "Number of Employees",
        style: {
          color: theme === "dark" ? "#A5A9AB" : "#64748b",
          fontSize: "13px",
          fontWeight: 600,
        },
      },
    },
    grid: {
      show: true,
      borderColor: theme === "dark" ? "#374151" : "#e5e7eb",
      strokeDashArray: 3,
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
      padding: {
        top: 0,
        right: 10,
        bottom: 0,
        left: 10,
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: theme === "dark" ? "dark" : "light",
        type: "vertical",
        shadeIntensity: theme === "dark" ? 0.3 : 0.2,
        gradientToColors: ["#6c5dfc"],
        inverseColors: false,
        opacityFrom: theme === "dark" ? 0.95 : 0.85,
        opacityTo: theme === "dark" ? 0.7 : 0.6,
        stops: [0, 100],
      },
    },
    colors: ["#39a2cf"],
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
          plotOptions: {
            bar: {
              columnWidth: "70%",
            },
          },
          dataLabels: {
            style: {
              fontSize: "11px",
            },
          },
          xaxis: {
            labels: {
              style: {
                fontSize: "11px",
              },
            },
          },
        },
      },
    ],
  };

  const chartSeries = [
    {
      name: "Employees",
      data: seriesData,
    },
  ];

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
        <WorkIcon
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
          No designation data available
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
          <WorkIcon
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
          Designation Distribution
        </Typography>
      </Box>

      <Box sx={{ position: "relative" }}>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={380}
          />
        </Suspense>
      </Box>
    </Paper>
  );
};

export default React.memo(EmployeeDesignations);
