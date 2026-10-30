// Free-trial rules — the one place the gateway reads them from. The web app
// gets the trial length from GET /payment/trial-eligibility rather than
// mirroring it, so changing TRIAL_DAYS needs no frontend release.
//
// A trial is a normal Razorpay subscription whose first charge is deferred
// by start_at: the mandate is authorised at signup, nothing is charged until
// the trial ends, and the subscription.charged webhook then turns the tenant
// "active" (see handlers/payment.ts). Grace and expiry after a failed first
// charge are the paid flow's own (scheduler-service checkSubscriptionExpiry).

function intFromEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
}

export const TRIAL_DAYS = intFromEnv("TRIAL_DAYS", 14, 1, 90);

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

// Razorpay notes on a trial-signup subscription. Written only by
// createSubscription; buildTenant trusts a future start_at as a trial only
// when these match the signing-up user, so no other deferred subscription
// (e.g. a payment-method swap's) can be replayed into a free trial.
export const TRIAL_SIGNUP_PURPOSE = "trial_signup";

// A start_at further out than this can't have come from createSubscription.
export const MAX_TRIAL_START_DRIFT_MS = DAY_MS;

// Same 7 days as the paid flow's grace (GRACE_PERIOD_MS in scheduler-service
// checkSubscriptionExpiry): a trial whose first charge hasn't landed keeps
// access this long past its end before requireActiveSubscription blocks it.
export const TRIAL_GRACE_MS = 7 * DAY_MS;
