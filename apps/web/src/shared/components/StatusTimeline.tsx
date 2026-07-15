import dayjs from "dayjs";
import { Timeline } from "primereact/timeline";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import "@web/styles/timeline.scss";

export type TimelineStage = {
  label: string;
  date?: string | Date | null;
  state: "done" | "pending" | "rejected";
  // Extra content rendered below the label/date — e.g. interview round
  // detail (interviewer, feedback, actions) embedded directly in a stage
  // instead of living in a separate section next to the timeline.
  extra?: React.ReactNode;
};

const STAGE_COLOR: Record<TimelineStage["state"], string> = {
  done: "#059669",
  pending: "#94a3b8",
  rejected: "#dc2626",
};

// A stage can be reached with no timestamp to show at all (e.g. Payroll
// Run's "processing" has no dedicated date column) — "Pending" is reserved
// for stages not yet reached; a reached-but-undated stage shows "—" instead.
function formatStageDate(stage: TimelineStage): string {
  if (stage.date) return dayjs(stage.date).format("DD MMM YYYY, hh:mm A");
  return stage.state === "pending" ? "Pending" : "—";
}

function StatusTimeline({
  stages,
  orientation = "vertical",
}: {
  stages: TimelineStage[];
  orientation?: "vertical" | "horizontal";
}) {
  const isHorizontal = orientation === "horizontal";

  return (
    <Timeline
      value={stages}
      layout={orientation}
      align={isHorizontal ? "top" : "left"}
      className="compact-timeline"
      marker={(item: TimelineStage) => (
        <Box
          sx={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: STAGE_COLOR[item.state],
            }}
          />
        </Box>
      )}
      content={(item: TimelineStage) => (
        <Box
          sx={
            isHorizontal
              ? { px: 1, pt: 1, minWidth: 110, textAlign: "center" }
              : { pl: 2, pb: 1.5 }
          }
        >
          <Typography variant="body2" fontWeight={600}>
            {item.label}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {formatStageDate(item)}
          </Typography>
          {item.extra && (
            <Box sx={{ mt: 1, textAlign: "left" }}>{item.extra}</Box>
          )}
        </Box>
      )}
    />
  );
}

export default StatusTimeline;
