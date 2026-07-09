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

const PL_POLICY_KEYS = ["pl", "paid leave"];

/**
 * Reads TenantSettings.leavePolicies looking for the PL (Paid Leave) entry's
 * carryForward config. Returns null when the tenant hasn't configured
 * leavePolicies at all — callers fall back to the global env-var default,
 * preserving today's behavior for tenants who haven't touched this setting.
 */
async function getPlCarryForwardPolicy(
  tenantId: string,
): Promise<CarryForwardPolicy | null> {
  const settings = await (prismaWithTenant as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { leavePolicies: true },
  });
  const policies = (settings?.leavePolicies as any[]) ?? [];
  const plPolicy = policies.find((p) =>
    PL_POLICY_KEYS.includes(String(p.key ?? p.name ?? "").toLowerCase()),
  );
  return plPolicy?.carryForward ?? null;
}

async function processTenantBalances(
  tenantId: string,
  currentMonth: number,
  currentYear: number,
  isApril: boolean,
  defaultCarryForwardLeaves: number,
): Promise<number> {
  const carryForwardPolicy = await getPlCarryForwardPolicy(tenantId);
  const carryForwardEnabled = carryForwardPolicy?.enabled ?? true;
  const carryForwardCap =
    carryForwardPolicy?.maxDays ?? defaultCarryForwardLeaves;

  const leaveBalances = await (prismaWithTenant as any).leaveBalance.findMany(
    { where: { tenantId } },
  );

  let updated = 0;
  for (const lb of leaveBalances) {
    const balances = (lb.balances as unknown as BalanceEntry[]) ?? [];
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
      const tenantClient = tenant.dbName
        ? getClientForDb(tenant.dbName)
        : null;
      try {
        await runWithTenant(tenant.id, tenantClient, async () => {
          updated += await processTenantBalances(
            tenant.id,
            currentMonth,
            currentYear,
            isApril,
            carryForwardLeaves,
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
