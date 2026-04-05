import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import PeopleIcon from "@mui/icons-material/People";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import WorkIcon from "@mui/icons-material/Work";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

function QuickStats() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();

  const today = new Date().toISOString().split("T")[0];
  const upcomingHolidayCount = (data.holidays || []).filter(
    (h) => h.date >= today,
  ).length;
  const activeJobCount = (data.jobOpenings || []).filter(
    (j) => j.status === "Active",
  ).length;
  const pendingLeaveCount = (data.pendingLeaves || []).length;
  const totalEmployees =
    data.employeeInsights?.overview?.totalEmployees ?? null;

  const stats = [
    {
      label: "Total Employees",
      value: totalEmployees,
      icon: <PeopleIcon />,
      color: "#3b82f6",
      bg: "rgba(59,130,246,0.1)",
      path: "/employee-management",
      loading: loading.employeeInsights,
    },
    {
      label: "Pending Leaves",
      value: pendingLeaveCount,
      icon: <EventBusyIcon />,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.1)",
      path: "/attendance",
      loading: loading.pendingLeaves,
    },
    {
      label: "Open Positions",
      value: activeJobCount,
      icon: <WorkIcon />,
      color: "#10b981",
      bg: "rgba(16,185,129,0.1)",
      path: "/job-openings",
      loading: loading.jobOpenings,
    },
    {
      label: "Upcoming Holidays",
      value: upcomingHolidayCount,
      icon: <CelebrationIcon />,
      color: "#8b5cf6",
      bg: "rgba(139,92,246,0.1)",
      path: "/holidays",
      loading: loading.holidays,
    },
  ];

  return (
    <Box sx={{ display: "flex", height: "100%", gap: 1, px: 1, py: 0.75 }}>
      {stats.map((stat) => (
        <Box
          key={stat.label}
          onClick={() => navigate(stat.path)}
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            transition: "all 0.15s ease",
            bgcolor: "background.paper",
            "&:hover": {
              borderColor: stat.color,
              boxShadow: `0 0 0 1px ${stat.color}30`,
              transform: "translateY(-1px)",
            },
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 1.5,
              bgcolor: stat.bg,
              color: stat.color,
              flexShrink: 0,
              "& svg": { fontSize: 18 },
            }}
          >
            {stat.icon}
          </Box>

          <Box>
            {stat.loading ? (
              <>
                <Skeleton width={36} height={22} sx={{ transform: "none" }} />
                <Skeleton width={72} height={11} sx={{ mt: 0.25 }} />
              </>
            ) : (
              <>
                <Typography
                  fontWeight={800}
                  sx={{
                    lineHeight: 1.1,
                    color: stat.color,
                    fontSize: "1.25rem",
                  }}
                >
                  {stat.value ?? "—"}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.65rem",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </Typography>
              </>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default React.memo(QuickStats);
