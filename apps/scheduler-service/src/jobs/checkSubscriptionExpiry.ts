import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// A trial's first charge is Razorpay's to make at the trial's end, and UPI
// Autopay / e-Mandate debits can take hours to confirm. A trial is only
// treated as lapsed once that charge is a day overdue — until then it stays
// "trialing", so its owner isn't told to renew a payment already in flight.
const FIRST_CHARGE_SETTLE_MS = 24 * 60 * 60 * 1000;

export async function checkSubscriptionExpiry(): Promise<void> {
  try {
    const now = new Date();
    const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);
    const trialSettleCutoff = new Date(now.getTime() - FIRST_CHARGE_SETTLE_MS);

    // active → grace_period: planExpiresAt has passed
    const toGrace = await prisma.tenant.updateMany({
      where: {
        subscriptionStatus: "active",
        planExpiresAt: { lt: now },
      },
      data: { subscriptionStatus: "grace_period" },
    });

    // trialing → grace_period: the trial ended (planExpiresAt = trialEndsAt)
    // and its first charge never arrived. The grace window below still runs
    // from planExpiresAt, so an unpaid trial gets the same 7 days as a
    // lapsed paid plan; a late subscription.charged webhook still activates
    // it from either state.
    const trialsToGrace = await prisma.tenant.updateMany({
      where: {
        subscriptionStatus: "trialing",
        planExpiresAt: { lt: trialSettleCutoff },
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
      `checkSubscriptionExpiry: ${toGrace.count + trialsToGrace.count} → grace_period (${trialsToGrace.count} trials), ${toExpired.count} → expired`,
    );
  } catch (error) {
    logger.error("Error in checkSubscriptionExpiry job:", { error });
    throw error;
  }
}
