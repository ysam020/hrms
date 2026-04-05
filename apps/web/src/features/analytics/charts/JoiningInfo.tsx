import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const JoiningInfo = ({ theme }) => {
  const { data, loading } = useFetchData("/get-joining-data", "get", []);

  const safeData = Array.isArray(data) ? data : [];
  const labels = safeData.map((item) => item.formattedDate);
  const seriesData = safeData.map((item) => item.count);

  const chartOptions = {
    chart: {
      type: "line",
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
      background: "transparent",
      foreColor: theme === "dark" ? "#A5A9AB" : "#374151",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 800,
      },
    },
    theme: {
      mode: theme === "dark" ? "dark" : "light",
    },
    stroke: {
      curve: "smooth",
      width: 3,
      lineCap: "round",
    },
    colors: ["#39a2cf"],
    fill: {
      type: "gradient",
      gradient: {
        shade: theme === "dark" ? "dark" : "light",
        type: "vertical",
        shadeIntensity: theme === "dark" ? 0.5 : 0.3,
        gradientToColors: ["#6c5dfc"],
        inverseColors: false,
        opacityFrom: theme === "dark" ? 0.4 : 0.3,
        opacityTo: theme === "dark" ? 0.1 : 0.05,
        stops: [0, 90, 100],
      },
    },
    dataLabels: {
      enabled: false,
    },
    markers: {
      size: 5,
      colors: [theme === "dark" ? "#212e35" : "#fff"],
      strokeColors: "#39a2cf",
      strokeWidth: 2,
      hover: {
        size: 7,
      },
    },
    xaxis: {
      categories: labels,
      labels: {
        style: {
          colors: labels.map(() => (theme === "dark" ? "#A5A9AB" : "#374151")),
          fontSize: "12px",
          fontWeight: 500,
        },
        rotate: -45,
        rotateAlways: labels.length > 8,
        trim: true,
      },
      axisBorder: {
        show: true,
        color: theme === "dark" ? "#374151" : "#e5e7eb",
      },
      axisTicks: {
        show: false,
      },
      tooltip: {
        enabled: false,
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
        text: "Number of Joinings",
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
    tooltip: {
      enabled: true,
      theme: theme === "dark" ? "dark" : "light",
      style: {
        fontSize: "13px",
      },
      x: {
        show: true,
      },
      y: {
        formatter: (val) => `${val} joinings`,
        title: {
          formatter: () => "",
        },
      },
      marker: {
        show: true,
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
          stroke: {
            width: 2,
          },
          markers: {
            size: 4,
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
      name: "Joinings",
      data: seriesData,
    },
  ];

  if (loading) {
    return <LoadingState />;
  }

  if (safeData.length === 0) {
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
        <TrendingUpIcon
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
          No joining data available
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
          <TrendingUpIcon
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
          Employee Joinings Trend
        </Typography>
      </Box>

      <Box sx={{ position: "relative" }}>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="line"
            height={380}
          />
        </Suspense>
      </Box>
    </Paper>
  );
};

export default React.memo(JoiningInfo);
