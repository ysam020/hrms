import React, { useState, useEffect, useContext } from "react";
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

import VerifiedUser from "@mui/icons-material/VerifiedUser";
import People from "@mui/icons-material/People";
import Warning from "@mui/icons-material/Warning";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Error from "@mui/icons-material/Error";
import Pending from "@mui/icons-material/Pending";
import Work from "@mui/icons-material/Work";
import TrendingUp from "@mui/icons-material/TrendingUp";

import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

function KycInsights() {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { setAlert } = useContext(AlertContext);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const response = await apiClient(API_ENDPOINTS.GET_KYC_INSIGHTS);
      setInsights(response.data.data);
    } catch (error) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError")
        return;
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, please check your connection."
            : error.response?.data?.message || "Failed to fetch KYC insights.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Approved":
        return "#4caf50";
      case "Pending":
        return "#ff9800";
      case "Rejected":
        return "#f44336";
      case "Incomplete":
        return "#9e9e9e";
      default:
        return "#9e9e9e";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Approved":
        return <CheckCircle fontSize="small" />;
      case "Pending":
        return <Pending fontSize="small" />;
      case "Rejected":
        return <Error fontSize="small" />;
      case "Incomplete":
        return <Warning fontSize="small" />;
      default:
        return <Warning fontSize="small" />;
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
          No KYC insights available. Please ensure employee data exists.
        </Alert>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ p: 0 }}>
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
              <VerifiedUser sx={{ fontSize: 24, color: "#4caf50" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#4caf50" }}
                >
                  {insights.overview?.completionRate || 0}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  KYC Completion Rate
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
              <Pending sx={{ fontSize: 24, color: "#ff9800" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#ff9800" }}
                >
                  {insights.overview?.pendingKyc || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Pending Approvals
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
              <People sx={{ fontSize: 24, color: "#2196f3" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#2196f3" }}
                >
                  {insights.overview?.totalEmployees || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Total Employees
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
              <TrendingUp sx={{ fontSize: 24, color: "#9c27b0" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h5"
                  sx={{ mt: 0, mb: 0, color: "#9c27b0" }}
                >
                  {insights.insights?.averageProcessingTime || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Avg Processing Days
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* KYC Status Breakdown */}
      <Card elevation={1} sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            KYC Status Distribution
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={12} sm={3}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#4caf50">
                  {insights.overview?.approvedKyc || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Approved
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#ff9800">
                  {insights.overview?.pendingKyc || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Pending
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#f44336">
                  {insights.overview?.rejectedKyc || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Rejected
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Box textAlign="center" p={0.5}>
                <Typography variant="h6" color="#9e9e9e">
                  {insights.overview?.incompleteKyc || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Incomplete
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Status Breakdown Detailed */}
      {insights.statusBreakdown && insights.statusBreakdown.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Detailed Status Breakdown
            </Typography>
            <Grid container spacing={1}>
              {insights.statusBreakdown.map((status, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <Box
                    sx={{
                      p: 1,
                      backgroundColor: "background.default",
                      borderRadius: 2,
                      textAlign: "center",
                    }}
                  >
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      gap={0.5}
                      mb={0.5}
                    >
                      {getStatusIcon(status.status)}
                      <Typography variant="caption" fontWeight={600}>
                        {status.status}
                      </Typography>
                    </Box>
                    <Typography
                      variant="h6"
                      color={getStatusColor(status.status)}
                    >
                      {status.count}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      employees
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Department Performance */}
      {insights.departmentBreakdown &&
        insights.departmentBreakdown.length > 0 && (
          <Card elevation={1} sx={{ mb: 2 }}>
            <CardContent sx={{ p: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                Department-wise KYC Performance
              </Typography>
              <TableContainer component={Paper} elevation={0}>
                <Table
                  size="small"
                  sx={{ "& .MuiTableCell-root": { py: 0.5 } }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Department</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Completion Rate</TableCell>
                      <TableCell align="right">Approved</TableCell>
                      <TableCell align="right">Pending</TableCell>
                      <TableCell align="right">Rejected</TableCell>
                      <TableCell align="right">Incomplete</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {insights.departmentBreakdown.map((dept, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Work fontSize="small" />
                            {dept.department}
                          </Box>
                        </TableCell>
                        <TableCell align="right">{dept.total}</TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2">
                              {dept.completionRate}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={dept.completionRate}
                              sx={{
                                mt: 0.25,
                                height: 3,
                                borderRadius: 2,
                                backgroundColor: "#e0e0e0",
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: getProgressColor(
                                    dept.completionRate,
                                  ),
                                },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="right">{dept.approved}</TableCell>
                        <TableCell align="right">{dept.pending}</TableCell>
                        <TableCell align="right">{dept.rejected}</TableCell>
                        <TableCell align="right">{dept.incomplete}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

      {/* Completion Trends */}
      {insights.completionTrends && insights.completionTrends.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Recent Completion Trends (Last 30 Days)
            </Typography>
            <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
              <Stack spacing={0.5}>
                {insights.completionTrends.slice(-10).map((trend, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 1,
                      backgroundColor: "background.default",
                      borderRadius: 2,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Typography variant="caption" fontWeight={500}>
                      {new Date(trend.date).toLocaleDateString()}
                    </Typography>
                    <Chip
                      label={`${trend.completed} completed`}
                      size="small"
                      sx={{
                        backgroundColor: "#4caf50",
                        color: "white",
                        fontSize: "0.7rem",
                        height: 20,
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Key Insights */}
      {insights.insights && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Key Insights
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 1,
                    backgroundColor: "background.default",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="textSecondary">
                    Most Common Status
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {insights.insights.mostCommonStatus}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 1,
                    backgroundColor: "background.default",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="textSecondary">
                    Top Performing Department
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {insights.insights.departmentWithHighestCompletion}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 1,
                    backgroundColor: "background.default",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="textSecondary">
                    Average Processing Time
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {insights.insights.averageProcessingTime} days
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box
                  sx={{
                    p: 1,
                    backgroundColor: "background.default",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="textSecondary">
                    Document Completion Rate
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {insights.insights.documentCompletionRate}%
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Last Updated */}
      {insights.lastUpdated && (
        <Box textAlign="center" sx={{ mt: 1 }}>
          <Typography variant="caption" color="textSecondary">
            Last updated: {new Date(insights.lastUpdated).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Container>
  );
}

export default React.memo(KycInsights);
