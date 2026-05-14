import React, { Suspense, useContext, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
// Icons
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import PaymentsIcon from "@mui/icons-material/Payments";
import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EventIcon from "@mui/icons-material/Event";
import CelebrationIcon from "@mui/icons-material/Celebration";
import BadgeIcon from "@mui/icons-material/Badge";
import AssignmentIcon from "@mui/icons-material/Assignment";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { useDashboard } from "@web/app/providers/DashboardContext";

const MarkAttendance = React.lazy(() => import("./MarkAttendance"));

const SectionLabel = ({ children }) => (
  <Typography
    variant="caption"
    sx={{
      display: "block",
      color: "text.secondary",
      fontWeight: 700,
      fontSize: "0.62rem",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      mb: 0.75,
    }}
  >
    {children}
  </Typography>
);

const ActionBtn = ({ icon, label, onClick, isDark }) => (
  <Tooltip title={label} placement="top" arrow>
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.4,
        py: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "all 0.15s",
        "&:hover": {
          bgcolor: "primary.main",
          borderColor: "primary.main",
          "& .action-icon, & .action-label": { color: "#fff" },
        },
      }}
    >
      <Box
        className="action-icon"
        sx={{ color: "text.secondary", display: "flex", fontSize: 18 }}
      >
        {icon}
      </Box>
      <Typography
        className="action-label"
        variant="caption"
        sx={{
          color: "text.secondary",
          fontSize: "0.6rem",
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    </Box>
  </Tooltip>
);

const StatPill = ({ label, value, color, isLoading }) => (
  <Box
    sx={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      py: 0.6,
      borderRadius: 1.5,
      bgcolor: `${color}12`,
      border: `1px solid ${color}28`,
    }}
  >
    {isLoading ? (
      <Skeleton width={20} height={18} sx={{ transform: "none" }} />
    ) : (
      <Typography
        fontWeight={800}
        sx={{ fontSize: "0.95rem", color, lineHeight: 1 }}
      >
        {value ?? 0}
      </Typography>
    )}
    <Typography
      variant="caption"
      sx={{
        fontSize: "0.55rem",
        color: "text.secondary",
        mt: 0.2,
        textAlign: "center",
        lineHeight: 1.2,
      }}
    >
      {label}
    </Typography>
  </Box>
);

