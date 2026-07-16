import { memo, useContext, useMemo } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { useDashboard } from "@web/app/providers/DashboardContext";
import { AttendanceTodaySection } from "./my-workspace/AttendanceTodaySection";
import { MonthStatsSection } from "./my-workspace/MonthStatsSection";
import { QuickActionsSection } from "./my-workspace/QuickActionsSection";
import {
  UpcomingEventsSection,
  type UpcomingItem,
} from "./my-workspace/UpcomingEventsSection";

function MyWorkspace({ isDark }) {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const { data, loading } = useDashboard();
  const isMobile = useMediaQuery("(max-width:767px)");

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
    const todayStr = new Date().toISOString().slice(0, 10);
    return (data.attendances || []).find((a) => a.date?.startsWith(todayStr));
  }, [data.attendances]);

  // Working hours today
  const workingHoursToday = useMemo(() => {
    if (!todayRecord?.checkIn || !todayRecord?.checkOut) return null;
    const mins = dayjs(todayRecord.checkOut).diff(
      dayjs(todayRecord.checkIn),
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
  const upcoming: UpcomingItem[] = useMemo(() => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    const events = (data.calendarEvents || [])
      .filter((e) => e.date >= todayStr)
      .map((e) => ({
        date: e.date,
        label: e.title,
        type: "event" as const,
        description: e.description,
        time: e.startTime,
      }));
    const hols = (data.holidays || [])
      .filter((h) => h.date >= todayStr)
      .map((h) => ({
        date: h.date,
        label: h.name || h.title,
        type: "holiday" as const,
      }));
    return ([...events, ...hols] as UpcomingItem[])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);
  }, [data.calendarEvents, data.holidays]);

  // Pending approvals count
  const pendingCount = (data.pendingLeaves || []).length;

  return (
    <Box
      sx={{
        height: isMobile ? "auto" : "100%",
        display: "flex",
        flexDirection: "column",
        overflow: isMobile ? "visible" : "hidden",
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
      <Box
        sx={{
          flex: isMobile ? "none" : 1,
          overflow: isMobile ? "visible" : "auto",
        }}
      >
        <AttendanceTodaySection
          isDark={isDark}
          borderColor={borderColor}
          loadingAttendances={loading.attendances}
          todayRecord={todayRecord}
          workingHoursToday={workingHoursToday}
        />

        <MonthStatsSection
          borderColor={borderColor}
          loadingSummary={loading.attendanceSummary}
          paidLeavesUsed={paidLeavesUsed}
          lwpUsed={lwpUsed}
          presents={presents}
          holidays={holidays}
          weekOffs={weekOffs}
          correctionPct={correctionPct}
          corrColor={corrColor}
          remainingCorrections={remainingCorrections}
          maxCorrections={maxCorrections}
          pendingCount={pendingCount}
          loadingPendingLeaves={loading.pendingLeaves}
          onPendingClick={() => navigate("/attendance/view-leave-applications")}
        />

        <QuickActionsSection
          borderColor={borderColor}
          isDark={isDark}
          onNavigate={navigate}
        />

        <UpcomingEventsSection
          loading={loading.calendarEvents || loading.holidays}
          upcoming={upcoming}
        />
      </Box>
    </Box>
  );
}

export default memo(MyWorkspace);
