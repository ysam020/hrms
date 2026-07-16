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

export async function getBalanceRow(
  tenantId: string,
  userId: string,
  client: any = prisma,
) {
  return client.leaveBalance.findFirst({
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

/**
 * No-op if the user has no balance row, or this leave type isn't tracked.
 *
 * Uses optimistic concurrency (compare-and-swap on `updatedAt`) instead of a
 * plain read-modify-write: two different leave applications for the same
 * user approved in the same instant must not silently lose one debit by both
 * reading the same starting balance and overwriting each other's write.
 */
export async function adjustBalance(
  tenantId: string,
  userId: string,
  leaveType: string,
  delta: number,
  client: any = prisma,
): Promise<void> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await getBalanceRow(tenantId, userId, client);
    if (!row) return;
    const balances = { ...((row.balances as Record<string, number>) ?? {}) };
    if (typeof balances[leaveType] !== "number") return;
    balances[leaveType] = balances[leaveType] + delta;

    const result = await client.leaveBalance.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { balances },
    });
    if (result.count === 1) return; // won the race
    // Someone else updated this row between our read and write — retry.
  }
  throw new Error(
    `adjustBalance: too much contention on balance row for user ${userId} after ${MAX_ATTEMPTS} attempts`,
  );
}

/**
 * Monthly accrual for leavePolicies with accrualMethod:"monthly" — credits
 * `monthlyAmount` (typically daysPerYear/12) each time this runs, capped so
 * the tracked balance never exceeds `annualCap`. Intended to be called once
 * per calendar month by the scheduler job. No-ops if this leave type isn't
 * already tracked for the user (call ensureTrackedBalance first to seed it).
 */
export async function accrueMonthlyLeave(
  tenantId: string,
  userId: string,
  leaveType: string,
  monthlyAmount: number,
  annualCap: number,
): Promise<void> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await getBalanceRow(tenantId, userId);
    if (!row) return;
    const balances = { ...((row.balances as Record<string, number>) ?? {}) };
    if (typeof balances[leaveType] !== "number") return;
    balances[leaveType] = Math.min(
      balances[leaveType] + monthlyAmount,
      annualCap,
    );

    const result = await (prisma as any).leaveBalance.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { balances },
    });
    if (result.count === 1) return;
  }
  throw new Error(
    `accrueMonthlyLeave: too much contention on balance row for user ${userId} after ${MAX_ATTEMPTS} attempts`,
  );
}

// ─── Comp-off credits ───────────────────────────────────────────────────────
// A separate resource pool from `balances` — each CompOffCredit is a
// transactional fact (a specific worked date), not a policy-level number.
// Draws down against available, unexpired credits instead of the generic
// balances JSON for any leave type resolved as comp-off — either the legacy
// literal key "COMP_OFF", or any tenant-defined leavePolicies entry flagged
// `isCompOff: true` (e.g. a custom-keyed "CO" type).

const COMP_OFF_TYPE = "COMP_OFF";

