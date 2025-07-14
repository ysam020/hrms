import React from "react";
import ReactApexChart from "react-apexcharts";
import apiClient from "../../config/axiosConfig";
import { ThemeContext } from "../../contexts/ThemeContext";
import "../../styles/dashboard.scss";

const EmployeePerformance = () => {
  const { theme } = React.useContext(ThemeContext);
  const [data, setData] = React.useState([]);

  React.useEffect(() => {
    async function getData() {
      try {
        const res = await apiClient(`/employee-performance`);
        setData(res.data);
      } catch (error) {
        console.error(error);
      }
    }

    getData();
  }, []);

  // Extract the data for the chart
  const labels = data.map((item) => item.employeeName);
  const minScores = data.map((item) => item.minScore);
  const avgScores = data.map((item) => item.avgScore);
  const maxScores = data.map((item) => item.maxScore);

  // Chart options
  const options = {
    chart: {
      height: 350,
      type: "line",
    },
    title: {
      text: "Employee Performance Scores",
      align: "left",
      style: {
        fontSize: "20px",
        color: theme === "dark" ? "#fff" : "#000",
      },
    },
    xaxis: {
      categories: labels,
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#000",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#000",
          fontSize: "12px",
        },
      },
      title: {
        text: "Scores",
        style: {
          color: theme === "dark" ? "#fff" : "#000",
          fontSize: "14px",
        },
      },
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return val.toFixed(2);
        },
      },
    },
  };

  // Define multiple series
  const series = [
    {
      name: "Min Scores",
      data: minScores,
    },
    {
      name: "Avg Scores",
      data: avgScores,
    },
    {
      name: "Max Scores",
      data: maxScores,
    },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        <ReactApexChart
          options={options}
          series={series}
          type="line"
          height={350}
        />
      </div>
    </div>
  );
};

export default React.memo(EmployeePerformance);
