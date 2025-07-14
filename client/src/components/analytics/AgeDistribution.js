import React from "react";
import ReactApexChart from "react-apexcharts";
import apiClient from "../../config/axiosConfig";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

const EmployeeDepartments = (props) => {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function getData() {
      try {
        const res = await apiClient(`/get-age-distribution`);
        setData(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    getData();
  }, []);

  if (loading) {
    return (
      <Box
        className="dashboard-container"
        sx={{
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress
          color={props.theme === "dark" ? "inherit" : "primary"}
        />
      </Box>
    );
  }

  if (data.length === 0) {
    return (
      <Box
        className="dashboard-container"
        sx={{ textAlign: "center", padding: 2 }}
      >
        No data available
      </Box>
    );
  }

  const labels = data.map((item) => item._id);
  const seriesData = data.map((item) => item.count);

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
      text: "Employee Age Distribution",
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
      <ReactApexChart
        options={chartOptions}
        series={seriesData}
        type="donut"
        height={400}
      />
    </div>
  );
};

export default React.memo(EmployeeDepartments);
