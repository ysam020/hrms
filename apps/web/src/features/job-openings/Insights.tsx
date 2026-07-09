import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import DataList from "@web/shared/components/DataList";

import Work from "@mui/icons-material/Work";
import People from "@mui/icons-material/People";
import Assessment from "@mui/icons-material/Assessment";
import Star from "@mui/icons-material/Star";
import Timeline from "@mui/icons-material/Timeline";
import Person from "@mui/icons-material/Person";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Warning from "@mui/icons-material/Warning";
import TrendingUp from "@mui/icons-material/TrendingUp";
import AttachMoney from "@mui/icons-material/AttachMoney";

import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { AIInsightsCard } from "@web/shared/components";

const JobOpeningsInsights = () => {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const response = await apiClient(API_ENDPOINTS.JOB_OPENINGS_INSIGHTS);
      setInsights(response.data.data);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      console.error("Error fetching insights:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading insights: {error}
        </Alert>
      </Box>
    );
  }

  if (!insights) {
    return (
      <Box p={2}>
        <Alert severity="info">
          No insights data available. Please ensure you have job openings and
          applications in the system.
        </Alert>
      </Box>
    );
  }

  const getStatusColor = (rate) => {
    if (rate >= 70) return "#4caf50"; // Green
    if (rate >= 50) return "#ff9800"; // Orange
    return "#f44336"; // Red
  };

  const getApplicationStatusBreakdown = () => {
    const { applicationsByStatus } = insights.applications;
    const total = insights.applications.totalApplications;

    if (total === 0) return [];

    return (Object.entries(applicationsByStatus) as [string, number][]).map(
      ([status, count]) => ({
        status,
        count,
        percentage: Math.round((Number(count) / total) * 100),
      }),
    );
  };

  return (
    <Box p={0}>
      <AIInsightsCard module="recruitment" />
      {/* Primary Metrics Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1}>
            <CardContent
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.5,
                "&:last-child": { pb: 1.5 },
              }}
            >
              <Work sx={{ fontSize: 28, color: "#1976d2" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{ mt: 0.5, mb: 0.5, color: "#1976d2" }}
                >
                  {insights.overview.activeJobOpenings}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Active Openings
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
                gap: 1.5,
                p: 1.5,
                "&:last-child": { pb: 1.5 },
              }}
            >
              <People sx={{ fontSize: 28, color: "#ff9800" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{ mt: 0.5, mb: 0.5, color: "#ff9800" }}
                >
                  {insights.overview.totalApplications}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Total Applications
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
                gap: 1.5,
                p: 1.5,
                "&:last-child": { pb: 1.5 },
              }}
            >
              <CheckCircle
                sx={{
                  fontSize: 28,
                  color: getStatusColor(insights.overview.hiringSuccessRate),
                }}
              />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{
                    mt: 0.5,
                    mb: 0.5,
                    color: getStatusColor(insights.overview.hiringSuccessRate),
                  }}
                >
                  {insights.overview.hiringSuccessRate}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Hiring Success Rate
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
                gap: 1.5,
                p: 1.5,
                "&:last-child": { pb: 1.5 },
              }}
            >
              <Star
                sx={{
                  fontSize: 28,
                  color: "#4caf50",
                }}
              />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{
                    mt: 0.5,
                    mb: 0.5,
                    color: "#4caf50",
                  }}
                >
                  {insights.overview.averageApplicationsPerJob}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Avg Apps/Job
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Application Pipeline Section */}
      <Card elevation={1} sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
            <Timeline sx={{ fontSize: 20, color: "#1976d2" }} />
            <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
              Application Pipeline
            </Typography>
          </Box>
          <Divider sx={{ mb: 1.5 }} />

          <Grid container spacing={1}>
            {getApplicationStatusBreakdown()
              .slice(0, 5)
              .map((status, index) => (
                <Grid item xs={12} sm={6} md={4} lg={2.4} key={status.status}>
                  <Box sx={{ textAlign: "center", p: 1 }}>
                    <Typography variant="h6" color="primary">
                      {status.count}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{ fontSize: "0.65rem", lineHeight: 1.2 }}
                    >
                      {status.status}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={status.percentage}
                      sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                    />
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      sx={{ fontSize: "0.6rem" }}
                    >
                      {status.percentage}%
                    </Typography>
                  </Box>
                </Grid>
              ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Top Performing Jobs Section */}
      {insights.topPerformingJobs && insights.topPerformingJobs.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Assessment sx={{ fontSize: 20, color: "#4caf50" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Top Performing Jobs
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            <DataList
              ariaLabel="Top performing jobs"
              variant="rows"
              data={insights.topPerformingJobs.slice(0, 8)}
              getRowId={(job: any) => job.jobTitle}
              columns={[
                { key: "jobTitle", label: "Job Title", primary: true },
                { key: "totalApplications", label: "Applications" },
                { key: "hired", label: "Hired" },
                {
                  key: "hiringRate",
                  label: "Hiring Rate",
                  render: (job: any) => (
                    <Typography
                      variant="body2"
                      sx={{
                        color: getStatusColor(job.hiringRate),
                        fontWeight: 500,
                      }}
                    >
                      {job.hiringRate}%
                    </Typography>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Experience & Budget Analytics Row */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: "100%" }}>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                <TrendingUp sx={{ fontSize: 20, color: "#9c27b0" }} />
                <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                  Experience Requirements
                </Typography>
              </Box>
              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  sx={{ mb: 1 }}
                >
                  Average Experience Required:{" "}
                  <strong>
                    {insights.experienceRequirements.averageExperience} years
                  </strong>
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Most Common Range:{" "}
                  <strong>
                    {insights.experienceRequirements.mostCommonRange}
                  </strong>
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Experience Distribution
                </Typography>
                {(
                  Object.entries(insights.experienceRequirements.breakdown) as [
                    string,
                    number,
                  ][]
                ).map(([range, count]) => (
                  <Box key={range} sx={{ mb: 1 }}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography variant="body2">{range}</Typography>
                      <Typography variant="body2" color="primary">
                        {count}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        (Number(count) / insights.overview.totalJobOpenings) *
                        100
                      }
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: "100%" }}>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                <AttachMoney sx={{ fontSize: 20, color: "#ff9800" }} />
                <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                  Budget Analysis
                </Typography>
              </Box>
              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  sx={{ mb: 1 }}
                >
                  Average Budget:{" "}
                  <strong>₹{insights.budgetAnalysis.averageBudget}L</strong>
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Total Allocation:{" "}
                  <strong>
                    ₹{insights.budgetAnalysis.totalBudgetAllocation}L
                  </strong>
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Budget Range Distribution
                </Typography>
                {(
                  Object.entries(insights.budgetAnalysis.budgetRanges) as [
                    string,
                    number,
                  ][]
                ).map(([range, count]) => (
                  <Box key={range} sx={{ mb: 1 }}>
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Typography variant="body2">{range}</Typography>
                      <Typography variant="body2" color="primary">
                        {count}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        (Number(count) / insights.overview.totalJobOpenings) *
                        100
                      }
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Timeline Alerts & Deadline Management */}
      <Card elevation={1} sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
            <Warning sx={{ fontSize: 20, color: "#ff9800" }} />
            <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
              Timeline Alerts & Deadlines
            </Typography>
          </Box>
          <Divider sx={{ mb: 1.5 }} />

          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" color="#ff9800">
                  {insights.deadlines.deadlinesThisWeek}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  This Week
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} md={3}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" color="#2196f3">
                  {insights.deadlines.deadlinesThisMonth}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  This Month
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} md={3}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" color="#f44336">
                  {insights.deadlines.overdueJobs}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Overdue
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} md={3}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h5" color="#4caf50">
                  {insights.deadlines.averageDaysToDeadline}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Avg Days Left
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Hiring Manager Performance */}
      {insights.hiringManagers.topPerformers.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Person sx={{ fontSize: 20, color: "#673ab7" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Hiring Manager Performance
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            <DataList
              ariaLabel="Hiring manager performance"
              variant="rows"
              data={insights.hiringManagers.topPerformers}
              getRowId={(manager: any) => manager.name}
              columns={[
                { key: "name", label: "Manager", primary: true },
                { key: "totalJobs", label: "Total Jobs" },
                { key: "activeJobs", label: "Active Jobs" },
                {
                  key: "totalHired",
                  label: "Total Hired",
                  render: (manager: any) => (
                    <Typography
                      variant="body2"
                      sx={{ color: "#4caf50", fontWeight: 500 }}
                    >
                      {manager.totalHired}
                    </Typography>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Actionable Insights */}
      {insights.actionableInsights &&
        insights.actionableInsights.length > 0 && (
          <Card elevation={1} sx={{ mb: 2 }}>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
                <Assessment sx={{ fontSize: 20, color: "#1976d2" }} />
                <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                  Actionable Insights
                </Typography>
              </Box>
              <Divider sx={{ mb: 1.5 }} />

              <Grid container spacing={1}>
                {insights.actionableInsights.map((insight, index) => (
                  <Grid item xs={12} key={index}>
                    <Alert
                      severity={insight.type === "warning" ? "warning" : "info"}
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {insight.title}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {insight.message}
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Chip
                          label={insight.action}
                          size="small"
                          color={
                            insight.priority === "high"
                              ? "error"
                              : insight.priority === "medium"
                                ? "warning"
                                : "default"
                          }
                          variant="outlined"
                        />
                      </Box>
                    </Alert>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

      {/* Monthly Trends */}
      {insights.trends && insights.trends.monthlyJobPostings.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Timeline sx={{ fontSize: 20, color: "#4caf50" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                6-Month Trends
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Job Postings by Month
                </Typography>
                {insights.trends.monthlyJobPostings.map((month, index) => (
                  <Box key={index} sx={{ mb: 0.5 }}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption">{month.month}</Typography>
                      <Typography variant="caption" color="primary">
                        {month.count}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Grid>

              {insights.trends.monthlyApplications.length > 0 && (
                <Grid item xs={12} md={4}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Applications by Month
                  </Typography>
                  {insights.trends.monthlyApplications.map((month, index) => (
                    <Box key={index} sx={{ mb: 0.5 }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="caption">{month.month}</Typography>
                        <Typography variant="caption" color="primary">
                          {month.count}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Grid>
              )}

              {insights.trends.monthlyHirings.length > 0 && (
                <Grid item xs={12} md={4}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Hirings by Month
                  </Typography>
                  {insights.trends.monthlyHirings.map((month, index) => (
                    <Box key={index} sx={{ mb: 0.5 }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="caption">{month.month}</Typography>
                        <Typography variant="caption" color="primary">
                          {month.count}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Last Updated */}
      <Box sx={{ textAlign: "center", mt: 2, mb: 1 }}>
        <Typography variant="caption" color="textSecondary">
          Last updated: {new Date(insights.lastUpdated).toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};

export default JobOpeningsInsights;
