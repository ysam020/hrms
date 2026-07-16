import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

const BAR_COLORS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

function DepartmentBreakdown() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const isLoading = loading.employeeInsights;

  const depts = (data.employeeInsights?.departmentBreakdown || []).slice(0, 8);
  const maxCount = depts.length > 0 ? depts[0].count : 1;

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
      aria-label="View department breakdown in employee management"
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <AccountTreeIcon sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Department Breakdown
          </Typography>
        </Box>
        {!isLoading && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontSize: "0.65rem" }}
          >
            {data.employeeInsights?.overview?.totalEmployees ?? 0} total
          </Typography>
        )}
      </Box>

      {/* Bars */}
      <Box sx={{ flex: 1, overflow: "auto", px: 1.5, py: 1 }}>
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <Box key={i} sx={{ mb: 1 }}>
              <Skeleton height={12} width={`${60 + i * 8}%`} sx={{ mb: 0.4 }} />
              <Skeleton height={8} width="100%" sx={{ borderRadius: 1 }} />
            </Box>
          ))
        ) : depts.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "text.disabled",
            }}
          >
            <Typography variant="caption">No department data</Typography>
          </Box>
        ) : (
          depts.map((dept, i) => {
            const color = BAR_COLORS[i % BAR_COLORS.length];
            const pct = Math.round((dept.count / maxCount) * 100);

            return (
              <Box key={dept.department} sx={{ mb: 1.25 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    mb: 0.4,
                  }}
                >
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    sx={{
                      fontSize: "0.72rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "60%",
                    }}
                  >
                    {dept.department}
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      flexShrink: 0,
                    }}
                  >
                    <Tooltip
                      title={`Active rate: ${dept.activeRate}%`}
                      placement="top"
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.62rem",
                          color:
                            dept.activeRate >= 90
                              ? "#10b981"
                              : dept.activeRate >= 70
                                ? "#f59e0b"
                                : "#ef4444",
                          fontWeight: 600,
                        }}
                      >
                        {dept.activeRate}% active
                      </Typography>
                    </Tooltip>
                    <Typography
                      variant="caption"
                      fontWeight={800}
                      sx={{
                        fontSize: "0.72rem",
                        color,
                        minWidth: 20,
                        textAlign: "right",
                      }}
                    >
                      {dept.count}
                    </Typography>
                  </Box>
                </Box>

                {/* Bar track */}
                <Box
                  sx={{
                    height: 6,
                    borderRadius: 99,
                    bgcolor: "action.hover",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 99,
                      bgcolor: color,
                      transition: "width 0.4s ease",
                    }}
                  />
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default React.memo(DepartmentBreakdown);
