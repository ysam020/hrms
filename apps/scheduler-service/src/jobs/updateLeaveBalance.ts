import {
  prisma,
  prismaWithTenant,
  getClientForDb,
  runWithTenant,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { getLeaveConfig } from "../config";
import dayjs from "dayjs";

interface BalanceEntry {
  month: number;
  year: number;
  earnedPL: number;
  usedPL: number;
  usedLWP: number;
  remainingPL: number;
}

interface CarryForwardPolicy {
  enabled?: boolean;
  maxDays?: number;
}

interface LeavePolicyRow {
  key?: string;
  name?: string;
  daysPerYear?: number;
  accrualMethod?: "lump_sum" | "monthly";
  carryForward?: CarryForwardPolicy;
}

const PL_POLICY_KEYS = ["pl", "paid leave"];

/**
 * Reads TenantSettings.leavePolicies once for a tenant — used for both the
 * PL carry-forward step (array-shaped balances) and the monthly-accrual
 * step (flat-map balances) below. Returns [] when the tenant hasn't
 * configured leavePolicies at all.
 */
async function getLeavePolicies(tenantId: string): Promise<LeavePolicyRow[]> {
  const settings = await (prismaWithTenant as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { leavePolicies: true },
  });
  return (settings?.leavePolicies as LeavePolicyRow[]) ?? [];
}

/**
 * PL carry-forward — operates only on the legacy array-shaped balances
 * ([{month,year,earnedPL,usedPL,usedLWP,remainingPL}]). Rows using the
 * flat-map shape ({PL: 10, SL: 5, ...} — written by leave-service's
 * ensureTrackedBalance/adjustBalance for real-time quota tracking) are left
 * untouched: coercing them to [] here and writing back would silently wipe
 * out real tracked balances, and this carry-forward logic has no meaning
 * for that shape anyway.
 */
async function processCarryForward(
  tenantId: string,
  leaveBalances: any[],
  policies: LeavePolicyRow[],
  currentMonth: number,
  currentYear: number,
  isApril: boolean,
  defaultCarryForwardLeaves: number,
): Promise<number> {
  const plPolicy = policies.find((p) =>
    PL_POLICY_KEYS.includes(String(p.key ?? p.name ?? "").toLowerCase()),
  );
  const carryForwardPolicy = plPolicy?.carryForward ?? null;
  const carryForwardEnabled = carryForwardPolicy?.enabled ?? true;
  const carryForwardCap =
    carryForwardPolicy?.maxDays ?? defaultCarryForwardLeaves;

  let updated = 0;
  for (const lb of leaveBalances) {
    if (!Array.isArray(lb.balances)) continue;
    const balances = lb.balances as unknown as BalanceEntry[];
    let totalRemainingPL = 0;

    for (const bal of balances) {
      if (
        bal.year < currentYear ||
        (bal.year === currentYear && bal.month < currentMonth)
      ) {
        totalRemainingPL += bal.remainingPL ?? 0;
        bal.remainingPL = 0;
      }
    }

    // Disabled carry-forward forfeits this month's newly-freed PL rather
    // than adding it to the accumulator — it does not claw back whatever
    // was already accumulated in prior runs.
    let newAccumulated = carryForwardEnabled
      ? lb.accumulatedPLBeforeCurrentMonth + totalRemainingPL
      : lb.accumulatedPLBeforeCurrentMonth;

    if (isApril && newAccumulated > carryForwardCap) {
      newAccumulated = carryForwardCap;
    }

    await (prismaWithTenant as any).leaveBalance.update({
      where: { id: lb.id },
      data: {
        accumulatedPLBeforeCurrentMonth: newAccumulated,
        balances: balances as any,
      },
    });

    updated++;
  }
  return updated;
}

/**
 * Monthly accrual — for leavePolicies with accrualMethod:"monthly", credits
 * daysPerYear/12 onto the flat-map balances entry each time this job runs,
 * capped at daysPerYear for the year. No-ops for a user/policy that isn't
 * already tracked (ensureTrackedBalance seeds it on first leave application
 * for that type — this job only tops up what's already there).
 */
async function processMonthlyAccrual(
  tenantId: string,
  leaveBalances: any[],
  policies: LeavePolicyRow[],
): Promise<number> {
  const monthlyPolicies = policies.filter(
    (p) => p.accrualMethod === "monthly" && p.key && p.daysPerYear,
  );
  if (monthlyPolicies.length === 0) return 0;

  let updated = 0;
  for (const lb of leaveBalances) {
    if (Array.isArray(lb.balances)) continue; // array-shaped rows use carry-forward, not this
    const balances = (lb.balances as Record<string, number>) ?? {};

    // Merge every policy's accrual for this row into one balances object
    // first, then issue a single write per row instead of one write per
    // (row × monthly policy) pair.
    let changed = false;
    const nextBalances = { ...balances };
    for (const policy of monthlyPolicies) {
      const key = policy.key!;
      if (typeof balances[key] !== "number") continue; // not tracked for this user/type yet
      const monthlyAmount = policy.daysPerYear! / 12;
      nextBalances[key] = Math.min(
        balances[key] + monthlyAmount,
        policy.daysPerYear!,
      );
      changed = true;
    }
    if (!changed) continue;

    const result = await (prismaWithTenant as any).leaveBalance.updateMany({
      where: { id: lb.id, updatedAt: lb.updatedAt },
      data: { balances: nextBalances },
    });
    if (result.count === 1) updated++;
  }
  return updated;
}

export async function updateLeaveBalance(): Promise<void> {
  try {
    const now = dayjs();
    const currentMonth = now.month() + 1;
    const currentYear = now.year();
    const isApril = currentMonth === 4;
    const { carryForwardLeaves } = getLeaveConfig();

    // LeaveBalance is a business model: it lives in each tenant's own
    // physical DB once provisioned (Tenant.dbName), and falls back to the
    // shared master DB otherwise. Querying the master `prisma` singleton
    // directly (the previous implementation) silently finds nothing for any
    // tenant that has been migrated to a dedicated DB — iterate tenants
    // explicitly instead, same pattern as reconcileAttendance.ts.
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, dbName: true },
    });

    let updated = 0;
    let errors = 0;
    for (const tenant of tenants) {
      const tenantClient = tenant.dbName ? getClientForDb(tenant.dbName) : null;
      try {
        await runWithTenant(tenant.id, tenantClient, async () => {
          const policies = await getLeavePolicies(tenant.id);
          const leaveBalances = await (
            prismaWithTenant as any
          ).leaveBalance.findMany({ where: { tenantId: tenant.id } });

          updated += await processCarryForward(
            tenant.id,
            leaveBalances,
            policies,
            currentMonth,
            currentYear,
            isApril,
            carryForwardLeaves,
          );
          updated += await processMonthlyAccrual(
            tenant.id,
            leaveBalances,
            policies,
          );
        });
      } catch (err) {
        errors++;
        logger.error(
          `updateLeaveBalance: error processing tenant ${tenant.id}`,
          { err },
        );
      }
    }

    logger.info(
      `updateLeaveBalance: updated ${updated} leave balance records across ${tenants.length} tenants (${errors} errors)`,
    );
  } catch (error) {
    logger.error("Error in leave balance update job:", { error });
    throw error;
  }
}
