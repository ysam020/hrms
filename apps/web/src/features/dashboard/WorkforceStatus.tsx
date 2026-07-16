import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import GroupsIcon from "@mui/icons-material/Groups";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

const STATUSES = [
  { key: "activeEmployees", label: "Active", color: "#10b981" },
  { key: "resignedEmployees", label: "Resigned", color: "#f59e0b" },
  { key: "terminatedEmployees", label: "Terminated", color: "#ef4444" },
  { key: "abscondedEmployees", label: "Absconded", color: "#6b7280" },
];

function WorkforceStatus() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const isLoading = loading.employeeInsights;
  const overview = data.employeeInsights?.overview;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
      }}
      onClick={() => navigate("/employee-management/insights")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("/employee-management/insights");
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="View workforce status in employee management"
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <GroupsIcon sx={{ fontSize: 14, color: "text.secondary" }} />
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ fontSize: "0.78rem" }}
        >
          Workforce Status
        </Typography>
      </Box>

      {/* Pills grid */}
      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0.6,
          px: 1,
          py: 0.75,
          alignContent: "center",
        }}
      >
        {STATUSES.map((s) => (
          <Box
            key={s.key}
            sx={{
              textAlign: "center",
              py: 0.4,
              borderRadius: 1.5,
              bgcolor: `${s.color}12`,
              border: `1px solid ${s.color}28`,
            }}
          >
            {isLoading ? (
              <Skeleton
                width={28}
                height={20}
                sx={{ mx: "auto", transform: "none" }}
              />
            ) : (
              <Typography
                fontWeight={800}
                sx={{ fontSize: "0.95rem", color: s.color, lineHeight: 1 }}
              >
                {overview?.[s.key] ?? 0}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.55rem",
                color: "text.secondary",
                lineHeight: 1.2,
              }}
            >
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default React.memo(WorkforceStatus);
