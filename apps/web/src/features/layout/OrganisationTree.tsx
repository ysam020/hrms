import { cloneElement, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@web/shared/components/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useTheme } from "@mui/material";
import { useMediaQuery } from "@mui/material";
import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";

import Person from "@mui/icons-material/Person";
import Business from "@mui/icons-material/Business";
import Group from "@mui/icons-material/Group";
import TrendingUp from "@mui/icons-material/TrendingUp";
import Close from "@mui/icons-material/Close";

import apiClient from "@web/core/http/axiosConfig";

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

type OrgChartPerson = {
  id: string;
  name: string;
  username: string;
  designation: string | null;
  employeePhoto: string | null;
};

type OrgChartTeam = {
  _id: string;
  teamName: string;
  leader: OrgChartPerson;
  members: OrgChartPerson[];
};

type OrgChartResponse = {
  ceo: (OrgChartPerson & { designation: string; department: string }) | null;
  teams: OrgChartTeam[];
  // Active employees not yet on any team — e.g. a join request approved
  // today but never assigned a department. Surfaced explicitly instead of
  // silently dropped, so headcount matches the real active employee count.
  unassigned: OrgChartPerson[];
  // Every employee record regardless of status (active/resigned/
  // terminated/absconded) — used only for the "Total Employees" stat card,
  // the tree itself only ever shows active headcount.
  totalEmployeeCount: number;
  // Per-status counts backing the "Total Employees" breakdown.
  employeeStatusBreakdown: {
    active: number;
    resigned: number;
    terminated: number;
    absconded: number;
  };
};

type RoleConfig = {
  color: string;
  icon: string;
  bgColor: string;
  borderColor: string;
};

const toEmployee = (person: OrgChartPerson, department: string): Employee => {
  const [first_name, ...rest] = person.name.split(" ");
  return {
    id: person.id,
    first_name: first_name ?? person.name,
    last_name: rest.join(" "),
    username: person.username,
    department,
    designation: person.designation ?? "",
    employeeStatus: "Active",
    employee_photo: person.employeePhoto ?? "",
  };
};

const getRoleConfig = (designation: string, theme: Theme): RoleConfig => {
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

// Classic CSS "family tree" connector pattern applied via descendant
// selectors on one wrapper — every <ul>/<li> nested inside (however deep the
// recursion) picks up the lines automatically, no per-node line math needed.
const treeConnectorSx = (theme: Theme) => ({
  "& ul": {
    display: "flex",
    justifyContent: "center",
    m: 0,
    p: 0,
    pt: { xs: "24px", sm: "32px" },
    position: "relative" as const,
  },
  "& li": {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    listStyle: "none",
    position: "relative" as const,
    px: { xs: "6px", sm: "10px" },
    pt: { xs: "24px", sm: "32px" },
  },
  "& li::before, & li::after": {
    content: '""',
    position: "absolute" as const,
    top: 0,
    right: "50%",
    width: "50%",
    height: { xs: "24px", sm: "32px" },
    borderTop: `2px solid ${theme.palette.divider}`,
  },
  "& li::after": {
    right: "auto",
    left: "50%",
    borderLeft: `2px solid ${theme.palette.divider}`,
  },
  "& li:only-child::before, & li:only-child::after": {
    display: "none",
  },
  "& li:only-child": {
    pt: 0,
  },
  "& li:first-of-type::before, & li:last-of-type::after": {
    borderTopColor: "transparent",
  },
  "& li:last-of-type::before": {
    borderRight: `2px solid ${theme.palette.divider}`,
    borderRadius: "0 6px 0 0",
  },
  "& li:first-of-type::after": {
    borderRadius: "6px 0 0 0",
  },
  "& ul ul::before": {
    content: '""',
    position: "absolute" as const,
    top: 0,
    left: "50%",
    width: 0,
    height: { xs: "24px", sm: "32px" },
    borderLeft: `2px solid ${theme.palette.divider}`,
  },
});

const LARGE_TEAM_THRESHOLD = 8;

const NodeCard = ({
  employee,
  depth,
  theme,
  onClick,
}: {
  employee: Employee;
  depth: number;
  theme: Theme;
  onClick: () => void;
}) => {
  const config = getRoleConfig(employee.designation, theme);
  const initials = `${employee.first_name?.[0] ?? ""}${employee.last_name?.[0] ?? ""}`;
  const solid = depth === 0;
  const textColor = solid
    ? theme.palette.getContrastText(config.color)
    : theme.palette.text.primary;

  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        minWidth: depth === 0 ? 190 : depth === 1 ? 165 : 135,
        px: depth === 0 ? 2.25 : 1.5,
        py: depth === 0 ? 1.25 : 0.875,
        borderRadius: 3,
        border: `1.5px solid ${config.borderColor}`,
        backgroundColor: solid
          ? config.color
          : alpha(config.color, depth === 1 ? 0.28 : 0.12),
        boxShadow: theme.shadows[1],
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[4],
        },
      }}
    >
      <Avatar
        src={employee.employee_photo || undefined}
        sx={{
          width: depth === 0 ? 38 : 30,
          height: depth === 0 ? 38 : 30,
          fontSize: "0.72rem",
          fontWeight: 700,
          backgroundColor: solid ? alpha("#fff", 0.25) : config.color,
          color: solid
            ? theme.palette.getContrastText(config.color)
            : theme.palette.getContrastText(config.color),
        }}
      >
        {initials}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 700,
            fontSize: depth === 0 ? "0.88rem" : "0.78rem",
            color: textColor,
          }}
        >
          {employee.first_name} {employee.last_name}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{
            display: "block",
            fontSize: "0.66rem",
            fontWeight: 600,
            color: solid ? alpha(textColor, 0.85) : config.color,
          }}
        >
          {config.icon} {employee.designation || employee.department}
        </Typography>
      </Box>
    </Box>
  );
};

