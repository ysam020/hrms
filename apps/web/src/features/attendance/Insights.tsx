import React, { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Container from "@mui/material/Container";

import Assessment from "@mui/icons-material/Assessment";
import Schedule from "@mui/icons-material/Schedule";
import Warning from "@mui/icons-material/Warning";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Error from "@mui/icons-material/Error";
import TrendingUp from "@mui/icons-material/TrendingUp";
import TrendingDown from "@mui/icons-material/TrendingDown";
import TrendingFlat from "@mui/icons-material/TrendingFlat";
import Work from "@mui/icons-material/Work";
import PersonOutline from "@mui/icons-material/PersonOutline";

import { Dropdown } from "primereact/dropdown";
import useFetchData from "@web/shared/hooks/useFetchData";
import { AIInsightsCard } from "@web/shared/components";

const periodOptions = [
  { label: "Current Month", value: "current_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

function AttendanceInsights() {
  const [selectedPeriod, setSelectedPeriod] = useState("current_month");

  // Fetch attendance insights
  const { data: insights, loading } = useFetchData(
    `/attendance-insights?period=${selectedPeriod}`,
    "get",
    [selectedPeriod],
    null,
    "Failed to fetch attendance insights",
  );

  const getRiskLevelColor = (level) => {
    switch (level) {
      case "High":
        return "#f44336";
      case "Medium":
        return "#ff9800";
      case "Low":
        return "#4caf50";
      default:
        return "#9e9e9e";
    }
  };

  const getRiskLevelIcon = (level) => {
    switch (level) {
      case "High":
        return <Error fontSize="small" />;
      case "Medium":
        return <Warning fontSize="small" />;
      case "Low":
        return <CheckCircle fontSize="small" />;
      default:
        return null;
    }
  };

  const getTrendIcon = (direction) => {
    switch (direction) {
      case "improving":
        return <TrendingUp sx={{ color: "#4caf50" }} />;
      case "declining":
        return <TrendingDown sx={{ color: "#f44336" }} />;
      case "stable":
        return <TrendingFlat sx={{ color: "#9e9e9e" }} />;
      default:
        return <TrendingFlat sx={{ color: "#9e9e9e" }} />;
    }
  };

  const getProgressColor = (rate) => {
    if (rate >= 90) return "#4caf50";
    if (rate >= 75) return "#ff9800";
    return "#f44336";
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="300px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!insights) {
    return (
      <Box p={1}>
        <Alert severity="info">
          No attendance insights available. Please ensure attendance data
          exists.
        </Alert>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ p: 0 }}>
      {/* Header with Period Selection */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
      >
        <Typography variant="h6" component="h1" fontWeight={600}>
          Attendance Insights
        </Typography>
        <Box sx={{ minWidth: 180 }}>
          <Dropdown
            value={selectedPeriod}
            options={periodOptions}
            onChange={(e) => setSelectedPeriod(e.value)}
            placeholder="Select Period"
            className="w-full"
          />
        </Box>
      </Box>

      <AIInsightsCard module="attendance" params={{ period: selectedPeriod }} />

      {/* Primary Metrics Cards */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1}>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                "&:last-child": { pb: 1 },
              }}
            >
              <Assessment sx={{ fontSize: 24, color: "#1976d2" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#1976d2" }}
                >
                  {insights.primaryMetrics?.overallAttendanceRate || 0}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Overall Attendance
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1}>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                "&:last-child": { pb: 1 },
              }}
            >
              <Schedule sx={{ fontSize: 24, color: "#ff9800" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#ff9800" }}
                >
                  {insights.primaryMetrics?.averageWorkingHours || 0}h
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Avg Working Hours
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1}>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                "&:last-child": { pb: 1 },
              }}
            >
              <Warning sx={{ fontSize: 24, color: "#f44336" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#f44336" }}
                >
                  {insights.primaryMetrics?.correctionRate || 0}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Correction Rate
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1}>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                "&:last-child": { pb: 1 },
              }}
            >
              <CheckCircle sx={{ fontSize: 24, color: "#4caf50" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#4caf50" }}
                >
                  {insights.primaryMetrics?.automationRate || 0}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Automation Rate
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Status Distribution */}
      <Card elevation={1} sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Attendance Status Distribution
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={12} sm={2.4}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#4caf50">
                  {insights.primaryMetrics?.statusDistribution?.present || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Present
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={2.4}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#ff9800">
                  {insights.primaryMetrics?.statusDistribution?.halfDay || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Half Day
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={2.4}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#f44336">
                  {insights.primaryMetrics?.statusDistribution?.leave || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Leave
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={2.4}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#9c27b0">
                  {insights.primaryMetrics?.statusDistribution?.weekOff || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Week Off
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={2.4}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#2196f3">
                  {insights.primaryMetrics?.statusDistribution?.holiday || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Holiday
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Employee Risk Assessment */}
      <Card elevation={1} sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1 }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={1}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Employee Risk Assessment
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Top employees by risk score
            </Typography>
          </Box>
          <TableContainer component={Paper} elevation={0}>
            <Table size="small" sx={{ "& .MuiTableCell-root": { py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Risk Level</TableCell>
                  <TableCell align="right">Attendance Rate</TableCell>
                  <TableCell align="right">Avg Hours</TableCell>
                  <TableCell align="right">Corrections</TableCell>
                  <TableCell align="right">Risk Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {insights.employeeRiskAssessment &&
                insights.employeeRiskAssessment.length > 0 ? (
                  insights.employeeRiskAssessment
                    .slice(0, 10)
                    .map((employee, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <PersonOutline fontSize="small" />
                            {employee.username}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            {getRiskLevelIcon(employee.riskLevel)}
                            <Chip
                              label={employee.riskLevel}
                              size="small"
                              sx={{
                                backgroundColor: getRiskLevelColor(
                                  employee.riskLevel,
                                ),
                                color: "white",
                                fontSize: "0.7rem",
                                height: 20,
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2">
                              {employee.attendanceRate || 0}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={employee.attendanceRate || 0}
                              sx={{
                                mt: 0.25,
                                height: 3,
                                borderRadius: 2,
                                backgroundColor: "#e0e0e0",
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: getProgressColor(
                                    employee.attendanceRate || 0,
                                  ),
                                },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          {employee.avgWorkingHours || 0}h
                        </TableCell>
                        <TableCell align="right">
                          {employee.correctionFrequency || 0}%
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={
                              (employee.riskScore || 0) > 30
                                ? "error"
                                : (employee.riskScore || 0) > 15
                                  ? "warning.main"
                                  : "success.main"
                            }
                            fontWeight={600}
                          >
                            {(employee.riskScore || 0).toFixed(1)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="textSecondary">
                        No risk assessment data available
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Team Performance */}
      {insights.teamPerformance && insights.teamPerformance.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Team Performance by Department
            </Typography>
            <TableContainer component={Paper} elevation={0}>
              <Table size="small" sx={{ "& .MuiTableCell-root": { py: 0.5 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Department</TableCell>
                    <TableCell align="right">Employees</TableCell>
                    <TableCell align="right">Attendance Rate</TableCell>
                    <TableCell align="right">Avg Working Hours</TableCell>
                    <TableCell align="right">Correction Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {insights.teamPerformance.map((team, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Work fontSize="small" />
                          {team.department}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {team.employeeCount || 0}
                      </TableCell>
                      <TableCell align="right">
                        <Box>
                          <Typography variant="body2">
                            {team.attendanceRate || 0}%
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={team.attendanceRate || 0}
                            sx={{
                              mt: 0.25,
                              height: 3,
                              borderRadius: 2,
                              backgroundColor: "#e0e0e0",
                              "& .MuiLinearProgress-bar": {
                                backgroundColor: getProgressColor(
                                  team.attendanceRate || 0,
                                ),
                              },
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {team.avgWorkingHours || 0}h
                      </TableCell>
                      <TableCell align="right">
                        {team.correctionRate || 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Operational Efficiency and Trends */}
      <Grid container spacing={1}>
        {/* Trend Analysis */}
        <Grid item xs={12}>
          <Card elevation={1}>
            <CardContent sx={{ p: 1 }}>
              <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Weekly Attendance Trends
                </Typography>
                {getTrendIcon(
                  insights.trendAnalysis?.trendDirection || "stable",
                )}
              </Box>

              {insights.trendAnalysis?.weeklyTrends &&
              insights.trendAnalysis.weeklyTrends.length > 0 ? (
                <Stack spacing={2}>
                  {insights.trendAnalysis.weeklyTrends
                    .slice(-4)
                    .map((trend, index) => (
                      <Box
                        key={index}
                        display="flex"
                        alignItems="center"
                        gap={1}
                      >
                        <Typography variant="body2" sx={{ minWidth: 50 }}>
                          Week {trend.week}
                        </Typography>
                        <Box sx={{ flexGrow: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={trend.attendanceRate || 0}
                            sx={{
                              height: 6,
                              borderRadius: 4,
                              backgroundColor: "#e0e0e0",
                              "& .MuiLinearProgress-bar": {
                                backgroundColor: getProgressColor(
                                  trend.attendanceRate || 0,
                                ),
                              },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" fontWeight={600}>
                          {trend.attendanceRate || 0}%
                        </Typography>
                      </Box>
                    ))}
                </Stack>
              ) : (
                <Typography
                  variant="body2"
                  color="textSecondary"
                  align="center"
                >
                  No weekly trend data available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Peak Hours */}
      {insights.attendancePatterns?.peakHours &&
        insights.attendancePatterns.peakHours.length > 0 && (
          <Card elevation={1} sx={{ mt: 2 }}>
            <CardContent sx={{ p: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                Peak Arrival Hours
              </Typography>
              <Grid container spacing={1}>
                {insights.attendancePatterns.peakHours.map((peak, index) => (
                  <Grid item xs={12} sm={4} key={index}>
                    <Box
                      textAlign="center"
                      p={1}
                      sx={{
                        backgroundColor: "background.default",
                        borderRadius: 2,
                      }}
                    >
                      <Typography variant="h5" color="#1976d2">
                        {peak.hour}:00
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {peak.count} arrivals
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}
    </Container>
  );
}

export default React.memo(AttendanceInsights);
