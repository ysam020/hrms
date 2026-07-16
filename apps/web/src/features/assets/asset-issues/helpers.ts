import type { TimelineStage } from "@web/shared/components/StatusTimeline";

export function buildAssetIssueStages(issue: any): TimelineStage[] {
  if (!issue) return [];
  const isRejected = issue.status === "rejected";
  const stages: TimelineStage[] = [
    { label: "Reported", date: issue.createdAt, state: "done" },
    {
      label: "Reviewed",
      date: issue.reviewedAt || undefined,
      state: issue.reviewedAt ? (isRejected ? "rejected" : "done") : "pending",
    },
  ];
  // Nothing left to resolve once rejected.
  if (!isRejected) {
    stages.push({
      label: "Resolved",
      date: issue.resolvedAt || undefined,
      state: issue.resolvedAt ? "done" : "pending",
    });
  }
  return stages;
}
