import React, { useRef, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@web/app/providers/DashboardContext";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getBadge(record, isFuture) {
  if (isFuture || !record) return null;
  const { timeIn, timeOut, status } = record;

  if (timeIn && timeOut) {
    const [inH, inM] = timeIn.split(":").map(Number);
    const [outH, outM] = timeOut.split(":").map(Number);
    const mins = outH * 60 + outM - (inH * 60 + inM);
    if (mins > 0) return { label: String(mins), color: "#fff", bg: "#ec4899" };
  }

  const s = (status || "").toLowerCase();
  if (s === "leave") return { label: "L", color: "#fff", bg: "#ef4444" };
  if (s === "half-day") return { label: "H", color: "#fff", bg: "#f97316" };
  if (s === "week-off") return { label: "W", color: "#fff", bg: "#9ca3af" };
  if (s === "holiday") return { label: "H", color: "#fff", bg: "#8b5cf6" };
  if (s === "present") return { label: "P", color: "#fff", bg: "#10b981" };
  return null;
}

function AttendanceCalendar() {
  const navigate = useNavigate();
  const { data, loading } = useDashboard();
  const scrollRef = useRef<HTMLElement | null>(null);

  const today = dayjs();
  const attendances = data.attendances || [];
  const isLoading = loading.attendances;

  const days = useMemo(() => {
    const year = today.year();
    const month = today.month();
    return Array.from({ length: today.daysInMonth() }, (_, i) => {
      const d = dayjs(new Date(year, month, i + 1));
      const dateStr = d.format("YYYY-MM-DD");
      const record = attendances.find((a) => a.date?.startsWith(dateStr));
      const isFuture = d.isAfter(today, "day");
      return {
        num: i + 1,
        dayName: DAY_ABBR[d.day()],
        isToday: d.isSame(today, "day"),
        isFuture,
        isWeekend: d.day() === 0 || d.day() === 6,
        badge: getBadge(record, isFuture),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendances]);

  // Scroll today into center on mount / data ready
  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-today='true']");
    if (el)
      el.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      });
  }, [days]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.65,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ fontSize: "0.8rem" }}
        >
          {today.format("MMMM YYYY")}
        </Typography>
        <Typography
          variant="caption"
          onClick={() => navigate("/attendance")}
          sx={{
            color: "primary.main",
            fontSize: "0.68rem",
            fontWeight: 600,
            cursor: "pointer",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          View full →
        </Typography>
      </Box>

      {/* Day strip */}
      {isLoading ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            overflow: "hidden",
          }}
        >
          {[...Array(14)].map((_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width={48}
              height={46}
              sx={{ flexShrink: 0, borderRadius: 2 }}
            />
          ))}
        </Box>
      ) : (
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            overflowX: "auto",
            pt: 1.75, // breathing room so badges don't clip
            pb: 0.5,
            "&::-webkit-scrollbar": { height: 3 },
            "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "divider",
              borderRadius: 99,
            },
          }}
        >
          {days.map((day) => (
            <Box
              key={day.num}
              data-today={day.isToday ? "true" : undefined}
              onClick={() => navigate("/attendance")}
              sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 48,
                py: 0.6,
                borderRadius: 2,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s",
                bgcolor: day.isToday ? "primary.main" : "transparent",
                "&:hover": {
                  bgcolor: day.isToday ? "primary.dark" : "action.hover",
                },
              }}
            >
              {/* Working-minutes / status badge */}
              {day.badge && (
                <Box
                  sx={{
                    position: "absolute",
                    top: -12,
                    bgcolor: day.badge.bg,
                    color: day.badge.color,
                    borderRadius: 99,
                    px: 0.6,
                    minWidth: 22,
                    height: 17,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.5rem",
                    fontWeight: 700,
                    lineHeight: 1,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {day.badge.label}
                </Box>
              )}

              {/* Day abbreviation */}
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.59rem",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  color: day.isToday
                    ? "rgba(255,255,255,0.8)"
                    : day.isWeekend
                      ? "text.disabled"
                      : "text.secondary",
                }}
              >
                {day.dayName}
              </Typography>

              {/* Date number */}
              <Typography
                fontWeight={700}
                sx={{
                  fontSize: "0.9rem",
                  lineHeight: 1.1,
                  color: day.isToday
                    ? "#fff"
                    : day.isFuture || day.isWeekend
                      ? "text.disabled"
                      : "text.primary",
                }}
              >
                {String(day.num).padStart(2, "0")}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default React.memo(AttendanceCalendar);