function MyWorkspace({ isDark }) {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const { data, loading } = useDashboard();

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  // Greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.first_name || user?.username || "there";
  const designation = user?.designation;
  const department = user?.department;

  // Today's attendance
  const todayRecord = useMemo(() => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    return (data.attendances || []).find((a) => a.date?.startsWith(todayStr));
  }, [data.attendances]);

  // Working hours today
  const workingHoursToday = useMemo(() => {
    if (!todayRecord?.timeIn || !todayRecord?.timeOut) return null;
    const mins = dayjs(todayRecord.timeOut).diff(
      dayjs(todayRecord.timeIn),
      "minute",
    );
    if (mins <= 0) return null;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }, [todayRecord]);

  // Attendance summary
  const summary = data.attendanceSummary;
  const paidLeavesUsed = summary?.paidLeaves ?? 0;
  const lwpUsed = summary?.unpaidLeaves ?? 0;
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

  // Upcoming events + holidays merged, next 8
  const upcoming = useMemo(() => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    const events = (data.calendarEvents || [])
      .filter((e) => e.date >= todayStr)
      .map((e) => ({
        date: e.date,
        label: e.title,
        type: "event",
        description: e.description,
        time: e.startTime,
      }));
    const hols = (data.holidays || [])
      .filter((h) => h.date >= todayStr)
      .map((h) => ({
        date: h.date,
        label: h.name || h.title,
        type: "holiday",
      }));
    return ([...events, ...hols] as any[])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);
  }, [data.calendarEvents, data.holidays]);

  // Pending approvals count
  const pendingCount = (data.pendingLeaves || []).length;

  const quickActions = [
    {
      icon: <BeachAccessIcon sx={{ fontSize: 18 }} />,
      label: "Apply Leave",
      path: "/attendance",
    },
    {
      icon: <PaymentsIcon sx={{ fontSize: 18 }} />,
      label: "Salary Slip",
      path: "/salary-management",
    },
    {
      icon: <PersonIcon sx={{ fontSize: 18 }} />,
      label: "My Profile",
      path: "/profile",
    },
    {
      icon: <CalendarMonthIcon sx={{ fontSize: 18 }} />,
      label: "Calendar",
      path: "/calendar",
    },
    {
      icon: <AssignmentIcon sx={{ fontSize: 18 }} />,
      label: "Attendance",
      path: "/attendance",
    },
    { icon: <BadgeIcon sx={{ fontSize: 18 }} />, label: "KYC", path: "/kyc" },
  ];

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* greeting */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${borderColor}`,
          flexShrink: 0,
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", fontSize: "0.7rem" }}
        >
          {greeting},
        </Typography>
        <Typography
          variant="subtitle1"
          fontWeight={800}
          sx={{ lineHeight: 1.15, color: isDark ? "#f1f5f9" : "#0f172a" }}
        >
          {firstName} 👋
        </Typography>
        {(designation || department) && (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.65rem" }}
          >
            {[designation, department].filter(Boolean).join(" · ")}
          </Typography>
        )}
      </Box>

      {/* scrollable content */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {/* attendance today */}
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            pb: 1,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <SectionLabel>Attendance Today</SectionLabel>

          {/* Punch In / Punch Out buttons */}
          <Box sx={{ mb: 0.75 }}>
            <Suspense
              fallback={
                <Skeleton
                  variant="rounded"
                  height={36}
                  sx={{ width: "100%", borderRadius: 1.5 }}
                />
              }
            >
              <MarkAttendance compact />
            </Suspense>
          </Box>

          {/* Time In / Time Out display */}
          {loading.attendances ? (
            <Skeleton variant="rounded" height={52} />
          ) : (
            <Box sx={{ display: "flex", gap: 0.75 }}>
              {/* Time In */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  bgcolor: todayRecord?.timeIn
                    ? isDark
                      ? "rgba(16,185,129,0.12)"
                      : "rgba(16,185,129,0.07)"
                    : isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.03)",
                  border: `1px solid ${todayRecord?.timeIn ? "rgba(16,185,129,0.3)" : borderColor}`,
                }}
              >
                <LoginIcon
                  sx={{
                    fontSize: 14,
                    color: todayRecord?.timeIn ? "#10b981" : "text.disabled",
                  }}
                />
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      fontSize: "0.58rem",
                      display: "block",
                      lineHeight: 1,
                    }}
                  >
                    In
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{
                      fontSize: "0.82rem",
                      color: todayRecord?.timeIn ? "#10b981" : "text.disabled",
                    }}
                  >
                    {todayRecord?.timeIn
                      ? dayjs(todayRecord.timeIn).format("hh:mm A")
                      : "—"}
                  </Typography>
                </Box>
              </Box>

              {/* Time Out */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  bgcolor: todayRecord?.timeOut
                    ? isDark
                      ? "rgba(239,68,68,0.12)"
                      : "rgba(239,68,68,0.07)"
                    : isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.03)",
                  border: `1px solid ${todayRecord?.timeOut ? "rgba(239,68,68,0.3)" : borderColor}`,
                }}
              >
                <LogoutIcon
                  sx={{
                    fontSize: 14,
                    color: todayRecord?.timeOut ? "#ef4444" : "text.disabled",
                  }}
                />
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.disabled",
                      fontSize: "0.58rem",
                      display: "block",
                      lineHeight: 1,
                    }}
                  >
                    Out
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{
                      fontSize: "0.82rem",
                      color: todayRecord?.timeOut ? "#ef4444" : "text.disabled",
                    }}
                  >
                    {todayRecord?.timeOut
                      ? dayjs(todayRecord.timeOut).format("hh:mm A")
                      : "—"}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Working hours today */}
          {workingHoursToday && (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                fontSize: "0.65rem",
                mt: 0.5,
                display: "block",
                textAlign: "center",
              }}
            >
              ⏱ {workingHoursToday} worked today
            </Typography>
          )}
        </Box>

        {/* this month stats */}
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            pb: 1,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <SectionLabel>This Month</SectionLabel>
          {loading.attendanceSummary ? (
            <Skeleton height={52} />
          ) : (
            <>
              {/* Row 1: PL, LWP, Presents */}
              <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
                <StatPill
                  label="PL Used"
                  value={paidLeavesUsed}
                  color="#3b82f6"
                  isLoading={loading.attendanceSummary}
                />
                <StatPill
                  label="LWP"
                  value={lwpUsed}
                  color="#ef4444"
                  isLoading={loading.attendanceSummary}
                />
                <StatPill
                  label="Presents"
                  value={presents}
                  color="#10b981"
                  isLoading={loading.attendanceSummary}
                />
              </Box>
              {/* Row 2: Holidays, W/Off */}
              <Box sx={{ display: "flex", gap: 0.5, mb: 0.75 }}>
                <StatPill
                  label="Holidays"
                  value={holidays}
                  color="#8b5cf6"
                  isLoading={loading.attendanceSummary}
                />
                <StatPill
                  label="W/Off"
                  value={weekOffs}
                  color="#6b7280"
                  isLoading={loading.attendanceSummary}
                />
                {/* spacer to match 3-col width */}
                <Box sx={{ flex: 1 }} />
              </Box>

              {/* Corrections progress bar */}
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 0.3,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: "0.63rem" }}
                  >
                    Corrections
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    sx={{ color: corrColor, fontSize: "0.67rem" }}
                  >
                    {remainingCorrections}/{maxCorrections} left
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={correctionPct}
                  sx={{
                    height: 4,
                    borderRadius: 99,
                    bgcolor: "action.hover",
                    "& .MuiLinearProgress-bar": {
                      bgcolor: corrColor,
                      borderRadius: 99,
                    },
                  }}
                />
              </Box>
            </>
          )}

          {/* Pending approvals alert */}
          {!loading.pendingLeaves && pendingCount > 0 && (
            <Box
              onClick={() => navigate("/attendance")}
              sx={{
                mt: 0.75,
                py: 0.6,
                px: 1,
                borderRadius: 1.5,
                bgcolor: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                "&:hover": { bgcolor: "rgba(245,158,11,0.15)" },
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.68rem" }}
              >
                ⚠ {pendingCount} leave{pendingCount > 1 ? "s" : ""} pending
                approval
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "#f59e0b", fontSize: "0.62rem" }}
              >
                →
              </Typography>
            </Box>
          )}
        </Box>

        {/* quick actions */}
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            pb: 1,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <SectionLabel>Quick Actions</SectionLabel>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 0.75,
            }}
          >
            {quickActions.map((a) => (
              <ActionBtn
                key={a.label}
                icon={a.icon}
                label={a.label}
                onClick={() => navigate(a.path)}
                isDark={isDark}
              />
            ))}
          </Box>
        </Box>

        {/* upcoming events */}
        <Box sx={{ px: 2, pt: 1.25, pb: 1.5 }}>
          <SectionLabel>Coming Up</SectionLabel>
          {loading.calendarEvents || loading.holidays ? (
            [...Array(4)].map((_, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1, mb: 0.75 }}>
                <Skeleton variant="rounded" width={30} height={30} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton height={13} />
                  <Skeleton height={11} width="55%" />
                </Box>
              </Box>
            ))
          ) : upcoming.length === 0 ? (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              Nothing scheduled soon
            </Typography>
          ) : (
            upcoming.map((item, i) => {
              const d = dayjs(item.date);
              const daysLeft = d.diff(dayjs().startOf("day"), "day");
              const when =
                daysLeft === 0
                  ? "Today"
                  : daysLeft === 1
                    ? "Tomorrow"
                    : d.format("DD MMM");
              const color = item.type === "holiday" ? "#8b5cf6" : "#3b82f6";

              return (
                <Box
                  key={i}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.75,
                    py: 0.5,
                    px: 0.75,
                    borderRadius: 1.5,
                    transition: "background 0.12s",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: 1,
                      bgcolor: `${color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color,
                    }}
                  >
                    {item.type === "holiday" ? (
                      <CelebrationIcon sx={{ fontSize: 15 }} />
                    ) : (
                      <EventIcon sx={{ fontSize: 15 }} />
                    )}
                  </Box>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 0.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{
                          fontSize: "0.72rem",
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </Typography>
                      {item.description && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.disabled",
                            fontSize: "0.6rem",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ flexShrink: 0, textAlign: "right" }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: daysLeft <= 1 ? color : "text.secondary",
                          fontSize: "0.62rem",
                          fontWeight: daysLeft <= 1 ? 600 : 400,
                          display: "block",
                        }}
                      >
                        {when}
                      </Typography>
                      {item.time && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.disabled",
                            fontSize: "0.6rem",
                            display: "block",
                          }}
                        >
                          {item.time}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default React.memo(MyWorkspace);
