import { cloneElement, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useTheme } from "@mui/material";
import { useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material";

import ExpandMore from "@mui/icons-material/ExpandMore";
import ExpandLess from "@mui/icons-material/ExpandLess";
import Person from "@mui/icons-material/Person";
import Business from "@mui/icons-material/Business";
import Group from "@mui/icons-material/Group";
import TrendingUp from "@mui/icons-material/TrendingUp";
import Close from "@mui/icons-material/Close";

import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  department: string;
  designation: string;
  employeeStatus: string;
  employee_photo: string;
  children?: Employee[];
};

const OrganisationTree = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get(API_ENDPOINTS.GET_ALL_USERS());
        const raw: any[] = res.data?.data ?? [];
        const mapped: Employee[] = raw
          .filter((u) => u.employeeStatus === "Active")
          .map((u) => ({
            id: u.id,
            first_name: u.firstName || u.first_name || "",
            last_name: u.lastName || u.last_name || "",
            username: u.username || u.id,
            department: u.department || "",
            designation: u.designation || "",
            employeeStatus: u.employeeStatus || "",
            employee_photo: u.employeePhoto || u.employee_photo || "",
          }));
        setEmployees(mapped);
        // Auto-expand the top node (CEO or first employee)
        const root =
          mapped.find((e) => e.designation?.toUpperCase() === "CEO") ??
          mapped[0];
        if (root) setExpandedNodes(new Set([root.username]));
      } catch {
        setError("Failed to load employees. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchEmployees();
  }, []);

  const getRoleConfig = (designation: string) => {
    const d = designation?.toUpperCase() ?? "";
    if (d === "CEO") {
      return {
        color: theme.palette.secondary.main,
        icon: "👑",
        bgColor: alpha(theme.palette.secondary.main, 0.1),
        borderColor: theme.palette.secondary.main,
      };
    }
    if (d.includes("MANAGER")) {
      return {
        color: theme.palette.error.main,
        icon: "🎯",
        bgColor: alpha(theme.palette.error.main, 0.1),
        borderColor: theme.palette.error.main,
      };
    }
    if (d.includes("LEAD")) {
      return {
        color: theme.palette.primary.main,
        icon: "⭐",
        bgColor: alpha(theme.palette.primary.main, 0.1),
        borderColor: theme.palette.primary.main,
      };
    }
    if (d.includes("SENIOR")) {
      return {
        color: theme.palette.success.main,
        icon: "🚀",
        bgColor: alpha(theme.palette.success.main, 0.1),
        borderColor: theme.palette.success.main,
      };
    }
    return {
      color: theme.palette.warning.main,
      icon: "👨‍💻",
      bgColor: alpha(theme.palette.warning.main, 0.1),
      borderColor: theme.palette.warning.main,
    };
  };

  const toggleNode = (username: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const CompactEmployeeNode = ({
    employee,
    level = 0,
  }: {
    employee: Employee;
    level?: number;
  }) => {
    const config = getRoleConfig(employee.designation);
    const isExpanded = expandedNodes.has(employee.username);
    const hasChildren = !!employee.children?.length;
    const initials = `${employee.first_name?.[0] ?? ""}${employee.last_name?.[0] ?? ""}`;

    return (
      <Box sx={{ mb: 0.5 }}>
        <Card
          onClick={() => setSelectedEmployee(employee)}
          sx={{
            cursor: "pointer",
            ml: isMobile ? level * 1 : level * 2,
            transition: "all 0.2s ease-in-out",
            borderLeft: `3px solid ${config.borderColor}`,
            backgroundColor: config.bgColor,
            "&:hover": {
              transform: "translateX(2px)",
              boxShadow: theme.shadows[2],
              backgroundColor: alpha(config.color, 0.15),
            },
          }}
        >
          <CardContent
            sx={{
              p: { xs: 0.75, sm: 1 },
              "&:last-child": { pb: { xs: 0.75, sm: 1 } },
            }}
          >
            <Grid container alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
              <Grid item>
                <Avatar
                  src={employee.employee_photo || undefined}
                  sx={{
                    width: { xs: 32, sm: 28 },
                    height: { xs: 32, sm: 28 },
                    backgroundColor: config.color,
                    color: theme.palette.getContrastText(config.color),
                    fontSize: { xs: "0.75rem", sm: "0.7rem" },
                    fontWeight: 600,
                  }}
                >
                  {initials}
                </Avatar>
              </Grid>

              <Grid item xs>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    mb: 0.25,
                    lineHeight: 1.2,
                    fontSize: { xs: "0.8rem", sm: "0.875rem" },
                  }}
                >
                  {employee.first_name} {employee.last_name}
                </Typography>

                <Box sx={{ display: "flex", alignItems: "center", mb: 0.25 }}>
                  <Typography
                    variant="caption"
                    sx={{ mr: 0.25, fontSize: { xs: "0.7rem", sm: "0.65rem" } }}
                  >
                    {config.icon}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontSize: { xs: "0.7rem", sm: "0.65rem" },
                    }}
                  >
                    {isMobile && employee.designation.length > 20
                      ? employee.designation.substring(0, 20) + "..."
                      : employee.designation}
                  </Typography>
                </Box>

                <Chip
                  label={
                    isMobile && employee.department.length > 15
                      ? employee.department.substring(0, 15) + "..."
                      : employee.department
                  }
                  size="small"
                  sx={{
                    height: { xs: 18, sm: 16 },
                    fontSize: { xs: "0.6rem", sm: "0.55rem" },
                    backgroundColor: alpha(config.color, 0.2),
                    color: config.color,
                    fontWeight: 500,
                    "& .MuiChip-label": { px: { xs: 0.5, sm: 0.75 } },
                  }}
                />
              </Grid>

              {hasChildren && (
                <Grid item>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNode(employee.username);
                    }}
                    sx={{
                      color: config.color,
                      backgroundColor: alpha(config.color, 0.1),
                      width: { xs: 28, sm: 24 },
                      height: { xs: 28, sm: 24 },
                      "&:hover": { backgroundColor: alpha(config.color, 0.2) },
                    }}
                  >
                    {isExpanded ? (
                      <ExpandLess
                        sx={{ fontSize: { xs: "1.1rem", sm: "1rem" } }}
                      />
                    ) : (
                      <ExpandMore
                        sx={{ fontSize: { xs: "1.1rem", sm: "1rem" } }}
                      />
                    )}
                  </IconButton>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box
              sx={{
                ml: { xs: 1, sm: 1.5 },
                pl: { xs: 0.75, sm: 1 },
                borderLeft: `1px dashed ${alpha(theme.palette.divider, 0.3)}`,
                mt: 0.5,
              }}
            >
              {employee.children!.map((child) => (
                <CompactEmployeeNode
                  key={child.username}
                  employee={child}
                  level={level + 1}
                />
              ))}
            </Box>
          </Collapse>
        )}
      </Box>
    );
  };

  const hierarchicalData = useMemo((): Employee | null => {
    if (!employees.length) return null;

    const ceo = employees.find((e) => e.designation?.toUpperCase() === "CEO");
    const managers = employees.filter(
      (e) =>
        e.designation?.toUpperCase().includes("MANAGER") &&
        e.designation?.toUpperCase() !== "CEO",
    );
    const root = ceo ?? managers[0] ?? employees[0];

    const buildTeamStructure = (manager: Employee): Employee => {
      const deptEmployees = employees.filter(
        (e) =>
          e.department === manager.department &&
          e.username !== manager.username,
      );
      const leads = deptEmployees.filter((e) =>
        e.designation?.toUpperCase().includes("LEAD"),
      );
      const others = deptEmployees.filter(
        (e) => !e.designation?.toUpperCase().includes("LEAD"),
      );

      return {
        ...manager,
        children: [
          ...leads.map((lead) => ({
            ...lead,
            children: others.filter((e) => e.department === lead.department),
          })),
          ...others.filter(
            (e) => !leads.some((lead) => lead.department === e.department),
          ),
        ],
      };
    };

    if (ceo) {
      return {
        ...ceo,
        children: managers.map(buildTeamStructure),
      };
    }

    // No CEO — group by department under a virtual root
    return {
      ...root,
      children: managers.map(buildTeamStructure),
    };
  }, [employees]);

  const stats = useMemo(
    () => [
      {
        label: "Total Employees",
        value: employees.length,
        icon: <Person />,
        color: theme.palette.primary.main,
      },
      {
        label: "Departments",
        value: new Set(employees.map((e) => e.department).filter(Boolean)).size,
        icon: <Business />,
        color: theme.palette.secondary.main,
      },
      {
        label: "Managers",
        value: employees.filter(
          (e) =>
            e.designation?.toUpperCase().includes("MANAGER") ||
            e.designation?.toUpperCase() === "CEO",
        ).length,
        icon: <Group />,
        color: theme.palette.error.main,
      },
      {
        label: "Team Leads",
        value: employees.filter((e) =>
          e.designation?.toUpperCase().includes("LEAD"),
        ).length,
        icon: <TrendingUp />,
        color: theme.palette.warning.main,
      },
    ],
    [employees, theme.palette],
  );

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        backgroundColor: theme.palette.background.default,
        minHeight: "100vh",
      }}
    >
      {/* Statistics */}
      <Grid
        container
        spacing={{ xs: 0.75, sm: 1 }}
        sx={{ mb: { xs: 0.75, sm: 1 } }}
      >
        {stats.map((stat, index) => (
          <Grid item xs={6} sm={3} key={index}>
            <Card
              elevation={1}
              sx={{
                transition: "all 0.2s ease-in-out",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: theme.shadows[4],
                },
              }}
            >
              <CardContent
                sx={{
                  p: { xs: 1, sm: 1.5 },
                  "&:last-child": { pb: { xs: 1, sm: 1.5 } },
                }}
              >
                <Grid
                  container
                  alignItems="center"
                  spacing={{ xs: 0.75, sm: 1 }}
                >
                  <Grid item>
                    <Box
                      sx={{
                        p: { xs: 0.5, sm: 0.5 },
                        borderRadius: 1,
                        backgroundColor: alpha(stat.color, 0.1),
                        color: stat.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {cloneElement(stat.icon, {
                        sx: { fontSize: { xs: "0.9rem", sm: "1rem" } },
                      })}
                    </Box>
                  </Grid>
                  <Grid item xs>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: stat.color,
                        lineHeight: 1,
                        mb: 0.25,
                        fontSize: { xs: "1.1rem", sm: "1.25rem" },
                      }}
                    >
                      {loading ? "—" : stat.value}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: { xs: "0.65rem", sm: "0.75rem" },
                      }}
                    >
                      {stat.label}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Role Legend */}
      <Paper
        elevation={1}
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          mb: { xs: 0.75, sm: 1 },
          borderRadius: 1,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            mb: { xs: 0.75, sm: 1 },
            fontWeight: 600,
            fontSize: { xs: "0.85rem", sm: "0.875rem" },
          }}
        >
          Role Legend
        </Typography>
        <Box
          sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 0.5, sm: 0.5 } }}
        >
          {[
            { role: "CEO", icon: "👑", designation: "CEO" },
            { role: "Manager", icon: "🎯", designation: "MANAGER" },
            { role: "Team Lead", icon: "⭐", designation: "LEAD" },
            { role: "Senior", icon: "🚀", designation: "SENIOR" },
            { role: "Engineer", icon: "👨‍💻", designation: "ENGINEER" },
          ].map((item, index) => {
            const config = getRoleConfig(item.designation);
            return (
              <Chip
                key={index}
                icon={<span style={{ fontSize: "0.7rem" }}>{item.icon}</span>}
                label={item.role}
                size="small"
                sx={{
                  backgroundColor: config.bgColor,
                  color: config.color,
                  borderColor: config.borderColor,
                  border: `1px solid ${config.borderColor}`,
                  fontWeight: 500,
                  height: { xs: 22, sm: 24 },
                  fontSize: { xs: "0.65rem", sm: "0.7rem" },
                }}
              />
            );
          })}
        </Box>
      </Paper>

      {/* Org Tree */}
      <Paper elevation={1} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1 }}>
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            mb: { xs: 1.5, sm: 2 },
            textAlign: "center",
            fontSize: { xs: "1rem", sm: "1rem" },
          }}
        >
          Organizational Hierarchy
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mx: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && !hierarchicalData && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: "center", py: 4 }}
          >
            No active employees found.
          </Typography>
        )}

        {!loading && !error && hierarchicalData && (
          <Box
            sx={{
              maxHeight: { xs: "calc(100vh - 320px)", sm: "70vh" },
              overflow: "auto",
            }}
          >
            <CompactEmployeeNode employee={hierarchicalData} />
          </Box>
        )}
      </Paper>

      {/* Employee Detail Dialog */}
      <Dialog
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: { borderRadius: { xs: 0, sm: 2 }, m: { xs: 0, sm: 2 } },
        }}
      >
        {selectedEmployee && (
          <>
            <DialogTitle
              sx={{
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                color: theme.palette.primary.contrastText,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: { xs: 1.5, sm: 2 },
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 600, fontSize: { xs: "1rem", sm: "1rem" } }}
              >
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </Typography>
              <IconButton
                onClick={() => setSelectedEmployee(null)}
                sx={{ color: theme.palette.primary.contrastText, p: 0.5 }}
                size="small"
              >
                <Close sx={{ fontSize: { xs: "1.3rem", sm: "1.2rem" } }} />
              </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: { xs: 1.5, sm: 2 } }}>
              <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
                <Grid item xs={12}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mb: { xs: 1.25, sm: 1.5 },
                    }}
                  >
                    <Avatar
                      src={selectedEmployee.employee_photo || undefined}
                      sx={{
                        width: { xs: 48, sm: 40 },
                        height: { xs: 48, sm: 40 },
                        mr: { xs: 1.25, sm: 1.5 },
                        backgroundColor: getRoleConfig(
                          selectedEmployee.designation,
                        ).color,
                        fontSize: { xs: "1.1rem", sm: "1rem" },
                        fontWeight: 600,
                      }}
                    >
                      {selectedEmployee.first_name?.[0]}
                      {selectedEmployee.last_name?.[0]}
                    </Avatar>
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 600,
                          fontSize: { xs: "1rem", sm: "1rem" },
                        }}
                      >
                        {selectedEmployee.first_name}{" "}
                        {selectedEmployee.last_name}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: { xs: "0.85rem", sm: "0.875rem" } }}
                      >
                        {selectedEmployee.designation}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12}>
                  <Box
                    sx={{
                      p: { xs: 1.25, sm: 1.5 },
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                      borderRadius: 1,
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                    }}
                  >
                    <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
                      <Grid item xs={6}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.75rem", sm: "0.75rem" } }}
                        >
                          Department
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            fontSize: { xs: "0.85rem", sm: "0.875rem" },
                          }}
                        >
                          {selectedEmployee.department || "—"}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: "0.75rem", sm: "0.75rem" } }}
                        >
                          Status
                        </Typography>
                        <Chip
                          label={selectedEmployee.employeeStatus}
                          size="small"
                          color="success"
                          sx={{
                            fontWeight: 500,
                            height: { xs: 22, sm: 20 },
                            fontSize: { xs: "0.7rem", sm: "0.7rem" },
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>

            <DialogActions sx={{ p: { xs: 1.5, sm: 2 }, pt: 0 }}>
              <Button
                onClick={() => setSelectedEmployee(null)}
                size="small"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: { xs: "0.85rem", sm: "0.875rem" },
                  "&:hover": {
                    backgroundColor: alpha(theme.palette.text.secondary, 0.08),
                  },
                }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default OrganisationTree;
