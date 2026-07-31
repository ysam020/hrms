import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import WorkIcon from "@mui/icons-material/Work";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const ApplicationsByRole = ({ theme }) => {
  const { data, loading } = useFetchData(
    "/get-applications-by-job-role",
    "get",
    [],
  );

  const categories = data.map((item) => item.jobTitle || "Unknown");
  const totalApplicationsData = data.map((item) => item.totalApplications || 0);
  const interviewingData = data.map((item) => item.interviewing || 0);
  const hiredData = data.map((item) => item.hired || 0);
  const rejectedData = data.map((item) => item.rejected || 0);

  // Calculate dynamic height based on number of categories
  const calculateHeight = () => {
    const baseHeight = 400;
    const heightPerCategory = 60;
    return Math.max(baseHeight, categories.length * heightPerCategory);
  };

  const chartOptions = {
    chart: {
      type: "bar",
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      toolbar: {
        show: false,
      },
      stacked: false,
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
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        barHeight: "85%",
        dataLabels: {
          position: "top",
        },
        columnWidth: "85%",
      },
    },
    dataLabels: {
      enabled: true,
      offsetX: 8,
      style: {
        fontSize: "12px",
        fontWeight: 600,
        colors: [theme === "dark" ? "#fff" : "#374151"],
      },
      formatter: (val) => val || 0,
    },
    colors: ["#2196f3", "#ff9800", "#4caf50", "#f44336"],
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: [theme === "dark" ? "#A5A9AB" : "#374151"],
          fontSize: "12px",
          fontWeight: 500,
        },
      },
      axisBorder: {
        show: true,
        color: theme === "dark" ? "#374151" : "#e5e7eb",
      },
      axisTicks: {
        show: false,
      },
      title: {
        text: "Number of Applications",
        style: {
          color: theme === "dark" ? "#A5A9AB" : "#64748b",
          fontSize: "13px",
          fontWeight: 600,
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: categories.map(() =>
            theme === "dark" ? "#A5A9AB" : "#374151",
          ),
          fontSize: "13px",
          fontWeight: 500,
        },
        maxWidth: 180,
        offsetX: -5,
      },
    },
    grid: {
      show: true,
      borderColor: theme === "dark" ? "#374151" : "#e5e7eb",
      strokeDashArray: 3,
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: false,
        },
      },
      padding: {
        top: 10,
        right: 25,
        bottom: 10,
        left: 15,
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
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
        vertical: 8,
      },
      offsetY: 0,
    },
    tooltip: {
      enabled: true,
      theme: theme === "dark" ? "dark" : "light",
      style: {
        fontSize: "13px",
      },
      shared: true,
      intersect: false,
      y: {
        formatter: (val) => `${val || 0} applications`,
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
              barHeight: "75%",
            },
          },
          dataLabels: {
            style: {
              fontSize: "10px",
            },
            offsetX: 5,
          },
          legend: {
            position: "bottom",
            fontSize: "12px",
          },
          yaxis: {
            labels: {
              maxWidth: 120,
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
      name: "Total Applications",
      data: totalApplicationsData,
    },
    {
      name: "Interviewing",
      data: interviewingData,
    },
    {
      name: "Hired",
      data: hiredData,
    },
    {
      name: "Rejected",
      data: rejectedData,
    },
  ];

  if (loading) {
    return <LoadingState />;
  }

  if (!data || data.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: "10px",
          backgroundColor: theme === "dark" ? "#212e35" : "#fff",
          boxShadow: "20px 50px 50px 4px rgba(0, 0, 0, 0.05)",
          height: "100%",
          minHeight: 450,
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
            color: theme === "dark" ? "#9ca3af" : "#6b7280",
            textAlign: "center",
          }}
        >
          No applications data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: "10px",
        backgroundColor: theme === "dark" ? "#212e35" : "#fff",
        boxShadow: "20px 50px 50px 4px rgba(0, 0, 0, 0.05)",
        height: "100%",
        minHeight: calculateHeight() + 100, // Dynamic min height
      }}
    >
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            background: "linear-gradient(135deg, #2196f3 0%, #9c27b0 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WorkIcon sx={{ fontSize: 18, color: "#fff" }} />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: theme === "dark" ? "#fff" : "#1e293b",
            fontSize: "18px",
          }}
        >
          Applications by Job Role (Top 10)
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={calculateHeight()} // Dynamic height
          />
        </Suspense>
      </Box>
    </Paper>
  );
};

export default React.memo(ApplicationsByRole);
