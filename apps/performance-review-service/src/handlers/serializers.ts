import { performanceReview } from "@hrms/proto";

// Prisma rows carry Date objects and null; the proto fields are plain
// strings/doubles, so every handler that returns one of these messages must
// route the row through here before handing it to `callback()` (see
// leave-service/src/handlers/leaveApplicationSerializer.ts for the same
// pattern with LeaveApplication).
export function toPerformanceReviewCycleProto(
  c: any,
): performanceReview.PerformanceReviewCycle {
  return {
    id: c.id ?? "",
    name: c.name ?? "",
    periodStart: c.periodStart ? c.periodStart.toISOString() : "",
    periodEnd: c.periodEnd ? c.periodEnd.toISOString() : "",
    status: c.status ?? "",
    ratingScale: c.ratingScale ?? 0,
    createdBy: c.createdBy ?? "",
    createdAt: c.createdAt ? c.createdAt.toISOString() : "",
  };
}

export function toPerformanceReviewProto(
  r: any,
): performanceReview.PerformanceReview {
  return {
    id: r.id ?? "",
    cycleId: r.cycleId ?? "",
    userId: r.userId ?? "",
    reviewerId: r.reviewerId ?? "",
    status: r.status ?? "",
    selfComments: r.selfComments ?? "",
    selfRating: r.selfRating ?? 0,
    managerComments: r.managerComments ?? "",
    managerRating: r.managerRating ?? 0,
    overallRating: r.overallRating ?? 0,
    recommendedIncrementPct: r.recommendedIncrementPct ?? 0,
    effectiveFrom: r.effectiveFrom ? r.effectiveFrom.toISOString() : "",
    salaryStructureId: r.salaryStructureId ?? "",
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : "",
    finalizedAt: r.finalizedAt ? r.finalizedAt.toISOString() : "",
    managerSubmittedAt: r.managerSubmittedAt
      ? r.managerSubmittedAt.toISOString()
      : "",
    createdAt: r.createdAt ? r.createdAt.toISOString() : "",
  };
}
