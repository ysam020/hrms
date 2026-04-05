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

const HeadcountGrowth = ({ theme }) => {
  const { data, loading } = useFetchData(`/get-headcount-growth`, "get", []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading headcount data..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Headcount Growth Over Time
          </Typography>
          <Typography color="text.secondary">No data available</Typography>
        </CardContent>
      </Card>
    );
  }

  const categories = data.map((item) => `${item.monthName} ${item.year}`);
  const joinings = data.map((item) => item.joinings);
  const cumulative = data.map((item) => item.cumulativeHeadcount);

  const chartOptions = {
    chart: {
      type: "area",
      fontFamily: "inherit",
      toolbar: {
        show: false,
      },
      zoom: {
        enabled: false,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
      width: [2, 3],
    },
    xaxis: {
      categories: categories,
      labels: {
        style: {
          colors: theme === "dark" ? "#fff" : "#666",
        },
        rotate: -45,
      },
    },
    yaxis: [
      {
        title: {
          text: "Monthly Joinings",
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
      {
        opposite: true,
        title: {
          text: "Total Headcount",
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
    ],
    colors: ["#4caf50", "#2196f3"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.2,
        stops: [0, 90, 100],
      },
    },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: {
        colors: theme === "dark" ? "#fff" : "#000",
      },
    },
    grid: {
      borderColor: theme === "dark" ? "#424242" : "#e0e0e0",
    },
    tooltip: {
      theme: theme === "dark" ? "dark" : "light",
      shared: true,
      intersect: false,
    },
  };

  const series = [
    {
      name: "Monthly Joinings",
      type: "column",
      data: joinings,
    },
    {
      name: "Cumulative Headcount",
      type: "area",
      data: cumulative,
    },
  ];

  // Calculate growth metrics
  const totalJoinings = joinings.reduce((a, b) => a + b, 0);
  const avgMonthlyJoinings = (totalJoinings / joinings.length).toFixed(1);
  const currentHeadcount = cumulative[cumulative.length - 1];
  const startHeadcount = cumulative[0] - joinings[0];
  const growthRate =
    startHeadcount > 0
      ? (((currentHeadcount - startHeadcount) / startHeadcount) * 100).toFixed(
          1,
        )
      : 0;

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
              Headcount Growth Over Time
            </Typography>
          </Box>
        </Box>
        <Suspense fallback={<LoadingState />}>
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="area"
            height={350}
          />
        </Suspense>

        {/* Growth Metrics */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={3}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: "action.hover",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Current Headcount
              </Typography>
              <Typography variant="h5" fontWeight={600} color="primary">
                {currentHeadcount}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: "action.hover",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Total Joinings
              </Typography>
              <Typography variant="h5" fontWeight={600} color="success.main">
                {totalJoinings}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: "action.hover",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Avg Monthly
              </Typography>
              <Typography variant="h5" fontWeight={600} color="info.main">
                {avgMonthlyJoinings}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                bgcolor: "action.hover",
                textAlign: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Growth Rate
              </Typography>
              <Typography
                variant="h5"
                fontWeight={600}
                color={Number(growthRate) > 0 ? "success.main" : "error.main"}
              >
                {growthRate}%
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default React.memo(HeadcountGrowth);
