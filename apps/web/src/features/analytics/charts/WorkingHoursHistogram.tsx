import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import SafeApexChart from "@web/shared/components/SafeApexChart";

const WorkingHoursHistogram = ({ theme }) => {
  const { data, loading } = useFetchData(
    "/get-working-hours-distribution",
    "get",
    [],
  );

  const safeData = Array.isArray(data) ? data : [];
  const categories = safeData.map((item) => item._id || "");
  const seriesData = safeData.map((item) => item.count || 0);

  const chartOptions = {
    chart: {
      type: "bar",
      fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
      toolbar: {
        show: false,
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
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "30%",
        distributed: false,
        dataLabels: {
          position: "top",
        },
      },
    },
    dataLabels: {
      enabled: true,
      offsetY: -25,
      style: {
        fontSize: "12px",
        fontWeight: 600,
        colors: [theme === "dark" ? "#A5A9AB" : "#374151"],
      },
      formatter: (val) => val,
    },
    colors: ["#4caf50"],
    fill: {
      type: "gradient",
      gradient: {
        shade: theme === "dark" ? "dark" : "light",
        type: "vertical",
        shadeIntensity: 0.3,
        gradientToColors: ["#81c784"],
        inverseColors: false,
        opacityFrom: 0.85,
        opacityTo: 0.75,
        stops: [0, 100],
      },
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: safeData.map(() =>
            theme === "dark" ? "#A5A9AB" : "#374151",
          ),
          fontSize: "12px",
          fontWeight: 500,
        },
        rotate: 0,
      },
      axisBorder: {
        show: true,
        color: theme === "dark" ? "#374151" : "#e5e7eb",
      },
      axisTicks: {
        show: false,
      },
      title: {
        text: "Working Hours Range",
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
    tooltip: {
      enabled: true,
      theme: theme === "dark" ? "dark" : "light",
      style: {
        fontSize: "13px",
      },
      y: {
        formatter: (val) => `${val} employees`,
        title: {
          formatter: (seriesName) => seriesName + ":",
        },
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
              columnWidth: "85%",
            },
          },
          dataLabels: {
            offsetY: -20,
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
        <AccessTimeIcon
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
          No working hours data available
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
        minHeight: 400,
      }}
    >
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "8px",
            background: "linear-gradient(135deg, #4caf50 0%, #81c784 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AccessTimeIcon sx={{ fontSize: 18, color: "#fff" }} />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: theme === "dark" ? "#fff" : "#1e293b",
            fontSize: "18px",
          }}
        >
          Working Hours Distribution
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <SafeApexChart options={chartOptions} series={chartSeries} type="bar" />
      </Box>
    </Paper>
  );
};

export default React.memo(WorkingHoursHistogram);
