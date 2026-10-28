import { z } from "zod";
import dayjs from "dayjs";
import type { TimelineStage } from "@web/shared/components/StatusTimeline";

// Dynamic-length timeline: one stage per interview round (no fixed set),
// since a JobApplication has no appliedAt/hiredAt/rejectedAt columns —
// "Applied" and the terminal Hired/Rejected bookends are shown without a
// date, only the interview rounds carry a real timestamp.
export function buildApplicationStages(
  interviews: any[],
  status: string,
): TimelineStage[] {
  const stages: TimelineStage[] = [{ label: "Applied", state: "done" }];

  for (const interview of interviews || []) {
    stages.push({
      label: `Round ${interview.roundNumber}`,
      date: interview.interviewStartTime
        ? dayjs(interview.interviewStartTime, "YYYYMMDDTHHmmss").toDate()
        : undefined,
      state: interview.cleared ? "done" : "pending",
    });
  }

  if (status === "Hired" || status === "Rejected") {
    stages.push({
      label: status,
      state: status === "Rejected" ? "rejected" : "done",
    });
  }

  return stages;
}

// A round can only move Scheduled → Completed → Cleared — once it's been
// conducted, re-marking it Completed is a no-op that would silently skip
// the actual interview, so Cleared is the only forward move left.
export function getStatusOptions(interview: any) {
  return interview?.interviewConducted ? ["Cleared"] : ["Completed"];
}

// A round can't be marked Completed/Cleared before its scheduled
// interview time has actually passed.
export function interviewHasEnded(interview: any) {
  if (!interview?.interviewEndTime) return false;
  return dayjs(interview.interviewEndTime, "YYYYMMDDTHHmmss").isBefore(dayjs());
}

// Hides the Update Status control (and the "not yet ended" alert) for a
// round once there's nothing left to do with it: a later round has
// already been reached (prevRoundCleared guarantees this round was
// Cleared to get there), this exact round has been formally Cleared, or
// the application has reached a terminal state. "Completed" is an
// intentional intermediate step — a round can be marked Completed first
// (interview happened, feedback given) and Cleared later, so the control
// stays visible until Cleared specifically.
export function shouldHideStatusDropdown(roundNumber: number, status: string) {
  if (!status) return false;
  if (status === "Hired" || status === "Rejected") return true;

  const match = status.match(/^Round (\d+) (.+)$/);
  if (!match) return false;
  const statusRound = parseInt(match[1], 10);
  const outcome = match[2];

  if (roundNumber < statusRound) return true;
  if (roundNumber === statusRound) return outcome === "Cleared";
  return false;
}

export function getStatusColor(currentStatus: string) {
  if (currentStatus?.includes("Cleared") || currentStatus?.includes("Hired"))
    return "success";
  if (currentStatus?.includes("Rejected")) return "error";
  if (currentStatus?.includes("Scheduled")) return "info";
  if (currentStatus?.includes("Completed")) return "warning";
  return "default";
}
