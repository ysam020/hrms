import { prismaWithTenant as prisma } from "@hrms/db";

/**
 * `LeaveBalance.balances` is a free-form Json blob (`{ PL: 10, SL: 5, ... }`)
 * that nothing in this service actually decrements today — most tenants have
 * no per-type numeric entries in it at all. Enforcement and debiting below is
 * therefore deliberately opt-in and fail-open: if a leave type has no numeric
 * entry in `balances`, we treat it as "not balance-tracked" and skip
 * enforcement entirely, exactly matching today's behavior. Only tenants that
 * have actually populated a numeric balance for a type (via HR crediting it,
 * or a future accrual job) get exhaustion enforcement / debiting for it.
 */

export async function getBalanceRow(tenantId: string, userId: string) {
  return (prisma as any).leaveBalance.findFirst({
    where: { tenantId, userId },
  });
}

/** Returns null when this leave type isn't balance-tracked for this user yet. */
export function getTrackedRemaining(
  balances: unknown,
  leaveType: string,
): number | null {
  if (!balances || typeof balances !== "object") return null;
  const v = (balances as Record<string, unknown>)[leaveType];
  return typeof v === "number" ? v : null;
}

/** No-op if the user has no balance row, or this leave type isn't tracked. */
export async function adjustBalance(
  tenantId: string,
  userId: string,
  leaveType: string,
  delta: number,
): Promise<void> {
  const row = await getBalanceRow(tenantId, userId);
  if (!row) return;
  const balances = { ...((row.balances as Record<string, number>) ?? {}) };
  if (typeof balances[leaveType] !== "number") return;
  balances[leaveType] = balances[leaveType] + delta;
  await (prisma as any).leaveBalance.update({
    where: { id: row.id },
    data: { balances },
  });
}

// ─── Comp-off credits ───────────────────────────────────────────────────────
// A separate resource pool from `balances` — each CompOffCredit is a
// transactional fact (a specific worked date), not a policy-level number.
// Leave applications of type "COMP_OFF" (matching the literal key HR/Settings
// use when crediting comp-off) draw down against available, unexpired credits
// instead of the generic balances JSON.

const COMP_OFF_TYPE = "COMP_OFF";

export function isCompOffLeaveType(
  leaveType: string | null | undefined,
): boolean {
  return !!leaveType && leaveType.toUpperCase() === COMP_OFF_TYPE;
}

/** Sum of available, unexpired comp-off credit for this user — read-only, used to give early feedback at apply time. */
export async function getAvailableCompOffDays(
  tenantId: string,
  userId: string,
): Promise<number> {
  const credits = await (prisma as any).compOffCredit.findMany({
    where: {
      tenantId,
      userId,
      status: "available",
      OR: [{ expiresOn: null }, { expiresOn: { gte: new Date() } }],
    },
  });
  return credits.reduce((sum: number, c: any) => sum + c.earnedDays, 0);
}

/**
 * Consumes the oldest available credits (by sourceDate) until `days` is
 * covered, marking each as "used" against this leave application. May
 * slightly over-consume the last credit rather than splitting it (e.g. a
 * 1.5-day request against 1-day credits consumes two whole credits) — a
 * deliberate simplification. Returns the number of days actually covered.
 */
export async function consumeCompOffCredits(
  tenantId: string,
  userId: string,
  days: number,
  leaveApplicationId: string,
): Promise<number> {
  const credits = await (prisma as any).compOffCredit.findMany({
    where: {
      tenantId,
      userId,
      status: "available",
      OR: [{ expiresOn: null }, { expiresOn: { gte: new Date() } }],
    },
    orderBy: { sourceDate: "asc" },
  });

  let covered = 0;
  for (const credit of credits) {
    if (covered >= days) break;
    await (prisma as any).compOffCredit.update({
      where: { id: credit.id },
      data: { status: "used", usedInLeaveApplicationId: leaveApplicationId },
    });
    covered += credit.earnedDays;
  }
  return covered;
}

/** Reverts every credit consumed by this leave application back to "available" (e.g. on cancellation). */
export async function restoreCompOffCredits(
  leaveApplicationId: string,
): Promise<void> {
  await (prisma as any).compOffCredit.updateMany({
    where: { usedInLeaveApplicationId: leaveApplicationId, status: "used" },
    data: { status: "available", usedInLeaveApplicationId: null },
  });
}

export interface LeavePolicy {
  key: string;
  name: string;
  daysPerYear: number;
  isStatutory?: boolean;
  requiresProof?: boolean;
  isCompOff?: boolean;
  onExhaustion?: "reject" | "auto_lop" | "manager_override";
  [k: string]: unknown;
}

export function findPolicy(
  policies: LeavePolicy[],
  leaveType: string,
): LeavePolicy | undefined {
  return policies.find(
    (p) =>
      p.key?.toLowerCase() === leaveType.toLowerCase() ||
      p.name?.toLowerCase() === leaveType.toLowerCase(),
  );
}
