import React, { useState, useMemo } from "react";
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

const OrganisationTree = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [expandedNodes, setExpandedNodes] = useState(
    new Set(["rajesh_agarwal"]),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const employeeData = useMemo(
    () => [
      {
        first_name: "Rajesh",
        middle_name: "Kumar",
        last_name: "Agarwal",
        username: "rajesh_agarwal",
        department: "EXECUTIVE",
        designation: "CEO",
        employeeStatus: "Active",
      },
      {
        first_name: "Priya",
        middle_name: "",
        last_name: "Sharma",
        username: "priya_sharma",
        department: "SOFTWARE DEVELOPMENT",
        designation: "DEVELOPMENT MANAGER",
        employeeStatus: "Active",
      },
      {
        first_name: "Amit",
        middle_name: "",
        last_name: "Singh",
        username: "amit_singh",
        department: "QUALITY ASSURANCE",
        designation: "QA MANAGER",
        employeeStatus: "Active",
      },
      {
        first_name: "Sunita",
        middle_name: "Rani",
        last_name: "Gupta",
        username: "sunita_gupta",
        department: "HUMAN RESOURCES",
        designation: "HR MANAGER",
        employeeStatus: "Active",
      },
      {
        first_name: "Vikram",
        middle_name: "",
        last_name: "Patel",
        username: "vikram_patel",
        department: "DEVOPS",
        designation: "DEVOPS MANAGER",
        employeeStatus: "Active",
      },
      {
        first_name: "Neha",
        middle_name: "",
        last_name: "Reddy",
        username: "neha_reddy",
        department: "SOFTWARE DEVELOPMENT",
        designation: "TEAM LEAD",
        employeeStatus: "Active",
      },
      {
        first_name: "Arjun",
        middle_name: "",
        last_name: "Menon",
        username: "arjun_menon",
        department: "SOFTWARE DEVELOPMENT",
        designation: "TEAM LEAD",
        employeeStatus: "Active",
      },
      {
        first_name: "Kavya",
        middle_name: "",
        last_name: "Iyer",
        username: "kavya_iyer",
        department: "QUALITY ASSURANCE",
        designation: "QA TEAM LEAD",
        employeeStatus: "Active",
      },
      {
        first_name: "Pooja",
        middle_name: "",
        last_name: "Nair",
        username: "pooja_nair",
        department: "DEVOPS",
        designation: "DEVOPS TEAM LEAD",
        employeeStatus: "Active",
      },
      {
        first_name: "Rahul",
        middle_name: "",
        last_name: "Verma",
        username: "rahul_verma",
        department: "SOFTWARE DEVELOPMENT",
        designation: "SENIOR SOFTWARE ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Shreya",
        middle_name: "",
        last_name: "Bansal",
        username: "shreya_bansal",
        department: "SOFTWARE DEVELOPMENT",
        designation: "FRONTEND DEVELOPER",
        employeeStatus: "Active",
      },
      {
        first_name: "Karan",
        middle_name: "Singh",
        last_name: "Chauhan",
        username: "karan_chauhan",
        department: "SOFTWARE DEVELOPMENT",
        designation: "BACKEND DEVELOPER",
        employeeStatus: "Active",
      },
      {
        first_name: "Divya",
        middle_name: "",
        last_name: "Mishra",
        username: "divya_mishra",
        department: "SOFTWARE DEVELOPMENT",
        designation: "FULL STACK DEVELOPER",
        employeeStatus: "Active",
      },
      {
        first_name: "Aditya",
        middle_name: "",
        last_name: "Kapoor",
        username: "aditya_kapoor",
        department: "SOFTWARE DEVELOPMENT",
        designation: "MOBILE APP DEVELOPER",
        employeeStatus: "Active",
      },
      {
        first_name: "Riya",
        middle_name: "",
        last_name: "Malhotra",
        username: "riya_malhotra",
        department: "SOFTWARE DEVELOPMENT",
        designation: "SOFTWARE ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Sanjay",
        middle_name: "Kumar",
        last_name: "Rajput",
        username: "sanjay_rajput",
        department: "SOFTWARE DEVELOPMENT",
        designation: "JUNIOR DEVELOPER",
        employeeStatus: "Active",
      },
      {
        first_name: "Meera",
        middle_name: "",
        last_name: "Saxena",
        username: "meera_saxena",
        department: "QUALITY ASSURANCE",
        designation: "SENIOR QA ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Deepak",
        middle_name: "",
        last_name: "Sinha",
        username: "deepak_sinha",
        department: "QUALITY ASSURANCE",
        designation: "QA ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Ishita",
        middle_name: "",
        last_name: "Tiwari",
        username: "ishita_tiwari",
        department: "QUALITY ASSURANCE",
        designation: "TEST AUTOMATION ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Manish",
        middle_name: "",
        last_name: "Bhatt",
        username: "manish_bhatt",
        department: "HUMAN RESOURCES",
        designation: "HR EXECUTIVE",
        employeeStatus: "Active",
      },
      {
        first_name: "Sneha",
        middle_name: "",
        last_name: "Khanna",
        username: "sneha_khanna",
        department: "DEVOPS",
        designation: "CLOUD ENGINEER",
        employeeStatus: "Active",
      },
      {
        first_name: "Tanvi",
        middle_name: "",
        last_name: "Kulkarni",
        username: "tanvi_kulkarni",
        department: "DEVOPS",
        designation: "SYSTEM ADMINISTRATOR",
        employeeStatus: "Active",
      },
    ],
    [],
  );

  const getRoleConfig = (designation) => {
    if (designation === "CEO") {
      return {
        color: theme.palette.secondary.main,
        icon: "👑",
        bgColor: alpha(theme.palette.secondary.main, 0.1),
        borderColor: theme.palette.secondary.main,
      };
    }
    if (designation.includes("MANAGER")) {
      return {
        color: theme.palette.error.main,
        icon: "🎯",
        bgColor: alpha(theme.palette.error.main, 0.1),
        borderColor: theme.palette.error.main,
      };
    }
    if (designation.includes("LEAD")) {
      return {
        color: theme.palette.primary.main,
        icon: "⭐",
        bgColor: alpha(theme.palette.primary.main, 0.1),
        borderColor: theme.palette.primary.main,
      };
    }
    if (designation.includes("SENIOR")) {
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

  const toggleNode = (username) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(username)) {
      newExpanded.delete(username);
    } else {
      newExpanded.add(username);
    }
    setExpandedNodes(newExpanded);
  };

  const CompactEmployeeNode = ({ employee, level = 0 }) => {
    const config = getRoleConfig(employee.designation);
    const isExpanded = expandedNodes.has(employee.username);
    const hasChildren = employee.children && employee.children.length > 0;

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
                  sx={{
                    width: { xs: 32, sm: 28 },
                    height: { xs: 32, sm: 28 },
                    backgroundColor: config.color,
                    color: theme.palette.getContrastText(config.color),
                    fontSize: { xs: "0.75rem", sm: "0.7rem" },
                    fontWeight: 600,
                  }}
                >
                  {employee.first_name[0]}
                  {employee.last_name[0]}
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
                    sx={{
                      mr: 0.25,
                      fontSize: { xs: "0.7rem", sm: "0.65rem" },
                    }}
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
                    "& .MuiChip-label": {
                      px: { xs: 0.5, sm: 0.75 },
                    },
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
                      "&:hover": {
                        backgroundColor: alpha(config.color, 0.2),
                      },
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
              {employee.children.map((child) => (
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

  // Transform data into compact hierarchical structure
  const hierarchicalData = useMemo(() => {
    const ceo = employeeData.find((emp) => emp.designation === "CEO");
    const managers = employeeData.filter(
      (emp) => emp.designation.includes("MANAGER") && emp.designation !== "CEO",
    );

    const buildTeamStructure = (manager) => {
      const departmentEmployees = employeeData.filter(
        (emp) =>
          emp.department === manager.department &&
          emp.username !== manager.username,
      );

      const teamLeads = departmentEmployees.filter((emp) =>
        emp.designation.includes("LEAD"),
      );

      const individualContributors = departmentEmployees.filter(
        (emp) => !emp.designation.includes("LEAD"),
      );

      return {
        ...manager,
        children: [
          ...teamLeads.map((lead) => ({
            ...lead,
            children: individualContributors.filter(
              (emp) => emp.department === lead.department,
            ),
          })),
          ...individualContributors.filter(
            (emp) =>
              !teamLeads.some((lead) => lead.department === emp.department),
          ),
        ],
      };
    };

    return {
      ...ceo,
      children: managers.map(buildTeamStructure),
    };
  }, [employeeData]);

  const stats = useMemo(
    () => [
      {
        label: "Total Employees",
        value: employeeData.length,
        icon: <Person />,
        color: theme.palette.primary.main,
      },
      {
        label: "Departments",
        value: [...new Set(employeeData.map((e) => e.department))].length,
        icon: <Business />,
        color: theme.palette.secondary.main,
      },
      {
        label: "Managers",
        value: employeeData.filter(
          (e) => e.designation.includes("MANAGER") || e.designation === "CEO",
        ).length,
        icon: <Group />,
        color: theme.palette.error.main,
      },
      {
        label: "Team Leads",
        value: employeeData.filter((e) => e.designation.includes("LEAD"))
          .length,
        icon: <TrendingUp />,
        color: theme.palette.warning.main,
      },
    ],
    [employeeData, theme.palette],
  );

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        backgroundColor: theme.palette.background.default,
        minHeight: "100vh",
      }}
    >
      {/* Compact Statistics Section */}
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
                        fontSize: { xs: "0.9rem", sm: "1rem" },
                      }}
                    >
                      {React.cloneElement(stat.icon, {
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
                      {stat.value}
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

      {/* Compact Role Legend */}
      <Paper
        elevation={1}
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          mb: { xs: 0.75, sm: 1 },
          borderRadius: 1,
          backgroundColor: theme.palette.background.paper,
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

      {/* Compact Organization Tree */}
      <Paper
        elevation={1}
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 1,
          backgroundColor: theme.palette.background.paper,
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            mb: { xs: 1.5, sm: 2 },
            textAlign: "center",
            color: theme.palette.text.primary,
            fontSize: { xs: "1rem", sm: "1rem" },
          }}
        >
          Organizational Hierarchy
        </Typography>

        <Box
          sx={{
            maxHeight: { xs: "calc(100vh - 320px)", sm: "70vh" },
            overflow: "auto",
          }}
        >
          <CompactEmployeeNode employee={hierarchicalData} />
        </Box>
      </Paper>

      {/* Employee Detail Dialog */}
      <Dialog
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 2 },
            backgroundColor: theme.palette.background.paper,
            m: { xs: 0, sm: 2 },
          },
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
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: "1rem", sm: "1rem" },
                }}
              >
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </Typography>
              <IconButton
                onClick={() => setSelectedEmployee(null)}
                sx={{
                  color: theme.palette.primary.contrastText,
                  p: 0.5,
                }}
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
                      {selectedEmployee.first_name[0]}
                      {selectedEmployee.last_name[0]}
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
                      border: `1px solid ${alpha(
                        theme.palette.primary.main,
                        0.2,
                      )}`,
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
                          {selectedEmployee.department}
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
