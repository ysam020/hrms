import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const SalaryBandsHistogram = ({ theme }) => {
  const { data, loading } = useFetchData(`/get-salary-bands`, "get", []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading salary bands..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Salary Bands Distribution
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
        borderRadius: 4,
        columnWidth: "70%",
        dataLabels: {
          position: "top",
        },
        distributed: false,
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
      categories: data.map((item) => item.range),
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
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
    colors: ["#2196f3"],
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      y: {
        formatter: function (val, opts) {
          const item = data[opts.dataPointIndex];
          return `${val} employees\nAvg: ₹${(item.avgSalary / 100000).toFixed(
            2,
          )}L`;
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

  const totalEmployees = data.reduce((sum, item) => sum + item.count, 0);
  const avgSalaryOverall =
    data.reduce((sum, item) => sum + item.avgSalary * item.count, 0) /
    totalEmployees;

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
              Salary Bands Distribution
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Employee count across salary ranges • Overall Avg: ₹
              {(avgSalaryOverall / 100000).toFixed(2)}L
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

        {/* Summary Stats */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
            mt: 2,
            pt: 2,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">
              Most Common Band
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {
                data.reduce((max, item) =>
                  item.count > max.count ? item : max,
                ).range
              }
            </Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">
              Total Employees
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {totalEmployees}
            </Typography>
          </Box>
          <Box textAlign="center">
            <Typography variant="caption" color="text.secondary">
              Bands Occupied
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {data.length} / 8
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default React.memo(SalaryBandsHistogram);
