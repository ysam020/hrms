import { memo, useCallback, useContext, useEffect, useState } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import dayjs from "dayjs";
import { API_ENDPOINTS } from "@web/shared/constants";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function WFHCalendar() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [year, setYear] = useState(dayjs().year());
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCalendar = useCallback(
    async (y: number, m: number) => {
      setLoading(true);
      try {
        const res = await apiClient(API_ENDPOINTS.WFH_CALENDAR(y, m));
        setEntries(res.data.data || []);
      } catch {
        setAlert({
          open: true,
          message: "Failed to load WFH calendar",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [setAlert],
  );

  useEffect(() => {
    fetchCalendar(year, month);
  }, [year, month, fetchCalendar]);

  const navigate = (direction: number) => {
    let m = month + direction;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    setMonth(m);
    setYear(y);
  };

  const firstDay = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const daysInMonth = firstDay.daysInMonth();
  const startOffset = firstDay.day();

  // Group entries by date
  const byDate: Record<string, any[]> = {};
  for (const entry of entries) {
    const key = dayjs(entry.date).format("YYYY-MM-DD");
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(entry);
  }

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <IconButton size="small" onClick={() => navigate(-1)}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={600}>
          {dayjs(`${year}-${month}-01`).format("MMMM YYYY")} — WFH Calendar
        </Typography>
        <IconButton size="small" onClick={() => navigate(1)}>
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <>
          {/* Day headers */}
          <Grid container columns={7} sx={{ mb: 0.5 }}>
            {WEEKDAYS.map((d) => (
              <Grid item xs={1} key={d}>
                <Typography
                  variant="caption"
                  fontWeight={600}
                  color="text.secondary"
                  sx={{ display: "block", textAlign: "center", py: 0.5 }}
                >
                  {d}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {/* Calendar grid */}
          <Grid container columns={7}>
            {/* Empty offset cells */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <Grid item xs={1} key={`empty-${i}`}>
                <Paper
                  elevation={0}
                  sx={{
                    height: 90,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 0,
                    opacity: 0.4,
                  }}
                />
              </Grid>
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const wfhEntries = byDate[dateKey] ?? [];
              const isToday = dayjs().format("YYYY-MM-DD") === dateKey;
              const isWeekend = [0, 6].includes(dayjs(dateKey).day());

              return (
                <Grid item xs={1} key={day}>
                  <Paper
                    elevation={0}
                    sx={{
                      height: 90,
                      p: 0.5,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 0,
                      backgroundColor: isToday
                        ? isDark
                          ? "rgba(99,102,241,0.15)"
                          : "rgba(99,102,241,0.06)"
                        : isWeekend
                          ? isDark
                            ? "rgba(255,255,255,0.02)"
                            : "rgba(0,0,0,0.02)"
                          : "transparent",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={isToday ? 700 : 400}
                      color={
                        isToday
                          ? "#6366f1"
                          : isWeekend
                            ? "text.disabled"
                            : "text.primary"
                      }
                      sx={{ display: "block", textAlign: "right", pr: 0.5 }}
                    >
                      {day}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.3,
                        mt: 0.3,
                      }}
                    >
                      {wfhEntries.slice(0, 3).map((entry, idx) => (
                        <Tooltip
                          key={idx}
                          title={
                            entry.employee
                              ? `${entry.employee.first_name} ${entry.employee.last_name}`
                              : "WFH"
                          }
                        >
                          <Avatar
                            sx={{
                              width: 20,
                              height: 20,
                              fontSize: "0.6rem",
                              bgcolor: "#6366f1",
                              cursor: "default",
                            }}
                          >
                            {entry.employee?.first_name?.[0] ?? (
                              <HomeWorkIcon sx={{ fontSize: 12 }} />
                            )}
                          </Avatar>
                        </Tooltip>
                      ))}
                      {wfhEntries.length > 3 && (
                        <Chip
                          label={`+${wfhEntries.length - 3}`}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.55rem",
                            backgroundColor: "rgba(99,102,241,0.15)",
                            color: "#6366f1",
                            "& .MuiChip-label": { padding: "0 4px" },
                          }}
                        />
                      )}
                    </Box>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          {/* Legend */}
          <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
            <Avatar
              sx={{
                width: 20,
                height: 20,
                bgcolor: "#6366f1",
                fontSize: "0.6rem",
              }}
            >
              A
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              Approved WFH (avatars = employees)
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

export default memo(WFHCalendar);
