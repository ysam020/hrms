import React from "react";
import ReactApexChart from "react-apexcharts";
import apiClient from "../../config/axiosConfig";
import { CircularProgress, Box, Typography } from "@mui/material";

const EmployeeDepartments = (props) => {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true); // Track loading state

  React.useEffect(() => {
    let isMounted = true; // Flag to track if component is mounted

    async function getData() {
      try {
        const res = await apiClient(`/get-employee-departments`);
        // Only update state if component is still mounted
        if (isMounted) {
          setData(res.data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        // Only update loading state if component is still mounted
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    getData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []);

  const labels = data.map((item) => item._id);
  const seriesData = data.map((item) => Number(item.count));

  const chartOptions = {
    chart: {
      type: "donut",
    },
    plotOptions: {
      pie: {
        startAngle: -90,
        endAngle: 270,
      },
    },
    fill: {
      type: "gradient",
    },
    labels: labels,
    title: {
      text: "Employee Distribution by Department",
      align: "left",
      style: {
        fontSize: "20px",
        color: props.theme === "dark" ? "#fff" : "#000",
      },
    },
    legend: {
      position: "right",
      labels: {
        colors: props.theme === "dark" ? "#fff" : "#000",
        useSeriesColors: false,
      },
    },
    tooltip: {
      y: {
        formatter: (val) => `${val} employees`,
      },
    },
  };

  return (
    <div className="dashboard-container">
      {loading ? (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height={400}
        >
          <CircularProgress />
        </Box>
      ) : data.length === 0 ? (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height={400}
        >
          <Typography>No data available</Typography>
        </Box>
      ) : (
        <ReactApexChart
          options={chartOptions}
          series={seriesData}
          type="donut"
          height={400}
        />
      )}
    </div>
  );
};

export default React.memo(EmployeeDepartments);
