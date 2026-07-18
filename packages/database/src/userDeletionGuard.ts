import { prismaWithTenant as prisma } from "./prismaWithTenant";

// Single source of truth for "does this user have any historical record
// that a hard delete would orphan" — previously hand-copied (and
// incomplete) in both apps/user-service/src/handlers/deleteUser.ts and
// apps/employee-service/src/handlers/deleteEmployee.ts, each checking only
// 4 of the ~20 tenant-scoped models that reference userId. relationMode is
// "prisma" for the mongodb provider (see schema.prisma's top comment) — no
// DB-level FK cascade exists, so an incomplete guard doesn't error, it just
// silently orphans whatever model it forgot to check.
//
// Add every new tenant-scoped model with a `userId` field here as it's
// introduced — nothing else enforces this list stays complete.
//
// Deliberately NOT included: TenantMembership and NotificationRecipient.
// Both reference userId, but they're per-user operational/relationship
// records rather than historical business data (every active employee has
// exactly one TenantMembership row, so blocking on it would make hard
// delete permanently impossible for every real user, not just protect
// genuine history) — they need cascade *cleanup* on user deletion, not a
// block. That cleanup isn't implemented here; this function only answers
// "is there historical data that would be silently orphaned."
const USER_SCOPED_MODELS = [
  "attendanceRecord",
  "overtimeRequest",
  "leaveApplication",
  "compOffCredit",
  "leaveBalance",
  "jobApplication",
  "resignation",
  "fnfSettlement",
  "salaryStructure",
  "taxDeclaration",
  "auditLog",
  "loginEvent",
  "payrollLineItem",
  "salaryAdvance",
  "performanceReview",
  "assetAssignment",
  "wfhRequest",
  "ticketComment",
  "tenantJoinRequest",
] as const;

export interface UserHistoricalRecordsResult {
  hasRecords: boolean;
  /** Model names (from USER_SCOPED_MODELS) that have at least one row for this user. */
  models: string[];
}

/**
 * Checks every tenant-scoped model that references userId for at least one
 * row belonging to this user. Callers should block a hard delete of the
 * User row if hasRecords is true — soft-delete (employeeStatus) is always
 * safe and doesn't need this check.
 *
 * Not wrapped in a transaction with the caller's subsequent `user.delete`,
 * and can't be: every model here lives in the tenant-specific database
 * (routed through `prismaWithTenant`'s federated proxy), while `User` lives
 * in the shared master database — two different PrismaClient connections,
 * which a single `$transaction` cannot span regardless of whether the
 * underlying MongoDB deployment is a replica set. A write to one of these
 * models landing in the gap between this check and the caller's delete
 * (e.g. a new attendanceRecord created for this user mid-flight) would
 * still be silently orphaned — closing that fully would need every writer
 * of every model above to participate in a shared per-user lock, not just
 * this guard, which is out of proportion to the risk (requires a specific,
 * narrow race window, and only orphans one record rather than causing
 * data loss or a security issue). The best available mitigation is what
 * both callers already do: call this immediately before the delete, with
 * no other work in between.
 */
export async function checkUserHasHistoricalRecords(
  tenantId: string | null | undefined,
  userId: string,
): Promise<UserHistoricalRecordsResult> {
  const counts = await Promise.all(
    USER_SCOPED_MODELS.map((model) =>
      (prisma as any)[model].count({ where: { tenantId, userId } }),
    ),
  );

  const models = USER_SCOPED_MODELS.filter((_, i) => counts[i] > 0);
  return { hasRecords: models.length > 0, models };
}
