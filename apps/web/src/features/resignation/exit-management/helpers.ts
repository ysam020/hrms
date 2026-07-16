import type { TimelineStage } from "@web/shared/components/StatusTimeline";

export function buildResignationStages(resignation: {
  status?: string;
  submittedOn?: string;
  approvedOn?: string;
  rejectedOn?: string;
  withdrawnOn?: string;
  relievedFromDutyOn?: string;
}): TimelineStage[] {
  const {
    status,
    submittedOn,
    approvedOn,
    rejectedOn,
    withdrawnOn,
    relievedFromDutyOn,
  } = resignation;
  const stages: TimelineStage[] = [
    { label: "Submitted", date: submittedOn, state: "done" },
  ];

  if (status === "Withdrawn") {
    stages.push({ label: "Withdrawn", date: withdrawnOn, state: "done" });
    return stages;
  }

  stages.push(
    rejectedOn
      ? { label: "Rejected", date: rejectedOn, state: "rejected" }
      : {
          label: "Approved",
          date: approvedOn || undefined,
          state: approvedOn ? "done" : "pending",
        },
  );

  if (status !== "Rejected") {
    stages.push({
      label: "Relieved",
      date: relievedFromDutyOn || undefined,
      state: relievedFromDutyOn ? "done" : "pending",
    });
  }

  return stages;
}