const RosterGrid = ({
  members,
  theme,
  onSelect,
}: {
  members: Employee[];
  theme: Theme;
  onSelect: (employee: Employee) => void;
}) => (
  <Paper
    variant="outlined"
    sx={{
      p: 1.25,
      borderRadius: 2,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: 0.75,
      maxWidth: 560,
      backgroundColor: alpha(theme.palette.text.primary, 0.02),
    }}
  >
    {members.map((member) => {
      const config = getRoleConfig(member.designation, theme);
      const initials = `${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`;
      return (
        <Box
          key={member.username}
          onClick={() => onSelect(member)}
          sx={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            p: 0.75,
            borderRadius: 1.5,
            border: `1px solid ${config.borderColor}`,
            backgroundColor: alpha(config.color, 0.1),
            transition: "background-color 0.15s ease",
            "&:hover": { backgroundColor: alpha(config.color, 0.2) },
          }}
        >
          <Avatar
            src={member.employee_photo || undefined}
            sx={{
              width: 24,
              height: 24,
              fontSize: "0.6rem",
              fontWeight: 700,
              backgroundColor: config.color,
            }}
          >
            {initials}
          </Avatar>
          <Typography
            variant="caption"
            noWrap
            sx={{ fontWeight: 600, fontSize: "0.68rem" }}
          >
            {member.first_name} {member.last_name}
          </Typography>
        </Box>
      );
    })}
  </Paper>
);

const OrgTreeNode = ({
  employee,
  depth,
  theme,
  onSelect,
}: {
  employee: Employee;
  depth: number;
  theme: Theme;
  onSelect: (employee: Employee) => void;
}) => {
  const children = employee.children ?? [];
  // Large teams (e.g. 33-person Engineering) would blow the tree out
  // thousands of px wide if every member got its own connector line — fold
  // them into one bordered roster grid under a single trunk line instead.
  const useRoster = depth === 1 && children.length > LARGE_TEAM_THRESHOLD;

  return (
    <>
      <NodeCard
        employee={employee}
        depth={depth}
        theme={theme}
        onClick={() => onSelect(employee)}
      />
      {children.length > 0 && (
        <Box component="ul" sx={{ listStyle: "none" }}>
          {useRoster ? (
            <Box component="li" sx={{ listStyle: "none" }}>
              <RosterGrid
                members={children}
                theme={theme}
                onSelect={onSelect}
              />
            </Box>
          ) : (
            children.map((child) => (
              <Box
                component="li"
                key={child.username}
                sx={{ listStyle: "none" }}
              >
                <OrgTreeNode
                  employee={child}
                  depth={depth + 1}
                  theme={theme}
                  onSelect={onSelect}
                />
              </Box>
            ))
          )}
        </Box>
      )}
    </>
  );
};

