import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import { lazy, Suspense } from "react";
const ReactApexChart = lazy(() => import("react-apexcharts"));

const SalaryByDesignation = ({ theme }) => {
  const { data, loading } = useFetchData(
    `/get-average-salary-by-designation`,
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading salary by designation..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Average Salary by Designation
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  // Sort by average salary descending
  const sortedData = [...data].sort((a, b) => b.avgSalary - a.avgSalary);

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
        horizontal: true,
        borderRadius: 4,
        dataLabels: {
          position: "top",
        },
      },
    },
    dataLabels: {
      enabled: true,
      offsetX: 50,
      style: {
        fontSize: "11px",
        colors: [theme === "dark" ? "#fff" : "#000"],
      },
      formatter: function (val) {
        return "₹" + (val / 100000).toFixed(1) + "L";
      },
    },
    xaxis: {
      categories: sortedData.map((item) => item.designation),
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
        formatter: function (val) {
          return "₹" + (val / 100000).toFixed(0) + "L";
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
          fontSize: "12px",
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
          const item = sortedData[opts.dataPointIndex];
          return `Avg: ₹${(val / 100000).toFixed(2)}L\nMin: ₹${(
            item.minSalary / 100000
          ).toFixed(2)}L\nMax: ₹${(item.maxSalary / 100000).toFixed(
            2,
          )}L\nEmployees: ${item.employeeCount}`;
        },
      },
    },
  };

  const series = [
    {
      name: "Average Salary",
      data: sortedData.map((item) => item.avgSalary),
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Average Salary by Designation
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Sorted by average salary (highest to lowest)
        </Typography>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="bar"
            height={Math.max(350, sortedData.length * 40)}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
};

export default React.memo(SalaryByDesignation);
