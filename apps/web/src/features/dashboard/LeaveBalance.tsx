import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

const StatPill = ({ label, value, color, isLoading }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      flex: 1,
      py: 0.75,
      borderRadius: 2,
      bgcolor: `${color}12`,
      border: `1px solid ${color}28`,
    }}
  >
    {isLoading ? (
      <Skeleton width={22} height={20} sx={{ transform: "none" }} />
    ) : (
      <Typography
        fontWeight={800}
        sx={{ fontSize: "1.05rem", color, lineHeight: 1 }}
      >
        {value ?? 0}
      </Typography>
    )}
    <Typography
      variant="caption"
      sx={{
        fontSize: "0.6rem",
        color: "text.secondary",
        mt: 0.25,
        textAlign: "center",
        lineHeight: 1.2,
      }}
    >
      {label}
    </Typography>
  </Box>
);

function LeaveBalance() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const summary = data.attendanceSummary;
  const isLoading = loading.attendanceSummary;

  const paidLeavesUsed = summary?.paidLeaves ?? 0;
  const unpaidLeavesUsed = summary?.unpaidLeaves ?? 0;
  const presents = summary?.presents ?? 0;
  const holidays = summary?.holidays ?? 0;
  const weekOffs = summary?.weekOffs ?? 0;
  const correctionsUsed = summary?.correctionsUsed ?? 0;
  const remainingCorrections = summary?.remainingCorrections ?? 0;
  const maxCorrections = summary?.maxCorrectionsPerMonth ?? 5;
  const correctionPct =
    maxCorrections > 0
      ? Math.min(100, (correctionsUsed / maxCorrections) * 100)
      : 0;
  const corrColor =
    correctionPct >= 100
      ? "#ef4444"
      : correctionPct >= 60
        ? "#f59e0b"
        : "#10b981";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <BeachAccessIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          <Typography
            variant="subtitle2"
            fontWeight={700}
            sx={{ fontSize: "0.8rem" }}
          >
            Leave Balance
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={<AddIcon sx={{ fontSize: 11, "&&": { ml: 0.75 } }} />}
          label="Apply"
          onClick={() => navigate("/attendance")}
          sx={{ fontSize: "0.63rem", height: 20, cursor: "pointer" }}
        />
      </Box>

      {/* Stat pills */}
      <Box sx={{ px: 1.25, pt: 0.75, pb: 0.5, display: "flex", gap: 0.75 }}>
        <StatPill
          label="PL Used"
          value={paidLeavesUsed}
          color="#3b82f6"
          isLoading={isLoading}
        />
        <StatPill
          label="LWP"
          value={unpaidLeavesUsed}
          color="#ef4444"
          isLoading={isLoading}
        />
        <StatPill
          label="Presents"
          value={presents}
          color="#10b981"
          isLoading={isLoading}
        />
        <StatPill
          label="Holidays"
          value={holidays}
          color="#8b5cf6"
          isLoading={isLoading}
        />
        <StatPill
          label="W/Off"
          value={weekOffs}
          color="#6b7280"
          isLoading={isLoading}
        />
      </Box>

      {/* Corrections bar */}
      <Box sx={{ px: 1.5, pb: 1, mt: "auto" }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 0.4,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontSize: "0.68rem" }}
          >
            Attendance Corrections
          </Typography>
          {isLoading ? (
            <Skeleton width={36} height={12} sx={{ display: "inline-block" }} />
          ) : (
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ color: corrColor, fontSize: "0.72rem" }}
            >
              {remainingCorrections}/{maxCorrections} left
            </Typography>
          )}
        </Box>
        <LinearProgress
          variant={isLoading ? "indeterminate" : "determinate"}
          value={correctionPct}
          sx={{
            height: 5,
            borderRadius: 99,
            bgcolor: "action.hover",
            "& .MuiLinearProgress-bar": {
              bgcolor: corrColor,
              borderRadius: 99,
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default React.memo(LeaveBalance);
