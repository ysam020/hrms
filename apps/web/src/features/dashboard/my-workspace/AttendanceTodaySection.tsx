import { Suspense, lazy } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import dayjs from "dayjs";
import { SectionLabel } from "./components";

const MarkAttendance = lazy(() => import("../MarkAttendance"));

export function AttendanceTodaySection({
  isDark,
  borderColor,
  loadingAttendances,
  todayRecord,
  workingHoursToday,
}: {
  isDark: boolean;
  borderColor: string;
  loadingAttendances: boolean;
  todayRecord: any;
  workingHoursToday: string | null;
}) {
  return (
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
      {loadingAttendances ? (
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
              bgcolor: todayRecord?.checkIn
                ? isDark
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(16,185,129,0.07)"
                : isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.03)",
              border: `1px solid ${todayRecord?.checkIn ? "rgba(16,185,129,0.3)" : borderColor}`,
            }}
          >
            <LoginIcon
              sx={{
                fontSize: 14,
                color: todayRecord?.checkIn ? "#10b981" : "text.disabled",
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
                  color: todayRecord?.checkIn ? "#10b981" : "text.disabled",
                }}
              >
                {todayRecord?.checkIn
                  ? dayjs(todayRecord.checkIn).format("hh:mm A")
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
              bgcolor: todayRecord?.checkOut
                ? isDark
                  ? "rgba(239,68,68,0.12)"
                  : "rgba(239,68,68,0.07)"
                : isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.03)",
              border: `1px solid ${todayRecord?.checkOut ? "rgba(239,68,68,0.3)" : borderColor}`,
            }}
          >
            <LogoutIcon
              sx={{
                fontSize: 14,
                color: todayRecord?.checkOut ? "#ef4444" : "text.disabled",
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
                  color: todayRecord?.checkOut ? "#ef4444" : "text.disabled",
                }}
              >
                {todayRecord?.checkOut
                  ? dayjs(todayRecord.checkOut).format("hh:mm A")
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
  );
}
