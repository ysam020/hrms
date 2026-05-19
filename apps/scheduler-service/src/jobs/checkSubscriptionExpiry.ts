import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function checkSubscriptionExpiry(): Promise<void> {
  try {
    const now = new Date();
    const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

    // active → grace_period: planExpiresAt has passed
    const toGrace = await prisma.tenant.updateMany({
      where: {
        subscriptionStatus: "active",
        planExpiresAt: { lt: now },
      },
      data: { subscriptionStatus: "grace_period" },
    });

    // grace_period → expired: grace window has also passed
    const toExpired = await prisma.tenant.updateMany({
      where: {
        subscriptionStatus: "grace_period",
        planExpiresAt: { lt: graceCutoff },
      },
      data: { subscriptionStatus: "expired" },
    });

    logger.info(
      `checkSubscriptionExpiry: ${toGrace.count} → grace_period, ${toExpired.count} → expired`,
    );
  } catch (error) {
    logger.error("Error in checkSubscriptionExpiry job:", { error });
    throw error;
  }
}
