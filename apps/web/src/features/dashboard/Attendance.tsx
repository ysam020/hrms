import { memo, useMemo } from "react";
import Grid from "@mui/material/Grid2";
import Skeleton from "@mui/material/Skeleton";
import Box from "@mui/material/Box";
import { useNavigate } from "react-router-dom";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import { useDashboard } from "@web/app/providers/DashboardContext";

function Attendance() {
  const navigate = useNavigate();

  const { data, loading } = useDashboard();
  const attendanceSummary = data.attendanceSummary;
  const isLoading = loading.attendanceSummary;

  const memoizedData = useMemo(() => attendanceSummary, [attendanceSummary]);

  const getCorrectionsAlert = useMemo(() => {
    if (!memoizedData) return null;

    const { remainingCorrections, maxCorrectionsPerMonth, correctionsUsed } =
      memoizedData;

    if (remainingCorrections === 0) {
      return {
        type: "error",
        icon: "pi-exclamation-triangle",
        color: "#f44336",
        message: `No corrections remaining (${correctionsUsed}/${maxCorrectionsPerMonth} used)`,
      };
    } else if (remainingCorrections === 1) {
      return {
        type: "warning",
        icon: "pi-exclamation-circle",
        color: "#ff9800",
        message: `${remainingCorrections} correction remaining (${correctionsUsed}/${maxCorrectionsPerMonth} used)`,
      };
    } else {
      return {
        type: "info",
        icon: "pi-info-circle",
        color: "#2196f3",
        message: `${remainingCorrections} corrections remaining (${correctionsUsed}/${maxCorrectionsPerMonth} used)`,
      };
    }
  }, [memoizedData]);

  const SkeletonInfoCol = useMemo(
    () =>
      ({ className }) => (
        <Grid size={4} className={className}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Skeleton
              variant="text"
              width={60}
              height={40}
              sx={{
                fontSize: "2rem",
                transform: "scale(1, 0.8)",
              }}
            />
            <Skeleton
              variant="text"
              width={80}
              height={20}
              sx={{
                fontSize: "0.875rem",
                mt: 0.5,
              }}
            />
          </Box>
        </Grid>
      ),
    [],
  );

  const InfoCol = useMemo(
    () =>
      ({ label, value, className }) => (
        <Grid size={4} className={className}>
          <span className={className}>{value}</span>
          <p className={`${className}-label`}>{label}</p>
        </Grid>
      ),
    [],
  );

  return (
    <div
      onClick={!isLoading ? () => navigate("/attendance") : undefined}
      onKeyDown={
        !isLoading
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/attendance");
              }
            }
          : undefined
      }
      role={!isLoading ? "button" : undefined}
      tabIndex={!isLoading ? 0 : undefined}
      aria-label={!isLoading ? "View attendance details" : undefined}
      className="dashboard-container attendance"
      style={{
        cursor: isLoading ? "default" : "pointer",
        opacity: isLoading ? 0.8 : 1,
        transition: "opacity 0.2s ease-in-out",
        backgroundImage: `url(/assets/images/m-bg.webp)`,
      }}
    >
      {isLoading ? (
        <>
          {/* Skeleton for first row */}
          <Grid container className="attendance-row attendance-row-1">
            <SkeletonInfoCol className="presents" />
            <SkeletonInfoCol className="leaves" />
            <SkeletonInfoCol className="paid-leaves" />
          </Grid>

          {/* Skeleton for second row */}
          <Grid container className="attendance-row attendance-row-2">
            <SkeletonInfoCol className="unpaid-leaves" />
            <SkeletonInfoCol className="holidays" />
            {/* Empty grid item to maintain layout */}
            <Grid size={4}></Grid>
          </Grid>

          {/* Skeleton for corrections strip */}
          <Grid container className="attendance-row attendance-row-3">
            <Grid size={12}>
              <Skeleton
                variant="rectangular"
                width="100%"
                height={24}
                sx={{ borderRadius: 1 }}
              />
            </Grid>
          </Grid>
        </>
      ) : (
        <>
          {/* Actual data rendering */}
          <Grid container className="attendance-row attendance-row-1">
            <InfoCol
              label="Presents"
              value={memoizedData?.presents}
              className="presents"
            />
            <InfoCol
              label="Leaves"
              value={memoizedData?.leaves}
              className="leaves"
            />
            <InfoCol
              label="Paid Leaves"
              value={memoizedData?.paidLeaves}
              className="paid-leaves"
            />
          </Grid>
          <Grid container className="attendance-row attendance-row-2">
            <InfoCol
              label="Unpaid Leaves"
              value={memoizedData?.unpaidLeaves}
              className="unpaid-leaves"
            />
            <InfoCol
              label="Holidays"
              value={memoizedData?.holidays}
              className="holidays"
            />
            <InfoCol
              label="Week Offs"
              value={memoizedData?.weekOffs}
              className="holidays"
            />
          </Grid>

          {/* Corrections Strip */}
          <Grid container className="attendance-row attendance-row-3">
            <Grid
              size={12}
              className="corrections-strip"
              sx={{
                alignItems: "center",
                display: "flex",
              }}
            >
              <WarningRoundedIcon
                sx={{ color: "#FF9800", fontSize: "16px" }}
                aria-hidden="true"
              />
              <span
                className="corrections-text"
                style={{ marginLeft: "5px", fontSize: "12px" }}
              >
                {getCorrectionsAlert?.message || "Loading corrections..."}
              </span>
            </Grid>
          </Grid>
        </>
      )}
    </div>
  );
}

export default memo(Attendance);
