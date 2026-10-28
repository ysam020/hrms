import type { ReactNode } from "react";

// A stage in an application or run timeline.
export type TimelineStage = {
  label: string;
  date?: string | Date | null;
  state: "done" | "pending" | "rejected";
  // Extra content rendered below the label/date — e.g. interview round
  // detail (interviewer, feedback, actions) embedded directly in a stage
  // instead of living in a separate section next to the timeline.
  extra?: ReactNode;
};
