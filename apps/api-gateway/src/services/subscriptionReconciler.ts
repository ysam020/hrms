/**
 * Subscription Reconciler
 *
 * Razorpay retries a failed webhook delivery 5 times over ~24 hours. If the
 * API gateway is down for the entire retry window the event is permanently
 * lost. This reconciler runs every 6 hours and polls Razorpay directly for
 * every tenant that has an active/grace/cancelling subscription, healing any
 * state drift that missed webhooks would have left behind.
 *
 * It is the last line of defence — the webhook handler is still the primary
 * (and near-instant) path for subscription state changes.
 */

import { prisma } from "@hrms/db";
import { getRazorpay } from "../handlers/payment";
import { logger } from "@hrms/logger";

const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function startSubscriptionReconciler(): void {
  // Kick off the first run after a short delay so the server finishes booting.
  const firstRunDelay = 30_000; // 30 s
  setTimeout(() => {
    void reconcile();
    setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  }, firstRunDelay);

  logger.info(
    `Subscription reconciler scheduled: first run in ${firstRunDelay / 1000}s, then every ${RECONCILE_INTERVAL_MS / 3600_000}h`,
  );
}

async function reconcile(): Promise<void> {
  logger.info("Subscription reconciler: starting run");
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        razorpaySubscriptionId: { not: null },
        subscriptionStatus: { in: ["active", "grace_period", "cancelling"] },
      },
      select: {
        id: true,
        razorpaySubscriptionId: true,
        planExpiresAt: true,
        billing: true,
        subscriptionStatus: true,
      },
    });

    logger.info(
      `Subscription reconciler: checking ${tenants.length} tenant(s)`,
    );
    if (tenants.length === 0) return;

    const rzp = getRazorpay();
    const now = new Date();

    for (const tenant of tenants) {
      try {
        const sub = await (rzp.subscriptions.fetch as any)(
          tenant.razorpaySubscriptionId!,
        );

        // Razorpay's `current_end` is a Unix timestamp (seconds).
        const rzpExpiry: Date | null = sub.current_end
          ? new Date(sub.current_end * 1000)
          : null;

        if (sub.status === "active") {
          // Razorpay considers the subscription active. Heal any stale DB state.
          const updates: Record<string, unknown> = {};

          if (tenant.subscriptionStatus !== "active") {
            updates.subscriptionStatus = "active";
          }
          // Push planExpiresAt forward if Razorpay's value is later than ours.
          if (
            rzpExpiry &&
            (!tenant.planExpiresAt || rzpExpiry > tenant.planExpiresAt)
          ) {
            updates.planExpiresAt = rzpExpiry;
          }

          if (Object.keys(updates).length > 0) {
            await prisma.tenant.update({
              where: { id: tenant.id },
              data: updates,
            });
            logger.info(
              `Reconciler healed tenant ${tenant.id}: ${JSON.stringify(updates)}`,
            );
          }
        } else if (
          sub.status === "halted" &&
          tenant.subscriptionStatus === "active"
        ) {
          // All Razorpay retries failed — missed the halted webhook.
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "grace_period" },
          });
          logger.warn(
            `Reconciler: tenant ${tenant.id} moved to grace_period (Razorpay halted — missed webhook)`,
          );
        } else if (
          ["cancelled", "completed", "expired"].includes(sub.status) &&
          tenant.subscriptionStatus !== "expired"
        ) {
          // Missed the cancelled/completed webhook (or cancel was confirmed).
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "expired" },
          });
          logger.warn(
            `Reconciler: tenant ${tenant.id} marked expired (Razorpay status: ${sub.status})`,
          );
        } else if (
          sub.status === "active" &&
          tenant.subscriptionStatus === "cancelling"
        ) {
          // Cancel was requested but Razorpay still shows active — webhook
          // may still be in flight. Log so we can monitor; reconciler will
          // catch up on the next run if it persists.
          logger.warn(
            `Reconciler: tenant ${tenant.id} is "cancelling" but Razorpay shows active — webhook may be delayed`,
          );
        }

        // Soft expiry guard: if our planExpiresAt is in the past and the
        // subscription is somehow still "active" in DB, flip to grace_period.
        if (
          tenant.subscriptionStatus === "active" &&
          tenant.planExpiresAt &&
          tenant.planExpiresAt < now &&
          sub.status !== "active"
        ) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { subscriptionStatus: "grace_period" },
          });
          logger.warn(
            `Reconciler: tenant ${tenant.id} plan expired locally — moved to grace_period`,
          );
        }
      } catch (err) {
        // Don't let a single tenant failure abort the whole run.
        logger.warn(
          `Reconciler: error checking tenant ${tenant.id} — skipping`,
          { err },
        );
      }
    }

    logger.info("Subscription reconciler: run complete");
  } catch (err) {
    logger.error("Subscription reconciler: fatal error during run", { err });
  }
}
