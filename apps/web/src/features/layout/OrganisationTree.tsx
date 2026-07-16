import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import { useTheme } from "@mui/material";
import { useMediaQuery } from "@mui/material";

import Person from "@mui/icons-material/Person";
import Business from "@mui/icons-material/Business";
import Group from "@mui/icons-material/Group";
import TrendingUp from "@mui/icons-material/TrendingUp";

import apiClient from "@web/core/http/axiosConfig";
import { OrgTreeNode } from "./org-tree/OrgTreeNode";
import { RosterGrid } from "./org-tree/RosterGrid";
import { StatsCards, type StatCard } from "./org-tree/StatsCards";
import { RoleLegend } from "./org-tree/RoleLegend";
import { EmployeeDetailDialog } from "./org-tree/EmployeeDetailDialog";
import { toEmployee, treeConnectorSx } from "./org-tree/helpers";
import type {
  Employee,
  OrgChartResponse,
  OrgChartTeam,
} from "./org-tree/types";

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

  const stats: StatCard[] = useMemo(() => {
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
      <StatsCards stats={stats} loading={loading} theme={theme} />

      <RoleLegend theme={theme} />

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

      <EmployeeDetailDialog
        employee={selectedEmployee}
        isMobile={isMobile}
        theme={theme}
        onClose={() => setSelectedEmployee(null)}
      />
    </Box>
  );
};

export default OrganisationTree;