const OrganisationTree = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [orgChart, setOrgChart] = useState<OrgChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgChart = async () => {
      try {
        setLoading(true);
        // Built from the Team collection (see permissions.ts:getOrgChart) —
        // not the full employee list. Previously this page fetched every
        // user and tried to reconstruct a hierarchy client-side by matching
        // designation substrings ("MANAGER"/"LEAD"/"CEO"), which silently
        // broke whenever a department had zero or more than one manager.
        // Teams already have exactly one leader each, so the tree just
        // mirrors that directly.
        const res = await apiClient.get("/get-org-chart");
        const data: OrgChartResponse = res.data?.data ?? {
          ceo: null,
          teams: [],
          unassigned: [],
          totalEmployeeCount: 0,
          employeeStatusBreakdown: {
            active: 0,
            resigned: 0,
            terminated: 0,
            absconded: 0,
          },
        };
        setOrgChart(data);
      } catch {
        setError("Failed to load the organization chart. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchOrgChart();
  }, []);

  const hierarchicalData = useMemo((): Employee | null => {
    if (!orgChart) return null;
    const { ceo, teams } = orgChart;

    const buildTeam = (team: OrgChartTeam): Employee => ({
      ...toEmployee(team.leader, team.teamName),
      children: team.members.map((m) => toEmployee(m, team.teamName)),
    });

    if (ceo) {
      return {
        ...toEmployee(ceo, ceo.department || "Executive"),
        designation: ceo.designation || "CEO",
        children: teams.map(buildTeam),
      };
    }

    // No CEO on record — fall back to the first team's leader as a virtual
    // root so the rest of the org still renders instead of showing nothing.
    const [firstTeam, ...restTeams] = teams;
    if (!firstTeam) return null;
    const rootTeam = buildTeam(firstTeam);
    return {
      ...rootTeam,
      children: [...(rootTeam.children ?? []), ...restTeams.map(buildTeam)],
    };
  }, [orgChart]);

  const stats = useMemo(() => {
    const teams = orgChart?.teams ?? [];
    const breakdown = orgChart?.employeeStatusBreakdown;
    return [
      {
        label: "Total Employees",
        value: orgChart?.totalEmployeeCount ?? 0,
        icon: <Person />,
        color: theme.palette.primary.main,
        breakdown: breakdown
          ? [
              {
                label: "Active",
                value: breakdown.active,
                color: theme.palette.success.main,
              },
              {
                label: "Resigned",
                value: breakdown.resigned,
                color: theme.palette.warning.main,
              },
              {
                label: "Terminated",
                value: breakdown.terminated,
                color: theme.palette.error.main,
              },
              {
                label: "Absconded",
                value: breakdown.absconded,
                color: theme.palette.text.disabled,
              },
            ]
          : undefined,
      },
      {
        label: "Teams",
        value: teams.length,
        icon: <Business />,
        color: theme.palette.secondary.main,
      },
      {
        label: "Team Leaders",
        value: teams.length,
        icon: <Group />,
        color: theme.palette.error.main,
      },
      {
        label: "Largest Team",
        value: teams.reduce((max, t) => Math.max(max, t.members.length), 0),
        icon: <TrendingUp />,
        color: theme.palette.warning.main,
      },
    ];
  }, [orgChart, theme.palette]);

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
                {stat.breakdown && !loading && (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: { xs: 0.5, sm: 0.75 },
                      mt: { xs: 0.75, sm: 1 },
                    }}
                  >
                    {stat.breakdown.map((item) => (
                      <Box
                        key={item.label}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.4,
                        }}
                      >
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            backgroundColor: item.color,
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: { xs: "0.6rem", sm: "0.7rem" },
                            color: theme.palette.text.secondary,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.value} {item.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
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
            const config = getRoleConfig(item.designation, theme);
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
              overflow: "auto",
              maxHeight: { xs: "calc(100vh - 320px)", sm: "75vh" },
              pb: 1,
            }}
          >
            <Box
              sx={{
                ...treeConnectorSx(theme),
                display: "inline-block",
                minWidth: "100%",
              }}
            >
              <Box
                component="ul"
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  listStyle: "none",
                  m: 0,
                  p: 0,
                }}
              >
                <Box component="li" sx={{ listStyle: "none" }}>
                  <OrgTreeNode
                    employee={hierarchicalData}
                    depth={0}
                    theme={theme}
                    onSelect={setSelectedEmployee}
                  />
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Pending Team Assignment — active employees (e.g. freshly-approved
          join requests) who haven't been put on a team yet. Shown separately
          rather than dropped, so they don't silently disappear from headcount. */}
      {!loading && !error && (orgChart?.unassigned.length ?? 0) > 0 && (
        <Paper
          elevation={1}
          sx={{
            p: { xs: 1.5, sm: 2 },
            borderRadius: 1,
            mt: { xs: 0.75, sm: 1 },
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              mb: { xs: 1, sm: 1.5 },
              fontSize: { xs: "1rem", sm: "1rem" },
              color: theme.palette.warning.main,
            }}
          >
            Pending Team Assignment ({orgChart?.unassigned.length})
          </Typography>
          <RosterGrid
            members={(orgChart?.unassigned ?? []).map((p) =>
              toEmployee(p, "Unassigned"),
            )}
            theme={theme}
            onSelect={setSelectedEmployee}
          />
        </Paper>
      )}

      {/* Employee Detail Dialog */}
      <Dialog
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
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
                aria-label="Close employee details"
                sx={{ color: theme.palette.primary.contrastText, p: 0.5 }}
                size="small"
              >
                <Close
                  aria-hidden="true"
                  sx={{ fontSize: { xs: "1.3rem", sm: "1.2rem" } }}
                />
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
                          theme,
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
                variant="ghost"
                onClick={() => setSelectedEmployee(null)}
                size="small"
                style={{
                  color: theme.palette.text.secondary,
                  fontSize: "0.875rem",
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
