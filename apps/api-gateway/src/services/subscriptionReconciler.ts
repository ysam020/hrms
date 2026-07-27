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
import { getRedisClient } from "@hrms/cache";
import { getRazorpay } from "../handlers/payment";
import { logger } from "@hrms/logger";

const RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// This is a setInterval running in every gateway process — with N replicas,
// N reconcilers would otherwise poll Razorpay for every tenant on the same
// schedule and race writes to the same Tenant rows. A short-lived Redis
// lease (SET NX) makes only one replica actually run each cycle; the rest
// see the key already held and skip. The lease's own TTL is the safety net
// if the winning replica dies mid-run — it expires well before the next
// scheduled tick, so a crash never permanently blocks reconciliation.
const LOCK_KEY = "lock:subscription-reconciler";
const LOCK_TTL_SECONDS = 30 * 60; // well under the 6h interval, well over a run's expected duration

async function acquireLock(): Promise<boolean> {
  const result = await getRedisClient().set(
    LOCK_KEY,
    "1",
    "EX",
    LOCK_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
}

export function startSubscriptionReconciler(): void {
  // Kick off the first run after a short delay so the server finishes booting.
  const firstRunDelay = 30_000; // 30 s
  // unref() on both timers: this is a best-effort background job, not a
  // reason to keep the process alive on its own (the HTTP/gRPC listeners
  // already do that) — and without it, a test that calls this function
  // leaks a real handle past the test run's own lifetime.
  const firstRunTimer = setTimeout(() => {
    void reconcile();
    const interval = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    interval.unref();
  }, firstRunDelay);
  firstRunTimer.unref();

  logger.info(
    `Subscription reconciler scheduled: first run in ${firstRunDelay / 1000}s, then every ${RECONCILE_INTERVAL_MS / 3600_000}h`,
  );
}

async function reconcile(): Promise<void> {
  let gotLock = false;
  try {
    gotLock = await acquireLock();
  } catch (err) {
    // Redis unavailable — fail closed (skip) rather than risk every replica
    // running unguarded because the lock check itself couldn't be made.
    logger.warn("Subscription reconciler: lock check failed, skipping run", {
      err,
    });
    return;
  }
  if (!gotLock) {
    logger.info(
      "Subscription reconciler: another replica holds the lock, skipping this run",
    );
    return;
  }

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
        pendingPlanTier: true,
        pendingBilling: true,
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

        if (
          sub.status === "active" &&
          tenant.subscriptionStatus !== "cancelling"
        ) {
          // Razorpay considers the subscription active. Heal any stale DB state.
          // (Excludes "cancelling" tenants — see the dedicated branch below:
          // healing them here would silently undo a user's in-flight cancel
          // request while Razorpay's cancellation webhook is still catching up.)
          const updates: Record<string, unknown> = {};

          if (tenant.subscriptionStatus !== "active") {
            updates.subscriptionStatus = "active";
          }
          // A new cycle has started if Razorpay's expiry moved past ours —
          // that's also the signal that a scheduled ("cycle_end") plan change
          // has now taken effect on Razorpay's side. Finalize it here as a
          // fallback for a subscription.charged webhook we may have missed
          // (the primary path is handleWebhook in payment.ts).
          const newCycleStarted =
            rzpExpiry &&
            (!tenant.planExpiresAt || rzpExpiry > tenant.planExpiresAt);
          if (newCycleStarted) {
            updates.planExpiresAt = rzpExpiry;
            if (tenant.pendingPlanTier) {
              updates.planTier = tenant.pendingPlanTier;
              updates.billing = tenant.pendingBilling ?? tenant.billing;
              updates.pendingPlanTier = null;
              updates.pendingBilling = null;
              updates.pendingPlanChangeAt = null;
            }
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
