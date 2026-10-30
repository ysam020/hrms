import { prisma } from "@hrms/db";
import { PLATFORM_FROM, renderEmailHtml } from "@hrms/common";
import { notify } from "@hrms/notifications";
import { logger } from "@hrms/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

// Most urgent first: a trial already inside a day gets only the 1-day
// reminder, and sending it also marks the 3-day one as done, so a tenant
// never gets both on the same run.
const REMINDERS = [
  { key: "1d", within: DAY_MS, covers: ["1d", "3d"] },
  { key: "3d", within: 3 * DAY_MS, covers: ["3d"] },
] as const;

const TIER_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

// Reminds the owner of each tenant still on a free trial, 3 days and 1 day
// before its first charge. Only "trialing" tenants are considered, so a
// trial that was cancelled, or has already converted, gets nothing. Each
// reminder is claimed with a conditional update before it's queued: a
// retried or overlapping run finds it claimed and skips it, so no owner is
// emailed twice (at most once — a failed enqueue isn't retried).
export async function sendTrialReminders(): Promise<void> {
  try {
    const now = new Date();
    const tenants = await prisma.tenant.findMany({
      where: {
        subscriptionStatus: "trialing",
        planExpiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) },
      },
      select: {
        id: true,
        name: true,
        planTier: true,
        billing: true,
        planExpiresAt: true,
        paymentMethodSummary: true,
      },
    });

    let sent = 0;
    for (const tenant of tenants) {
      try {
        const remaining = tenant.planExpiresAt!.getTime() - now.getTime();
        const reminder = REMINDERS.find((r) => remaining <= r.within);
        if (!reminder) continue;

        const claimed = await prisma.tenant.updateMany({
          where: {
            id: tenant.id,
            subscriptionStatus: "trialing",
            NOT: { trialRemindersSent: { has: reminder.key } },
          },
          data: { trialRemindersSent: { push: [...reminder.covers] } },
        });
        if (claimed.count === 0) continue;

        const owner = await ownerOf(tenant.id);
        if (!owner) continue;

        const endDate = tenant.planExpiresAt!.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
        const plan = `${TIER_LABEL[tenant.planTier] ?? "Starter"} (${
          tenant.billing === "annual" ? "annual" : "monthly"
        })`;
        const via = tenant.paymentMethodSummary
          ? ` through ${escapeHtml(tenant.paymentMethodSummary)}`
          : "";
        const when = reminder.key === "1d" ? "tomorrow" : "in 3 days";

        await notify({
          tenantId: tenant.id,
          event: "trialEndingReminder",
          email: {
            to: owner.email,
            subject: `Your Praesto free trial ends ${when}`,
            html: renderEmailHtml({
              title: "Your Free Trial Is Ending",
              tenantName: tenant.name,
              // Billing relationship is with Praesto, not tenant HR.
              signature: "Praesto Team",
              bodyHtml: `<h2>Hello ${escapeHtml(owner.username)},</h2><p>The free trial for <strong>${escapeHtml(tenant.name)}</strong> ends on <strong>${endDate}</strong>. Your first payment for HRMS ${plan} will be collected then${via}, and your team keeps working without interruption.</p><p>Not continuing? Cancel from the Subscription page before ${endDate} and you won't be charged. Your organisation's data stays with us either way.</p>`,
            }),
            from: PLATFORM_FROM,
          },
        });
        sent++;
      } catch (error) {
        // One tenant's failure mustn't stop the rest of the run.
        logger.warn(`sendTrialReminders: failed for tenant ${tenant.id}`, {
          error,
        });
      }
    }

    logger.info(`sendTrialReminders: ${sent} reminder(s) queued`);
  } catch (error) {
    logger.error("Error in sendTrialReminders job:", { error });
    throw error;
  }
}

// The billing relationship is with whoever created the org (role "owner").
async function ownerOf(
  tenantId: string,
): Promise<{ email: string; username: string } | null> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId, role: "owner" },
    select: { userId: true },
  });
  if (!membership) return null;
  const user = await prisma.user.findUnique({
    where: { id: membership.userId },
    select: { email: true, username: true },
  });
  return user?.email ? { email: user.email, username: user.username } : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
