import { prismaWithTenant as prisma } from "@hrms/db";

// Reporting-manager lookup via Team.teamLeaderId, falling back to the
// cycle's creator (HR/admin who set it up) when the employee isn't on any
// Team — mirrors @hrms/approval-engine's own team-leader-else-owner/admin
// fallback, so every review always ends up with SOMEONE who can act on the
// manager-review step, instead of silently sitting unreachable in nobody's
// "Team Reviews" list. Returns null (not "") only if even that's missing,
// since PerformanceReview.reviewerId is an optional @db.ObjectId and Mongo
// rejects an empty-string ObjectId.
export async function resolveReviewerId(
  tenantId: string,
  userId: string,
  fallbackUserId?: string | null,
): Promise<string | null> {
  const team = await prisma.team.findFirst({
    where: { tenantId, members: { has: userId } },
  });
  return team?.teamLeaderId ?? fallbackUserId ?? null;
}
