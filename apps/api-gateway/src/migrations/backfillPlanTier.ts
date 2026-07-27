import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { tierForEmployeeCount } from "../config/billingPlans";

/**
 * One-time migration for the starter/growth/enterprise plan tiers: every
 * tenant created before this change defaults to planTier "starter" (the
 * Prisma schema default), which would incorrectly block an existing large
 * tenant from adding another employee. This assigns every subscribed
 * tenant still on that default the tier that actually matches its current
 * headcount — it does NOT touch their live Razorpay subscription/price,
 * which stays exactly as it was (grandfathered) until they explicitly use
 * the new "change plan" flow. Safe to run multiple times: only tenants
 * still sitting on the just-added "starter" default are touched.
 */
export async function backfillPlanTier(): Promise<void> {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { planTier: "starter", razorpaySubscriptionId: { not: null } },
      select: { id: true },
    });
    if (tenants.length === 0) return;

    let migrated = 0;
    for (const tenant of tenants) {
      const activeCount = await prisma.user.count({
        where: { tenantId: tenant.id, employeeStatus: "Active" },
      });
      const tier = tierForEmployeeCount(activeCount);
      if (tier !== "starter") {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { planTier: tier },
        });
        migrated++;
      }
    }

    if (migrated > 0) {
      logger.info(`backfillPlanTier: reassigned ${migrated} tenant(s)`);
    }
  } catch (err) {
    logger.warn("backfillPlanTier failed (non-fatal):", { err });
  }
}
