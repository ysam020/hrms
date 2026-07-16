import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import { SectionLabel, StatPill } from "./components";

export function MonthStatsSection({
  borderColor,
  loadingSummary,
  paidLeavesUsed,
  lwpUsed,
  presents,
  holidays,
  weekOffs,
  correctionPct,
  corrColor,
  remainingCorrections,
  maxCorrections,
  pendingCount,
  loadingPendingLeaves,
  onPendingClick,
}: {
  borderColor: string;
  loadingSummary: boolean;
  paidLeavesUsed: number;
  lwpUsed: number;
  presents: number;
  holidays: number;
  weekOffs: number;
  correctionPct: number;
  corrColor: string;
  remainingCorrections: number;
  maxCorrections: number;
  pendingCount: number;
  loadingPendingLeaves: boolean;
  onPendingClick: () => void;
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
      <SectionLabel>This Month</SectionLabel>
      {loadingSummary ? (
        <Skeleton height={52} />
      ) : (
        <>
          {/* Row 1: PL, LWP, Presents */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
            <StatPill
              label="PL Used"
              value={paidLeavesUsed}
              color="#3b82f6"
              isLoading={loadingSummary}
            />
            <StatPill
              label="LWP"
              value={lwpUsed}
              color="#ef4444"
              isLoading={loadingSummary}
            />
            <StatPill
              label="Presents"
              value={presents}
              color="#10b981"
              isLoading={loadingSummary}
            />
          </Box>
          {/* Row 2: Holidays, W/Off */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.75 }}>
            <StatPill
              label="Holidays"
              value={holidays}
              color="#8b5cf6"
              isLoading={loadingSummary}
            />
            <StatPill
              label="W/Off"
              value={weekOffs}
              color="#6b7280"
              isLoading={loadingSummary}
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
      {!loadingPendingLeaves && pendingCount > 0 && (
        <Box
          onClick={onPendingClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPendingClick();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`${pendingCount} leave${pendingCount > 1 ? "s" : ""} pending approval. Go to attendance.`}
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
            ⚠ {pendingCount} leave{pendingCount > 1 ? "s" : ""} pending approval
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
  );
}
