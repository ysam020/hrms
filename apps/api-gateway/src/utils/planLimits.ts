import { prisma } from "@hrms/db";
import { TIER_EMPLOYEE_LIMITS, type PlanTier } from "../config/billingPlans";

// Counts every employeeStatus:"Active" User for a tenant — the same count
// used by employeeInsights/getDashboardStats elsewhere in the codebase — and
// includes the owner (set Active in buildTenant), which is intentional: the
// owner occupies a seat too.
export async function getActiveEmployeeCount(
  tenantId: string,
): Promise<number> {
  return prisma.user.count({ where: { tenantId, employeeStatus: "Active" } });
}

export interface SeatStatus {
  tier: PlanTier;
  limit: number | null; // null = uncapped (enterprise)
  activeCount: number;
  available: boolean;
}

export async function getSeatStatus(tenantId: string): Promise<SeatStatus> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { planTier: true },
  });
  const tier: PlanTier =
    tenant?.planTier === "growth" || tenant?.planTier === "enterprise"
      ? tenant.planTier
      : "starter";
  const limit = TIER_EMPLOYEE_LIMITS[tier];
  const activeCount = await getActiveEmployeeCount(tenantId);
  return {
    tier,
    limit,
    activeCount,
    available: limit === null || activeCount < limit,
  };
}

export async function isSeatAvailable(tenantId: string): Promise<boolean> {
  return (await getSeatStatus(tenantId)).available;
}
