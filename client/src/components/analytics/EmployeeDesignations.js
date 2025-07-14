import React from "react";
import ReactApexChart from "react-apexcharts";
import apiClient from "../../config/axiosConfig";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

const EmployeeDesignations = (props) => {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function getData() {
      try {
        const res = await apiClient(`/get-employee-designations`);
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

  const categories = data.map((item) => item._id);
  const seriesData = data.map((item) => item.count);

  const chartOptions = {
    chart: {
      type: "bar",
      height: 350,
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        endingShape: "rounded",
      },
    },
    dataLabels: {
      enabled: true,
      style: {
        colors: [props.theme === "dark" ? "#fff" : "#000"],
        fontSize: "12px",
        fontWeight: "bold",
      },
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: props.theme === "dark" ? "#fff" : "#000",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: props.theme === "dark" ? "#fff" : "#000",
          fontSize: "12px",
        },
      },
      title: {
        text: "Number of Employees",
        style: {
          color: props.theme === "dark" ? "#fff" : "#000",
          fontSize: "14px",
        },
      },
    },
    title: {
      text: "Employee Distribution by Designation",
      align: "left",
      style: {
        fontSize: "20px",
        color: props.theme === "dark" ? "#fff" : "#000",
      },
    },
    legend: {
      position: "top",
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

  const chartSeries = [
    {
      name: "Employees",
      data: seriesData,
    },
  ];

  return (
    <div className="dashboard-container">
      <ReactApexChart
        options={chartOptions}
        series={chartSeries}
        type="bar"
        height={400}
      />
    </div>
  );
};

export default React.memo(EmployeeDesignations);
