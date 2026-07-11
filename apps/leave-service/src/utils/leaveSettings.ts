import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import type { LeavePolicy } from "../handlers/leaveBalanceHelpers";

const SETTINGS_CACHE_TTL = 900; // 15 min

export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

export interface LeaveSettings {
  medicalCertRequired: boolean;
  customLeaveTypes: any[];
  leavePolicies: LeavePolicy[];
  workingDays: number[];
  // Legacy flat quotas — superseded per-type by a matching leavePolicies
  // entry's daysPerYear when configured; used as the seed value for a leave
  // type's first numeric balances[] entry otherwise. See ensureTrackedBalance.
  paidLeavesPerYear: number;
  sickLeavesPerYear: number;
  casualLeavesPerYear: number;
}

/**
 * Returns the active leave-policy settings from the DB.
 * Active = latest version where effectiveFrom ≤ now.
 * Returns null when no settings record has been created yet.
 *
 * Shared by every leave-service handler that needs to enforce
 * TenantSettings.leavePolicies (apply/approve/cancel) so they can never
 * disagree about which policy applies to a given leave type.
 */
export async function getLeaveSettings(
  tenantId: string,
): Promise<LeaveSettings | null> {
  const cacheKey = `tenantSettings:leave:${tenantId}`;
  const cached = await cacheManager.get(cacheKey);
  if (cached) return cached as LeaveSettings;

  const settings = await (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      medicalCertRequired: true,
      customLeaveTypes: true,
      leavePolicies: true,
      workWeekPattern: true,
      paidLeavesPerYear: true,
      sickLeavesPerYear: true,
      casualLeavesPerYear: true,
    },
  });

  if (!settings) return null;

  const result: LeaveSettings = {
    medicalCertRequired: settings.medicalCertRequired as boolean,
    customLeaveTypes: (settings.customLeaveTypes as any[]) ?? [],
    leavePolicies: (settings.leavePolicies as LeavePolicy[]) ?? [],
    workingDays:
      (settings.workWeekPattern as any)?.workingDays ?? DEFAULT_WORKING_DAYS,
    paidLeavesPerYear: settings.paidLeavesPerYear ?? 12,
    sickLeavesPerYear: settings.sickLeavesPerYear ?? 12,
    casualLeavesPerYear: settings.casualLeavesPerYear ?? 6,
  };
  await cacheManager.set(cacheKey, result, "system", SETTINGS_CACHE_TTL);
  return result;
}

/** Invalidates the cached leave settings for a tenant — call after any write to TenantSettings. */
export async function invalidateLeaveSettingsCache(
  tenantId: string,
): Promise<void> {
  await cacheManager.delete(`tenantSettings:leave:${tenantId}`);
}
