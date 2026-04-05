import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import CheckCircle from "@mui/icons-material/CheckCircle";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import Cancel from "@mui/icons-material/Cancel";
import TrendingUp from "@mui/icons-material/TrendingUp";

import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import ReactApexChart from "@web/shared/components/SafeApexChart";

const LeaveApprovalGauge = ({ theme }) => {
  const { data, loading } = useFetchData(`/get-leave-approval-rate`, "get", []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading approval data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Leave Approval Rate
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const chartOptions = {
    chart: {
      type: "radialBar",
      fontFamily: "inherit",
    },
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: {
          margin: 0,
          size: "70%",
          background: "transparent",
        },
        track: {
          background: theme === "dark" ? "#424242" : "#f0f0f0",
          strokeWidth: "100%",
          margin: 5,
        },
        dataLabels: {
          name: {
            show: true,
            fontSize: "14px",
            color: theme === "dark" ? "#fff" : "#666",
            offsetY: -10,
          },
          value: {
            show: true,
            fontSize: "36px",
            fontWeight: 700,
            color: theme === "dark" ? "#fff" : "#000",
            offsetY: 10,
            formatter: function (val) {
              return val.toFixed(0) + "%";
            },
          },
        },
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "horizontal",
        shadeIntensity: 0.5,
        gradientToColors: ["#4caf50"],
        inverseColors: false,
        opacityFrom: 1,
        opacityTo: 1,
        stops: [0, 100],
      },
    },
    stroke: {
      lineCap: "round",
    },
    labels: ["Approval Rate"],
    colors: ["#2196f3"],
  };

  const series = [data.approvalRate];

  const stats = [
    {
      icon: (
        <CheckCircle sx={{ color: "success.main", fontSize: 22, mr: 0.5 }} />
      ),
      label: "Approved",
      value: data.approved,
      color: "success.main",
    },
    {
      icon: (
        <HourglassEmpty sx={{ color: "warning.main", fontSize: 22, mr: 0.5 }} />
      ),
      label: "Pending",
      value: data.pending,
      color: "warning.main",
    },
    {
      icon: <Cancel sx={{ color: "error.main", fontSize: 22, mr: 0.5 }} />,
      label: "Rejected",
      value: data.rejected,
      color: "error.main",
    },
    {
      icon: <TrendingUp sx={{ color: "info.main", fontSize: 22, mr: 0.5 }} />,
      label: "Total",
      value: data.total,
      color: "info.main",
    },
  ];

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Leave Approval Rate
        </Typography>

        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="radialBar"
            width="100%"
          />
        </Box>

        {/* Stats Grid */}
        <Grid container spacing={1}>
          {stats.map((stat, index) => (
            <Grid item xs={6} sm={3} key={index}>
              <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {stat.icon}
                  <Typography variant="h6" fontWeight={600} color={stat.color}>
                    {stat.value}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {stat.label}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default React.memo(LeaveApprovalGauge);
