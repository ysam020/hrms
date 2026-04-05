import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const CompensationBreakdown = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-compensation-breakdown`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading compensation data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.employeeCount) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Compensation Component Breakdown
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
      stacked: true,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        borderRadius: 4,
        dataLabels: {
          total: {
            enabled: true,
            offsetY: -5,
            style: {
              fontSize: "13px",
              fontWeight: 600,
              color: theme === "dark" ? "#fff" : "#000",
            },
            formatter: function (val) {
              return "₹" + (val / 100000).toFixed(1) + "L";
            },
          },
        },
      },
    },
    xaxis: {
      categories: ["Average Compensation"],
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    yaxis: {
      title: {
        text: "Amount (₹)",
        style: {
          color: theme === "dark" ? "#fff" : "#666",
        },
      },
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
        formatter: function (val) {
          return "₹" + (val / 1000).toFixed(0) + "K";
        },
      },
    },
    colors: ["#4caf50", "#2196f3", "#ff9800", "#f44336", "#9c27b0", "#00bcd4"],
    legend: {
      position: "top",
      horizontalAlign: "center",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val) {
          return "₹" + (val / 100000).toFixed(2) + "L";
        },
      },
    },
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
  };

  const series = [
    { name: "Basic Pay", data: [data.avgBasicPay || 0] },
    { name: "HRA", data: [data.avgHRA || 0] },
    { name: "Conveyance", data: [data.avgConveyance || 0] },
    { name: "PF", data: [data.avgPF || 0] },
    { name: "ESI", data: [data.avgESI || 0] },
    { name: "PT", data: [data.avgPT || 0] },
  ];

  const totalAvg = series.reduce((sum, s) => sum + (s.data[0] || 0), 0);

  return (
    <Card elevation={2}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Compensation Component Breakdown
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data.employeeCount} employees • Avg Total: ₹
              {(totalAvg / 100000).toFixed(2)}L
            </Typography>
          </Box>
        </Box>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="bar"
            height={350}
          />
        </Suspense>

        {/* Component Details */}
        <Grid container spacing={1} sx={{ mt: 1 }}>
          {series.map((component, index) => (
            <Grid item xs={4} sm={2} key={index}>
              <Box textAlign="center">
                <Typography variant="caption" color="text.secondary">
                  {component.name}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  ₹{((component.data[0] || 0) / 1000).toFixed(0)}K
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default React.memo(CompensationBreakdown);
