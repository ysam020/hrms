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

const SalaryDistributionBox = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-salary-distribution-by-department`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading salary distribution..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Salary Distribution by Department
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const chartOptions = {
    chart: {
      type: "boxPlot",
      fontFamily: "inherit",
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      boxPlot: {
        colors: {
          upper: "#4caf50",
          lower: "#2196f3",
        },
      },
    },
    xaxis: {
      categories: data.map((item) => item.department),
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
      },
    },
    yaxis: {
      title: {
        text: "Salary (₹)",
        style: {
          color: theme === "dark" ? "#fff" : "#666",
        },
      },
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
        formatter: function (val) {
          return "₹" + (val / 100000).toFixed(1) + "L";
        },
      },
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
    {
      name: "Salary Range",
      type: "boxPlot",
      data: data.map((item) => ({
        x: item.department,
        y: [
          item.minSalary,
          item.avgSalary - (item.avgSalary - item.minSalary) / 2,
          item.avgSalary,
          item.avgSalary + (item.maxSalary - item.avgSalary) / 2,
          item.maxSalary,
        ],
      })),
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Salary Distribution by Department
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Box plot showing salary ranges (min, quartiles, max)
        </Typography>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="boxPlot"
            height={400}
          />
        </Suspense>

        {/* Summary Stats */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {data.slice(0, 4).map((dept, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: "action.hover",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {dept.department}
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  ₹{(dept.avgSalary / 100000).toFixed(1)}L
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Avg • {dept.employeeCount} employees
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default React.memo(SalaryDistributionBox);
