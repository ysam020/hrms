import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import FilterListIcon from "@mui/icons-material/FilterList";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const HiringFunnel = ({ theme }) => {
  const { data, loading } = useFetchData("/get-hiring-funnel", "get", []);

  // Transform data for funnel chart from object to array format
  const funnelData =
    data.applied !== undefined
      ? [
          { stage: "Applied", count: data.applied || 0, rate: null },
          {
            stage: "Shortlisted",
            count: data.shortlisted || 0,
            rate: data.shortlistRate || 0,
          },
          {
            stage: "Interviewed",
            count: data.interviewed || 0,
            rate: data.interviewRate || 0,
          },
          {
            stage: "Offered",
            count: data.offered || 0,
            rate: data.offerRate || 0,
          },
          { stage: "Hired", count: data.hired || 0, rate: data.hireRate || 0 },
        ]
      : [];

  const seriesData = funnelData.map((item) => item.count);
  const categories = funnelData.map((item) => item.stage);

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
        borderRadius: 0,
        horizontal: true,
        distributed: true,
        barHeight: "80%",
        isFunnel: true,
        dataLabels: {
          position: "center",
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: function (val, opts) {
        return opts.w.globals.labels[opts.dataPointIndex] + ": " + val;
      },
      dropShadow: {
        enabled: false,
      },
      style: {
        fontSize: "14px",
        fontWeight: 600,
        colors: ["#fff"],
      },
    },
    colors: ["#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#f44336"],
    xaxis: {
      categories: categories,
      labels: {
        show: false,
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      labels: {
        show: false,
      },
    },
    grid: {
      show: false,
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
    },
    legend: {
      show: false,
    },
    tooltip: {
      enabled: true,
      theme: theme === "dark" ? "dark" : "light",
      style: {
        fontSize: "13px",
      },
      y: {
        formatter: (val) => `${val} applications`,
        title: {
          formatter: (seriesName) => "",
        },
      },
    },
    states: {
      hover: {
        filter: {
          type: theme === "dark" ? "lighten" : "darken",
          value: theme === "dark" ? 0.15 : 0.05,
        },
      },
      active: {
        filter: {
          type: theme === "dark" ? "lighten" : "darken",
          value: theme === "dark" ? 0.25 : 0.1,
        },
      },
    },
    responsive: [
      {
        breakpoint: 768,
        options: {
          plotOptions: {
            bar: {
              barHeight: "70%",
            },
          },
          dataLabels: {
            style: {
              fontSize: "12px",
            },
          },
        },
      },
    ],
  };

  const chartSeries = [
    {
      name: "Applications",
      data: seriesData,
    },
  ];

  if (loading) {
    return <LoadingState />;
  }

  if (data.applied === undefined || funnelData.length === 0) {
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
        <FilterListIcon
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
          No hiring funnel data available
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
        minHeight: 450,
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
          <FilterListIcon sx={{ fontSize: 18, color: "#fff" }} />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: theme === "dark" ? "#fff" : "#1e293b",
            fontSize: "18px",
          }}
        >
          Hiring Funnel
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={350}
          />
        </Suspense>
      </Box>

      {/* Conversion Rates */}
      <Box
        sx={{
          mt: 3,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 2,
        }}
      >
        {funnelData.map((item, index) => (
          <Box
            key={index}
            sx={{
              textAlign: "center",
              p: 1.5,
              borderRadius: "8px",
              backgroundColor: theme === "dark" ? "#1a252c" : "#f8fafc",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: theme === "dark" ? "#9ca3af" : "#64748b",
                fontSize: "11px",
                display: "block",
                mb: 0.5,
              }}
            >
              {item.stage}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: theme === "dark" ? "#fff" : "#1e293b",
                fontWeight: 600,
                fontSize: "16px",
              }}
            >
              {item.count}
            </Typography>
            {item.rate !== null && item.rate > 0 && (
              <Typography
                variant="caption"
                sx={{
                  color: theme === "dark" ? "#4caf50" : "#22c55e",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {item.rate}% conversion
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default React.memo(HiringFunnel);