export function isCompOffLeaveType(
  leaveType: string | null | undefined,
  policies?: LeavePolicy[],
): boolean {
  if (!leaveType) return false;
  if (leaveType.toUpperCase() === COMP_OFF_TYPE) return true;
  if (!policies) return false;
  return !!findPolicy(policies, leaveType)?.isCompOff;
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
  client: any = prisma,
): Promise<number> {
  const credits = await client.compOffCredit.findMany({
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
    // Guard against a concurrent consumer (two approvals racing on the same
    // credit) claiming the same credit twice — the update only lands if the
    // credit is still "available" at write time.
    const claimed = await client.compOffCredit.updateMany({
      where: { id: credit.id, status: "available" },
      data: { status: "used", usedInLeaveApplicationId: leaveApplicationId },
    });
    if (claimed.count === 1) covered += credit.earnedDays;
  }
  return covered;
}

/** Reverts every credit consumed by this leave application back to "available" (e.g. on cancellation). */
export async function restoreCompOffCredits(
  leaveApplicationId: string,
  client: any = prisma,
): Promise<void> {
  await client.compOffCredit.updateMany({
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
  prorateByJoinDate?: boolean;
  accrualMethod?: "lump_sum" | "monthly";
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

// ─── Quota resolution / seeding ─────────────────────────────────────────────
// balances[] only has a numeric entry for a leave type once *something*
// puts one there. Previously nothing ever did for the built-in PL/SL/CL
// types (TenantSettings.paidLeavesPerYear etc. were configurable but never
// read), so every tenant silently fell into the fail-open "not tracked" path
// regardless of what they configured. ensureTrackedBalance is the seed point:
// call it before relying on getTrackedRemaining so a leave type with a
// resolvable quota (a matching leavePolicies entry, or a built-in PL/SL/CL
// scalar) always gets a real starting balance on first use.

export interface QuotaSettings {
  leavePolicies: LeavePolicy[];
  // [{ name, key, daysPerYear, requiresProof }] — the older, simpler config
  // surface. A matching leavePolicies entry takes precedence when both are
  // configured for the same key (see TenantSettings.leavePolicies comment).
  customLeaveTypes?: { key?: string; name?: string; daysPerYear?: number }[];
  paidLeavesPerYear: number;
  sickLeavesPerYear: number;
  casualLeavesPerYear: number;
}

const BUILTIN_SCALAR_QUOTA: Record<
  string,
  "paidLeavesPerYear" | "sickLeavesPerYear" | "casualLeavesPerYear"
> = {
  PL: "paidLeavesPerYear",
  "PAID LEAVE": "paidLeavesPerYear",
  SL: "sickLeavesPerYear",
  "SICK LEAVE": "sickLeavesPerYear",
  CL: "casualLeavesPerYear",
  "CASUAL LEAVE": "casualLeavesPerYear",
};

/** The tenant's per-year quota for this leave type, or null if unconfigured anywhere. */
export function resolveAnnualQuota(
  leaveType: string,
  settings: QuotaSettings,
): number | null {
  const policy = findPolicy(settings.leavePolicies, leaveType);
  if (policy && typeof policy.daysPerYear === "number") {
    return policy.daysPerYear;
  }
  const custom = settings.customLeaveTypes?.find(
    (t) =>
      t.key?.toLowerCase() === leaveType.toLowerCase() ||
      t.name?.toLowerCase() === leaveType.toLowerCase(),
  );
  if (custom && typeof custom.daysPerYear === "number") {
    return custom.daysPerYear;
  }
  const scalarKey = BUILTIN_SCALAR_QUOTA[leaveType.toUpperCase()];
  return scalarKey ? settings[scalarKey] : null;
}

/**
 * First-year proration: an employee joining partway through the year gets
 * the quota scaled by however many months (inclusive of join month) remain
 * in the calendar year, rather than the full annual amount. Only applies
 * when the matching policy has prorateByJoinDate set and the employee's
 * join date falls in the current calendar year.
 */
export function prorateAnnualQuota(
  annualQuota: number,
  joiningDate: Date | null | undefined,
  prorate: boolean,
): number {
  if (!prorate || !joiningDate) return annualQuota;
  const now = new Date();
  if (joiningDate.getFullYear() !== now.getFullYear()) return annualQuota;
  const monthsRemaining = 12 - joiningDate.getMonth();
  return Math.round((annualQuota * monthsRemaining) / 12);
}

/**
 * Ensures balances[leaveType] has a numeric entry, seeding it from the
 * tenant's configured quota (leavePolicies.daysPerYear, else the built-in
 * PL/SL/CL scalar) on first use. Returns the tracked remaining amount, or
 * null if this leave type has no resolvable quota anywhere (stays fail-open,
 * matching pre-existing behavior for genuinely unconfigured custom types).
 */
export async function ensureTrackedBalance(
  tenantId: string,
  userId: string,
  leaveType: string,
  settings: QuotaSettings,
  joiningDate?: Date | null,
): Promise<number | null> {
  const row = await getBalanceRow(tenantId, userId);
  const existing = row ? getTrackedRemaining(row.balances, leaveType) : null;
  if (existing !== null) return existing;

  const annualQuota = resolveAnnualQuota(leaveType, settings);
  if (annualQuota === null) return null;

  const policy = findPolicy(settings.leavePolicies, leaveType);
  const seedAmount = prorateAnnualQuota(
    annualQuota,
    joiningDate,
    !!policy?.prorateByJoinDate,
  );

  if (row) {
    const balances = {
      ...((row.balances as Record<string, number>) ?? {}),
      [leaveType]: seedAmount,
    };
    const result = await (prisma as any).leaveBalance.updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: { balances },
    });
    if (result.count !== 1) {
      // Lost a seeding race to a concurrent request — whatever it wrote
      // stands; read it back instead of overwriting.
      const fresh = await getBalanceRow(tenantId, userId);
      return getTrackedRemaining(fresh?.balances, leaveType);
    }
  } else {
    await (prisma as any).leaveBalance.create({
      data: { tenantId, userId, balances: { [leaveType]: seedAmount } },
    });
  }
  return seedAmount;
}
