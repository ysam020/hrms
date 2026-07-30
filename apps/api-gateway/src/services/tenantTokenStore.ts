import { getRedisClient } from "@hrms/cache";

// Refresh-token storage now lives in @hrms/cache (single implementation
// shared with auth-service — see packages/cache/src/refreshTokenStore.ts).
// Previously hand-copied here with a drifted 6-param signature (no
// previousToken) that silently shifted dbName if ever called with
// auth-service's 7-param convention; re-exporting the shared function
// closes that gap instead of re-copying it a third time.
export { storeRefreshToken, markOrgSetupComplete } from "@hrms/cache";

function getClient() {
  return getRedisClient();
}

const PENDING_SUB_TTL = 7 * 24 * 60 * 60;
// Razorpay replays a webhook up to 5 times over ~24 hours; 48 h is enough
// headroom to deduplicate any duplicate delivery.
const WEBHOOK_EVENT_TTL = 48 * 60 * 60;

export async function storePendingSubscription(
  userId: string,
  subscriptionId: string,
  billing: string,
  planTier: string = "flat",
): Promise<void> {
  await getClient().setex(
    `pending_sub:${userId}`,
    PENDING_SUB_TTL,
    JSON.stringify({ subscriptionId, billing, planTier }),
  );
}

export async function getPendingSubscription(userId: string): Promise<{
  subscriptionId: string;
  billing: string;
  planTier: string;
} | null> {
  const raw = await getClient().get(`pending_sub:${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { planTier: "flat", ...parsed };
  } catch {
    return null;
  }
}

export async function clearPendingSubscription(userId: string): Promise<void> {
  await getClient().del(`pending_sub:${userId}`);
}

// ─── Change-payment-method correlation ────────────────────────────────────────
// Same-browser-session flow (start → Razorpay Checkout → confirm), not an
// abandon/resume-days-later story like the signup flow above — a short TTL
// is enough.
const PENDING_PM_CHANGE_TTL = 60 * 60; // 1h

export async function storePendingPaymentMethodChange(
  tenantId: string,
  subscriptionId: string,
): Promise<void> {
  await getClient().setex(
    `pending_pm_change:${tenantId}`,
    PENDING_PM_CHANGE_TTL,
    JSON.stringify({ subscriptionId }),
  );
}

export async function getPendingPaymentMethodChange(
  tenantId: string,
): Promise<{ subscriptionId: string } | null> {
  const raw = await getClient().get(`pending_pm_change:${tenantId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearPendingPaymentMethodChange(
  tenantId: string,
): Promise<void> {
  await getClient().del(`pending_pm_change:${tenantId}`);
}

// ─── Webhook idempotency ──────────────────────────────────────────────────────

// Atomically reserves the event ID: returns true only for the caller that
// wins the race (first to set the key). SET NX EX is a single Redis round
// trip, so two concurrent deliveries of the same event can never both win —
// unlike a separate GET-then-SETEX, which has a window where both checks
// pass before either write lands.
export async function tryReserveWebhookEvent(
  eventId: string,
): Promise<boolean> {
  const result = await getClient().set(
    `webhook_event:${eventId}`,
    "1",
    "EX",
    WEBHOOK_EVENT_TTL,
    "NX",
  );
  return result === "OK";
}

// ─── Razorpay plan ID cache (survives process restarts) ───────────────────────
// Plan IDs are permanent in Razorpay so we store with no TTL. If the key is
// ever missing (e.g. Redis flush) the handler re-creates the plan harmlessly.

export async function getRazorpayPlanId(
  billing: string,
): Promise<string | null> {
  return getClient().get(`razorpay_plan:${billing}`);
}

export async function setRazorpayPlanId(
  billing: string,
  planId: string,
): Promise<void> {
  await getClient().set(`razorpay_plan:${billing}`, planId);
}
