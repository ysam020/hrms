import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import CelebrationIcon from "@mui/icons-material/Celebration";
import dayjs from "dayjs";
import { useDashboard } from "@web/app/providers/DashboardContext";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

function UpcomingHolidays() {
  const { data, loading } = useDashboard();
  const isLoading = loading.holidays;

  const today = new Date().toISOString().split("T")[0];
  const upcoming = (data.holidays || [])
    .filter((h) => h.date >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 8);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
          <CelebrationIcon sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Upcoming Holidays
          </Typography>
        </Box>
        {!isLoading && upcoming.length > 0 && (
          <Chip
            size="small"
            label={upcoming.length}
            sx={{
              height: 18,
              fontSize: "0.65rem",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Box
              key={i}
              sx={{
                px: 1.5,
                py: 0.75,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
              }}
            >
              <Skeleton variant="rounded" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton height={14} width="65%" />
                <Skeleton height={12} width="40%" sx={{ mt: 0.25 }} />
              </Box>
            </Box>
          ))
        ) : upcoming.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "text.disabled",
            }}
          >
            <Typography variant="caption">
              No upcoming holidays this year
            </Typography>
          </Box>
        ) : (
          upcoming.map((holiday, i) => {
            const d = dayjs(holiday.date);
            const daysLeft = d.diff(dayjs().startOf("day"), "day");
            const color = COLORS[i % COLORS.length];
            const label =
              daysLeft === 0
                ? "Today!"
                : daysLeft === 1
                  ? "Tomorrow"
                  : `In ${daysLeft} days`;

            return (
              <Box
                key={i}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  borderLeft: "3px solid transparent",
                  transition: "all 0.15s",
                  "&:hover": {
                    bgcolor: "action.hover",
                    borderLeftColor: color,
                  },
                }}
              >
                {/* Date badge */}
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    bgcolor: color,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "0.78rem",
                      lineHeight: 1,
                    }}
                  >
                    {d.format("DD")}
                  </Typography>
                  <Typography
                    sx={{
                      color: "rgba(255,255,255,0.85)",
                      fontSize: "0.6rem",
                      lineHeight: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {d.format("MMM")}
                  </Typography>
                </Box>

                {/* Info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      fontSize: "0.8rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {holiday.name || holiday.title || "Holiday"}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: daysLeft <= 1 ? color : "text.secondary",
                      fontSize: "0.68rem",
                      fontWeight: daysLeft <= 1 ? 600 : 400,
                    }}
                  >
                    {d.format("dddd")} · {label}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default React.memo(UpcomingHolidays);
