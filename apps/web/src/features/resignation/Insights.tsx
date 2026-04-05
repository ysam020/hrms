import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import LinearProgress from "@mui/material/LinearProgress";

import TrendingUp from "@mui/icons-material/TrendingUp";
import People from "@mui/icons-material/People";
import Star from "@mui/icons-material/Star";
import Lightbulb from "@mui/icons-material/Lightbulb";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FiberManualRecord from "@mui/icons-material/FiberManualRecord";
import Warning from "@mui/icons-material/Warning";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Schedule from "@mui/icons-material/Schedule";
import Business from "@mui/icons-material/Business";
import TrendingDown from "@mui/icons-material/TrendingDown";
import CalendarToday from "@mui/icons-material/CalendarToday";
import Assessment from "@mui/icons-material/Assessment";

import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const Insights = () => {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    fetchFeedbackInsights();
  }, []);

  const fetchFeedbackInsights = async () => {
    try {
      setLoading(true);
      const response = await apiClient(API_ENDPOINTS.RESIGNATION_INSIGHTS);

      setInsights(response.data.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching feedback insights:", err);
      setError(
        err.response?.data?.message || "Failed to fetch feedback insights",
      );
    } finally {
      setLoading(false);
    }
  };

  const getSatisfactionColor = (score) => {
    if (score >= 4) return "#4caf50"; // Green
    if (score >= 3) return "#ff9800"; // Orange
    return "#f44336"; // Red
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high":
        return "#f44336";
      case "medium":
        return "#ff9800";
      case "low":
        return "#4caf50";
      default:
        return "#666";
    }
  };

  const getInsightIcon = (type) => {
    switch (type) {
      case "warning":
        return <Warning color="error" />;
      case "info":
        return <CheckCircle color="info" />;
      case "success":
        return <CheckCircle color="success" />;
      default:
        return <FiberManualRecord color="action" />;
    }
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <CircularProgress size={32} sx={{ mr: 1 }} />
        <Typography variant="body1">Analyzing resignation data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={1}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!insights || insights.overview?.total === 0) {
    return (
      <Box p={1}>
        <Alert severity="info">
          No resignation data available for analysis.
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={0}>
      {/* Overview Cards */}
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
              <People sx={{ fontSize: 28, color: "#1976d2" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{
                    mt: 0.5,
                    mb: 0.5,
                    color: "#1976d2",
                  }}
                >
                  {insights.overview.total}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Total Resignations
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
              <Schedule sx={{ fontSize: 28, color: "#ff9800" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  sx={{
                    mt: 0.5,
                    mb: 0.5,
                    color: "#ff9800",
                  }}
                >
                  {insights.overview.submitted}
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
                gap: 1.5,
                p: 1.5,
                "&:last-child": { pb: 1.5 },
              }}
            >
              <TrendingUp sx={{ fontSize: 28, color: "#4caf50" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  color="#4caf50"
                  sx={{ mt: 0.5, mb: 0.5 }}
                >
                  {insights.overview.approvalRate}%
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Approval Rate
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
              <Assessment sx={{ fontSize: 28, color: "#9c27b0" }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography
                  variant="h4"
                  color="#9c27b0"
                  sx={{ mt: 0.5, mb: 0.5 }}
                >
                  {insights.overview.approved}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Approved
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Department Analysis */}
      {insights.departmentAnalysis?.topDepartments?.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Business sx={{ fontSize: 20, color: "#ff9800" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Department Analysis
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            {insights.departmentAnalysis.topDepartments.map((dept, index) => (
              <Box key={index} sx={{ mb: 1.5 }}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mb: 0.5 }}
                >
                  <Typography variant="body2" fontWeight="medium">
                    {dept.department}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {dept.totalResignations} resignations ({dept.approvalRate}%
                    approved)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    (dept.totalResignations / insights.overview.total) * 100
                  }
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "#f0f0f0",
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: "#ff9800",
                    },
                  }}
                />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Resignation Reasons */}
      {insights.reasonAnalysis?.topReasons?.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <TrendingDown sx={{ fontSize: 20, color: "#f44336" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Top Resignation Reasons
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            <Box display="flex" flexWrap="wrap" gap={0.75}>
              {insights.reasonAnalysis.topReasons.map((reason, index) => (
                <Chip
                  key={index}
                  label={`${index + 1}. ${reason.reason} (${reason.count})`}
                  variant="outlined"
                  color="primary"
                  size="small"
                  sx={{ mb: 0.5 }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Exit Feedback Summary */}
      {insights.exitFeedback?.totalResponses > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Star sx={{ fontSize: 20, color: "#4caf50" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Exit Feedback Summary
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="textSecondary">
                  Total Responses
                </Typography>
                <Typography variant="h6" color="primary">
                  {insights.exitFeedback.totalResponses}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="textSecondary">
                  Recommendation Rate
                </Typography>
                <Typography
                  variant="h6"
                  color={getSatisfactionColor(
                    insights.exitFeedback.recommendationRate / 20,
                  )}
                >
                  {insights.exitFeedback.recommendationRate}%
                </Typography>
              </Grid>
              {(
                Object.entries(insights.exitFeedback.averageRatings || {}) as [
                  string,
                  number,
                ][]
              ).map(([rating, value]) => (
                <Grid item xs={12} sm={6} key={rating}>
                  <Typography variant="body2" color="textSecondary">
                    {rating.replace(/([A-Z])/g, " $1").trim()}
                  </Typography>
                  <Typography variant="h6" color={getSatisfactionColor(value)}>
                    {value}/5
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Departures */}
      {insights.upcomingDepartures?.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <CalendarToday sx={{ fontSize: 20, color: "#9c27b0" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Upcoming Departures
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            <List dense>
              {insights.upcomingDepartures
                .slice(0, 5)
                .map((departure, index) => {
                  const daysRemaining = departure.lastWorkingDay
                    ? Math.ceil(
                        (new Date(departure.lastWorkingDay).getTime() -
                          new Date().getTime()) /
                          (1000 * 60 * 60 * 24),
                      )
                    : null;
                  return (
                    <ListItem key={index} sx={{ px: 0, py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <FiberManualRecord
                          sx={{
                            fontSize: 8,
                            color:
                              daysRemaining !== null && daysRemaining <= 7
                                ? "#f44336"
                                : "#ff9800",
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={departure.username}
                        secondary={
                          daysRemaining !== null
                            ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
                            : "Last working day not set"
                        }
                        primaryTypographyProps={{
                          variant: "body2",
                          fontWeight: "medium",
                        }}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                    </ListItem>
                  );
                })}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Actionable Insights */}
      {insights.actionableInsights?.length > 0 && (
        <Card elevation={1} sx={{ mb: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Lightbulb sx={{ fontSize: 20, color: "#ff9800" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Actionable Insights
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            {insights.actionableInsights.map((insight, index) => (
              <Accordion
                key={index}
                defaultExpanded={insight.priority === "high"}
                sx={{
                  "&.MuiAccordion-root": {
                    mb: 0.5,
                    "&:before": { display: "none" },
                    border: `1px solid ${getPriorityColor(insight.priority)}20`,
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMore />}
                  aria-controls={`panel${index}-content`}
                  id={`panel${index}-header`}
                  sx={{ minHeight: 40, py: 0.5 }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    {getInsightIcon(insight.type)}
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 500 }}
                      color={getPriorityColor(insight.priority)}
                    >
                      {insight.title}
                    </Typography>
                    <Chip
                      label={insight.priority}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: "0.7rem",
                        bgcolor: `${getPriorityColor(insight.priority)}20`,
                        color: getPriorityColor(insight.priority),
                      }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5, pb: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {insight.message}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    <strong>Recommended Action:</strong> {insight.action}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Processing Metrics */}
      {insights.processingMetrics && (
        <Card elevation={1}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Assessment sx={{ fontSize: 20, color: "#2196f3" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Processing Metrics
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3}>
                <Typography variant="body2" color="textSecondary">
                  Average Processing
                </Typography>
                <Typography variant="h6" color="primary">
                  {insights.processingMetrics.averageProcessingTime} days
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="body2" color="textSecondary">
                  Fastest Processing
                </Typography>
                <Typography variant="h6" color="success.main">
                  {insights.processingMetrics.fastestProcessing} days
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="body2" color="textSecondary">
                  Slowest Processing
                </Typography>
                <Typography variant="h6" color="error.main">
                  {insights.processingMetrics.slowestProcessing} days
                </Typography>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Typography variant="body2" color="textSecondary">
                  Overdue Pending
                </Typography>
                <Typography variant="h6" color="warning.main">
                  {insights.processingMetrics.pendingOverdue}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default Insights;
