import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";

const COMP_OFF_TYPE = "COMP_OFF";

/**
 * Resolves a Pending or Approved full-day leave covering `date` so check-in
 * can proceed, instead of blocking it outright:
 *   - Pending: never actually approved, so nothing needs reversing — just
 *     cancelled (check-in supersedes an unactioned request).
 *   - Approved: treated as a same-day, self-service cancellation — the
 *     balance (or comp-off credits) is restored immediately, no second
 *     approval required, since a successful check-in (incl. geofencing) is
 *     strong, hard-to-fake proof the employee is actually at work. HR/the
 *     original approver are notified after the fact rather than gating on
 *     their sign-off.
 *
 * Call this only once check-in is otherwise guaranteed to succeed (after
 * geofencing/shift resolution) — cancelling the leave and then having the
 * check-in itself fail for an unrelated reason would leave the employee
 * with neither.
 *
 * Returns a human-readable note to surface in the check-in response when a
 * leave was cancelled, or null when there was nothing to resolve.
 *
 * NOTE: this does not cancel the ApprovalInstance created at apply-time
 * (would require attendance-service to depend on @hrms/approval-engine,
 * which is more coupling than this edge case warrants). If a manager later
 * acts on that now-stale instance, leave-service's approveLeave.ts
 * status-guards its transition (`updateMany({ where: { status: "Pending" } })`)
 * and correctly no-ops instead of corrupting state, since the leave is no
 * longer "Pending" by then — so this is a dangling-inbox-item UX nit, not a
 * correctness gap.
 */
export async function resolveLeaveConflictForCheckIn(
  tenantId: string,
  userId: string,
  date: Date,
): Promise<string | null> {
  const leave = await (prisma as any).leaveApplication.findFirst({
    where: {
      tenantId,
      userId,
      status: { in: ["Pending", "Approved"] },
      unit: "full_day",
      from: { lte: date },
      to: { gte: date },
    },
  });
  if (!leave) return null;

  const wasApproved = leave.status === "Approved";

  await (prisma as any).leaveApplication.update({
    where: { id: leave.id },
    data: {
      status: "Cancelled",
      cancelledOn: new Date(),
      cancelledBy: userId,
      cancellationReason: wasApproved
        ? "Auto-cancelled — employee checked in"
        : "Superseded by check-in",
    },
  });

  if (!wasApproved) {
    // Pending leaves never touched the balance — nothing to restore.
    return "Your pending leave request for today was automatically withdrawn since you checked in.";
  }

  if (leave.leaveType?.toUpperCase?.() === COMP_OFF_TYPE) {
    await (prisma as any).compOffCredit.updateMany({
      where: { usedInLeaveApplicationId: leave.id, status: "used" },
      data: { status: "available", usedInLeaveApplicationId: null },
    });
  } else {
    await creditBalanceBack(tenantId, userId, leave.leaveType, leave.days);
  }

  notifyLeaveAutoCancelled(userId, leave).catch((err) =>
    logger.warn("[resolveLeaveConflictForCheckIn] Notification failed:", {
      err,
    }),
  );

  return "Your approved leave for today was automatically cancelled since you checked in — your leave balance has been restored.";
}

/**
 * Optimistic-concurrency balance credit (compare-and-swap on `updatedAt`) —
 * mirrors leave-service's adjustBalance in leaveBalanceHelpers.ts. Kept as a
 * small, self-contained duplicate here rather than a cross-app import,
 * since apps/* don't import from one another in this monorepo — only
 * packages/* are shared.
 */
async function creditBalanceBack(
  tenantId: string,
  userId: string,
  leaveType: string,
  days: number,
): Promise<void> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await (prisma as any).leaveBalance.findFirst({
      where: { tenantId, userId },
    });
    if (!row) return;
    const balances = { ...((row.balances as Record<string, number>) ?? {}) };
    if (typeof balances[leaveType] !== "number") return;
    balances[leaveType] = balances[leaveType] + days;

    const result = await (prisma as any).leaveBalance.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { balances },
    });
    if (result.count === 1) return; // won the race
    // Someone else updated this row between our read and write — retry.
  }
  logger.warn(
    `resolveLeaveConflictForCheckIn: too much contention crediting balance back for user ${userId}`,
  );
}

async function notifyLeaveAutoCancelled(
  userId: string,
  leave: any,
): Promise<void> {
  const [employee, hrUsers, approver] = await Promise.all([
    (prisma as any).user.findUnique({
      where: { id: userId },
      select: { username: true },
    }),
    (prisma as any).user.findMany({
      where: { department: "HUMAN RESOURCES" },
      select: { id: true, username: true },
    }),
    leave.approvedById
      ? (prisma as any).user.findUnique({
          where: { id: leave.approvedById },
          select: { id: true, username: true },
        })
      : null,
  ]);

  const targets = approver ? [...hrUsers, approver] : hrUsers;
  const uniqueIds = [...new Set<string>(targets.map((u: any) => u.id))];
  const uniqueUsernames = [
    ...new Set<string>(targets.map((u: any) => u.username)),
  ];
  if (uniqueUsernames.length === 0) return;

  await notify({
    tenantId: getTenantId()!,
    event: "leaveAutoCancelled",
    recipients: uniqueIds,
    pushTargets: uniqueUsernames,
    inApp: {
      title: "Leave",
      message: `${employee?.username || userId}'s approved leave for today was auto-cancelled — they checked in instead.`,
      eventType: "leave_notification",
      priority: "medium",
    },
  });
}
