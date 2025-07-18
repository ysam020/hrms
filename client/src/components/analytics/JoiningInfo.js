import React from "react";
import ReactApexChart from "react-apexcharts";
import apiClient from "../../config/axiosConfig";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

const JoiningInfo = (props) => {
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true; // Flag to track if component is mounted

    async function getData() {
      try {
        const res = await apiClient(`/get-joining-data`);
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

  if (loading) {
    return (
      <Box
        className="dashboard-container"
        sx={{
          height: 350,
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

  const labels = data.map((item) => item.formattedDate);
  const seriesData = data.map((item) => item.count);

  const options = {
    chart: {
      height: 350,
      type: "line",
      zoom: {
        enabled: false,
      },
    },
    stroke: {
      curve: "smooth",
    },
    title: {
      text: "Employee Joinings in Last Year",
      align: "left",
      style: {
        fontSize: "20px",
        color: props.theme === "dark" ? "#fff" : "#000",
      },
    },
    xaxis: {
      categories: labels,
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
        text: "Joinings Count",
        style: {
          color: props.theme === "dark" ? "#fff" : "#000",
          fontSize: "14px",
        },
      },
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val + " joinings";
        },
      },
    },
  };

  const series = [
    {
      name: "Joinings",
      data: seriesData,
    },
  ];

  return (
    <div className="dashboard-container">
      <ReactApexChart
        options={options}
        series={series}
        type="line"
        height={350}
      />
    </div>
  );
};

export default React.memo(JoiningInfo);
