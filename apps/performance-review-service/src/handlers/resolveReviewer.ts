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

// Batched variant of resolveReviewerId for assigning/re-resolving reviewers
// for many employees at once (bulk cycle create/edit). One query for the
// whole set instead of one `team.findFirst` per employee, indexed into a
// Map for O(1) per-employee lookup afterward — turns N sequential DB round
// trips into a single query + O(n) in-memory pass.
export async function resolveReviewerIds(
  tenantId: string,
  userIds: string[],
  fallbackUserId?: string | null,
): Promise<Map<string, string | null>> {
  const reviewerByUserId = new Map<string, string | null>();
  if (userIds.length === 0) return reviewerByUserId;

  const teams = await prisma.team.findMany({
    where: { tenantId, members: { hasSome: userIds } },
  });

  const wantedUserIds = new Set(userIds);
  for (const team of teams) {
    if (!team.teamLeaderId) continue;
    for (const memberId of team.members) {
      // First matching team wins, mirroring findFirst's single-match
      // semantics for a user who happens to be on more than one team.
      if (wantedUserIds.has(memberId) && !reviewerByUserId.has(memberId)) {
        reviewerByUserId.set(memberId, team.teamLeaderId);
      }
    }
  }

  for (const userId of userIds) {
    if (!reviewerByUserId.has(userId)) {
      reviewerByUserId.set(userId, fallbackUserId ?? null);
    }
  }

  return reviewerByUserId;
}
