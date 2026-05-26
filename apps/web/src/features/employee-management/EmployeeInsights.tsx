import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import People from "@mui/icons-material/People";
import Home from "@mui/icons-material/Home";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Work from "@mui/icons-material/Work";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Business from "@mui/icons-material/Business";
import Cancel from "@mui/icons-material/Cancel";
import ExitToApp from "@mui/icons-material/ExitToApp";
import Warning from "@mui/icons-material/Warning";

import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { AIInsightsCard } from "@web/shared/components";

const EmployeeInsights = () => {
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployeeInsights();
  }, []);

  const fetchEmployeeInsights = async () => {
    try {
      setLoading(true);
      const response = await apiClient(API_ENDPOINTS.EMPLOYEE_INSIGHTS, {
        withCredentials: true,
      });
      setInsights(response.data.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching employee insights:", err);
      setError(
        err.response?.data?.message || "Failed to fetch employee insights",
      );
    } finally {
      setLoading(false);
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
        <CircularProgress size={32} />
        <Typography variant="body1" sx={{ ml: 1 }}>
          Analyzing employee data...
        </Typography>
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

  if (!insights) {
    return (
      <Box p={1}>
        <Alert severity="info">No employee data available for analysis.</Alert>
      </Box>
    );
  }

  // Calculate metrics from the new data structure
  const totalEmployees = insights.overview?.totalEmployees || 0;
  const activeEmployees = insights.overview?.activeEmployees || 0;
  const terminatedEmployees = insights.overview?.terminatedEmployees || 0;
  const abscondedEmployees = insights.overview?.abscondedEmployees || 0;
  const resignedEmployees = insights.overview?.resignedEmployees || 0;

  // Calculate WFH and PF statistics from department breakdown
  const wfhCount =
    insights.departmentBreakdown?.reduce(
      (sum, dept) => sum + (dept.wfhCount || 0),
      0,
    ) || 0;
  const pfCount =
    insights.departmentBreakdown?.reduce(
      (sum, dept) => sum + (dept.pfCount || 0),
      0,
    ) || 0;

  const metricCards = [
    {
      icon: People,
      value: totalEmployees,
      label: "Total Employees",
      color: "#1976d2",
    },
    {
      icon: CheckCircle,
      value: activeEmployees,
      label: "Active Employees",
      color: "#4caf50",
    },
    {
      icon: Home,
      value: wfhCount,
      label: "Working From Home",
      color: "#9c27b0",
    },
    {
      icon: AccountBalance,
      value: pfCount,
      label: "PF Registered",
      color: "#ff9800",
    },
  ];

  const statusCards = [
    {
      icon: Cancel,
      value: terminatedEmployees,
      label: "Terminated",
      color: "#f44336",
      percentage:
        totalEmployees > 0 ? (terminatedEmployees / totalEmployees) * 100 : 0,
    },
    {
      icon: ExitToApp,
      value: resignedEmployees,
      label: "Resigned",
      color: "#2196f3",
      percentage:
        totalEmployees > 0 ? (resignedEmployees / totalEmployees) * 100 : 0,
    },
    {
      icon: Warning,
      value: abscondedEmployees,
      label: "Absconded",
      color: "#ff9800",
      percentage:
        totalEmployees > 0 ? (abscondedEmployees / totalEmployees) * 100 : 0,
    },
  ];

  return (
    <Box p={1}>
      <AIInsightsCard module="employee-management" />
      {/* Overview Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {metricCards.map((metric, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
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
                <metric.icon
                  sx={{ fontSize: 32, color: metric.color }}
                  aria-hidden="true"
                />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography
                    variant="h4"
                    sx={{ color: metric.color, fontWeight: 600 }}
                  >
                    {metric.value}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {metric.label}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Status Breakdown Cards */}
      {(terminatedEmployees > 0 ||
        resignedEmployees > 0 ||
        abscondedEmployees > 0) && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {statusCards.map(
            (status, index) =>
              status.value > 0 && (
                <Grid item xs={12} sm={4} key={index}>
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
                      <status.icon
                        sx={{ fontSize: 32, color: status.color }}
                        aria-hidden="true"
                      />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography
                          variant="h4"
                          sx={{ color: status.color, fontWeight: 600 }}
                        >
                          {status.value}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {status.label} ({status.percentage.toFixed(1)}%)
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ),
          )}
        </Grid>
      )}

      {/* Department Breakdown */}
      <Card elevation={1}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
            <Business sx={{ fontSize: 20, color: "#ff9800" }} />
            <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
              Department Breakdown
            </Typography>
          </Box>
          <Divider sx={{ mb: 1.5 }} />

          <TableContainer>
            <Table size="small" aria-label="Department breakdown">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Department</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>Total</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>Active Rate</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>WFH Rate</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>PF Rate</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {insights.departmentBreakdown?.map((dept, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{dept.department}</TableCell>
                    <TableCell align="center">{dept.count}</TableCell>
                    <TableCell align="center">
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Typography variant="body2" sx={{ mr: 1 }}>
                          {dept.activeRate}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Typography variant="body2" sx={{ mr: 1 }}>
                          {dept.wfhRate}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Typography variant="body2" sx={{ mr: 1 }}>
                          {dept.pfRate}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )) || []}
              </TableBody>
            </Table>
          </TableContainer>

          {(!insights.departmentBreakdown ||
            insights.departmentBreakdown.length === 0) && (
            <Box textAlign="center" py={2}>
              <Typography variant="body2" color="textSecondary">
                No department data available
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Status Breakdown Table */}
      {insights.statusBreakdown && insights.statusBreakdown.length > 0 && (
        <Card elevation={1} sx={{ mt: 2 }}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" sx={{ mb: 1 }}>
              <Work sx={{ fontSize: 20, color: "#1976d2" }} />
              <Typography variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                Status Summary
              </Typography>
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            <TableContainer>
              <Table size="small" aria-label="Employee status summary">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Status</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>Count</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>Percentage</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {insights.statusBreakdown.map((status, index) => (
                    <TableRow key={index} hover>
                      <TableCell>{status.status}</TableCell>
                      <TableCell align="center">{status.count}</TableCell>
                      <TableCell align="center">
                        {totalEmployees > 0
                          ? ((status.count / totalEmployees) * 100).toFixed(1)
                          : 0}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default EmployeeInsights;
