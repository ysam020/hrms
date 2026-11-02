/**
 * Praesto Platform Console — metric definitions. Pure functions over rows
 * the handlers load (handlers/platformAdmin.ts), so every formula below is
 * unit-tested in isolation and documented in one place
 * (docs/platform-admin.md mirrors these comments).
 *
 * Conventions:
 *  - Money is integer minor units (paise) and is never summed across
 *    currencies: totals are keyed by currency.
 *  - Calendar buckets (day/week/month) are in India Standard Time, the
 *    business's billing timezone; range boundaries are instants.
 *  - "Customers" are every tenant except Praesto's own organisation.
 */
import {
  monthlyEquivalentPaise,
  type Billing,
  type PlanTier,
} from "../config/billingPlans";
import {
  decideAccess,
  type TenantSubscription,
} from "../middleware/requireActiveSubscription";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// ── Date ranges ─────────────────────────────────────────────────────────────

export const RANGE_PRESETS = ["30d", "90d", "12m", "ytd", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type Bucket = "day" | "week" | "month";

export interface DateRange {
  from: Date;
  to: Date;
  /** The equivalent period immediately before, for growth comparisons. */
  prevFrom: Date;
  prevTo: Date;
  bucket: Bucket;
}

/** Midnight IST of the calendar day containing `d`, as an instant. */
export function istDayStart(d: Date): Date {
  const local = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      IST_OFFSET_MS,
  );
}

/** "YYYY-MM-DD" read as an IST calendar day → its first instant. */
export function istDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

function bucketFor(from: Date, to: Date): Bucket {
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  return days <= 31 ? "day" : days <= 120 ? "week" : "month";
}

/**
 * A preset (or explicit IST from/to dates, `to` inclusive) → an instant
 * range [from, to) plus the previous equivalent period. `all` starts at the
 * first customer's registration (`earliest`).
 */
export function resolveRange(
  q: { range?: RangePreset; from?: string; to?: string },
  now: Date,
  earliest: Date | null,
): DateRange {
  let from: Date;
  let to = now;
  if (q.from && q.to) {
    from = istDate(q.from);
    to = new Date(istDate(q.to).getTime() + DAY_MS);
  } else {
    const today = istDayStart(now);
    switch (q.range ?? "90d") {
      case "30d":
        from = new Date(today.getTime() - 29 * DAY_MS);
        break;
      case "12m": {
        const l = new Date(today.getTime() + IST_OFFSET_MS);
        from = new Date(
          Date.UTC(l.getUTCFullYear() - 1, l.getUTCMonth() + 1, 1) -
            IST_OFFSET_MS,
        );
        break;
      }
      case "ytd": {
        const l = new Date(today.getTime() + IST_OFFSET_MS);
        from = new Date(Date.UTC(l.getUTCFullYear(), 0, 1) - IST_OFFSET_MS);
        break;
      }
      case "all":
        from = istDayStart(earliest ?? now);
        break;
      default:
        from = new Date(today.getTime() - 89 * DAY_MS);
    }
  }
  const span = to.getTime() - from.getTime();
  return {
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    bucket: bucketFor(from, to),
  };
}

/** Bucket key for an instant: "2026-11-02", week-of "2026-10-27", "2026-11". */
export function bucketKey(d: Date, bucket: Bucket): string {
  const l = new Date(d.getTime() + IST_OFFSET_MS);
  if (bucket === "month") return l.toISOString().slice(0, 7);
  if (bucket === "week") {
    const dow = (l.getUTCDay() + 6) % 7; // Monday-based
    return new Date(l.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
  }
  return l.toISOString().slice(0, 10);
}

/** Every bucket key in [from, to), in order — so empty periods show as 0. */
export function bucketKeys(range: Pick<DateRange, "from" | "to" | "bucket">) {
  const keys: string[] = [];
  const step = range.bucket === "week" ? 7 * DAY_MS : DAY_MS;
  for (let t = range.from.getTime(); t < range.to.getTime(); t += step) {
    const k = bucketKey(new Date(t), range.bucket);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

export function series<T>(
  rows: T[],
  range: Pick<DateRange, "from" | "to" | "bucket">,
  at: (r: T) => Date | null | undefined,
  value: (r: T) => number = () => 1,
): { key: string; value: number }[] {
  const totals = new Map(bucketKeys(range).map((k) => [k, 0]));
  for (const r of rows) {
    const d = at(r);
    if (!d || d < range.from || d >= range.to) continue;
    const k = bucketKey(d, range.bucket);
    if (totals.has(k)) totals.set(k, totals.get(k)! + value(r));
  }
  return [...totals].map(([key, v]) => ({ key, value: v }));
}

const inRange = (d: Date | null | undefined, from: Date, to: Date) =>
  !!d && d >= from && d < to;

/** Percentage change, or null when there's no base to compare with. */
export const growth = (current: number, previous: number): number | null =>
  previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;

// ── Tenants and subscriptions ───────────────────────────────────────────────

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  isActive: boolean;
  subscriptionStatus: string | null;
  planTier: string | null;
  billing: string | null;
  planActivatedAt: Date | null;
  planExpiresAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  razorpaySubscriptionId: string | null;
  pendingPlanTier?: string | null;
  pendingBilling?: string | null;
}

export const tierOf = (t: { planTier: string | null }): PlanTier =>
  t.planTier === "growth" || t.planTier === "enterprise"
    ? t.planTier
    : "starter";
export const billingOf = (t: { billing: string | null }): Billing =>
  t.billing === "annual" ? "annual" : "monthly";

/**
 * A tenant has paid at least once: a Razorpay subscription whose first real
 * charge landed (planActivatedAt is null until then — a trial isn't one).
 */
export const hasPaid = (t: TenantRow) =>
  !!t.razorpaySubscriptionId && !!t.planActivatedAt;

/**
 * Paying now: status "active" and has paid. These are the tenants MRR
 * counts. "grace_period" (renewal failed, Razorpay retrying) is reported
 * separately as at-risk, and "cancelled" ones still inside their paid
 * period as non-renewing — neither is recurring revenue any more.
 */
export const isPaying = (t: TenantRow) =>
  t.subscriptionStatus === "active" && hasPaid(t);

/** Same rule requireActiveSubscription enforces on every request. */
export const hasAccess = (t: TenantRow) =>
  decideAccess(t as unknown as TenantSubscription).allowed;

/** Recurring monthly value at list price (annual plans ÷ 12), in paise. */
export const monthlyValuePaise = (t: TenantRow) =>
  monthlyEquivalentPaise(tierOf(t), billingOf(t));

export interface MrrSummary {
  currency: "INR";
  /** Σ monthly value of paying tenants. */
  mrr: number;
  arr: number;
  payingTenants: number;
  fromMonthly: number;
  fromAnnual: number;
  /** grace_period tenants that had paid. */
  atRisk: number;
  /** cancelled, still inside the paid period. */
  nonRenewing: number;
}

/**
 * Run-rate MRR from current subscription state at list price
 * (billingPlans.ts; the code has no discounts or coupons). ARR = MRR × 12.
 * Not cash: see collections() for money actually received.
 */
export function mrrSummary(tenants: TenantRow[], now: Date): MrrSummary {
  const s: MrrSummary = {
    currency: "INR",
    mrr: 0,
    arr: 0,
    payingTenants: 0,
    fromMonthly: 0,
    fromAnnual: 0,
    atRisk: 0,
    nonRenewing: 0,
  };
  for (const t of tenants) {
    const v = monthlyValuePaise(t);
    if (isPaying(t)) {
      s.mrr += v;
      s.payingTenants++;
      if (billingOf(t) === "annual") s.fromAnnual += v;
      else s.fromMonthly += v;
    } else if (t.subscriptionStatus === "grace_period" && hasPaid(t)) {
      s.atRisk += v;
    } else if (
      t.subscriptionStatus === "cancelled" &&
      hasPaid(t) &&
      t.planExpiresAt &&
      t.planExpiresAt > now
    ) {
      s.nonRenewing += v;
    }
  }
  s.mrr = Math.round(s.mrr);
  s.fromMonthly = Math.round(s.fromMonthly);
  s.fromAnnual = Math.round(s.fromAnnual);
  s.atRisk = Math.round(s.atRisk);
  s.nonRenewing = Math.round(s.nonRenewing);
  s.arr = s.mrr * 12;
  return s;
}

/** Lifecycle labels the console shows — the tenant's stored status, as is. */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "grace_period",
  "cancelled",
  "cancelling",
  "expired",
] as const;

export function subscriptionCounts(tenants: TenantRow[], now: Date) {
  const in30 = new Date(now.getTime() + 30 * DAY_MS);
  const in7 = new Date(now.getTime() + 7 * DAY_MS);
  const byStatus: Record<string, number> = {};
  const byPlan: Record<string, number> = {};
  const byBilling: Record<string, number> = { monthly: 0, annual: 0 };
  let renewingSoon = 0;
  let endingSoon = 0;
  let trialsEndingSoon = 0;
  for (const t of tenants) {
    const st = t.subscriptionStatus ?? "unknown";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    if (isPaying(t)) {
      byPlan[tierOf(t)] = (byPlan[tierOf(t)] ?? 0) + 1;
      byBilling[billingOf(t)]++;
      if (inRange(t.planExpiresAt, now, in30)) renewingSoon++;
    }
    if (st === "cancelled" && inRange(t.planExpiresAt, now, in30)) endingSoon++;
    if (st === "trialing" && inRange(t.trialEndsAt, now, in7))
      trialsEndingSoon++;
  }
  return {
    byStatus,
    /** Paying tenants by plan / billing period. */
    byPlan,
    byBilling,
    paying: tenants.filter(isPaying).length,
    trialing: byStatus.trialing ?? 0,
    pastDue: byStatus.grace_period ?? 0,
    cancelled: (byStatus.cancelled ?? 0) + (byStatus.cancelling ?? 0),
    expired: byStatus.expired ?? 0,
    /** Paying tenants whose current period ends in the next 30 days. */
    renewingSoon,
    /** Cancelled tenants whose access ends in the next 30 days. */
    endingSoon,
    /** Trials ending in the next 7 days. */
    trialsEndingSoon,
  };
}

/**
 * Trial conversion, measured on trials that *ended* in the window (their
 * trialEndsAt fell in [from, min(to, now))): converted = the first charge
 * landed (planActivatedAt set). Trials still running aren't in the
 * denominator, so an in-progress cohort can't drag the rate down.
 */
export function trialConversion(
  tenants: TenantRow[],
  from: Date,
  to: Date,
  now: Date,
) {
  const end = to < now ? to : now;
  const ended = tenants.filter(
    (t) => t.trialStartedAt && inRange(t.trialEndsAt, from, end),
  );
  const converted = ended.filter((t) => !!t.planActivatedAt);
  return {
    started: tenants.filter((t) => inRange(t.trialStartedAt, from, to)).length,
    ended: ended.length,
    converted: converted.length,
    expiredUnconverted: ended.length - converted.length,
    rate: ended.length ? converted.length / ended.length : null,
    /** First charges in the window from tenants that began on a trial. */
    recentConversions: tenants
      .filter((t) => t.trialStartedAt && inRange(t.planActivatedAt, from, to))
      .sort((a, b) => +b.planActivatedAt! - +a.planActivatedAt!)
      .slice(0, 5)
      .map((t) => ({ id: t.id, name: t.name, at: t.planActivatedAt })),
  };
}

// ── Payments (billing ledger) ───────────────────────────────────────────────

export interface PaymentRow {
  tenantId: string;
  amount: number;
  currency: string;
  status: string;
  amountRefunded: number;
  planTier: string | null;
  billing: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date;
}

/** Money was received: captured, including ones later refunded. */
export const isSuccessful = (p: PaymentRow) =>
  p.status === "captured" || p.status === "refunded";
/** Attempted, not (yet) captured. */
export const isPending = (p: PaymentRow) =>
  p.status === "created" || p.status === "authorized";

export interface CurrencyTotals {
  gross: number;
  refunds: number;
  net: number;
  successful: number;
  failed: number;
  refunded: number;
  pending: number;
}

/**
 * Cash collected per currency. Gross = Σ amount of successful payments;
 * refunds = Σ amount_refunded on them (Razorpay's running total on the
 * payment itself, so a refund is counted once however many refund events
 * arrive); net = gross − refunds. Failed and pending payments add nothing.
 * Each ledger row is one Razorpay payment id, so retries can't duplicate.
 */
export function collections(payments: PaymentRow[]) {
  const by: Record<string, CurrencyTotals> = {};
  for (const p of payments) {
    const c = (by[p.currency] ??= {
      gross: 0,
      refunds: 0,
      net: 0,
      successful: 0,
      failed: 0,
      refunded: 0,
      pending: 0,
    });
    if (isSuccessful(p)) {
      c.gross += p.amount;
      c.refunds += Math.min(p.amountRefunded, p.amount);
      c.successful++;
      if (p.amountRefunded > 0) c.refunded++;
    } else if (p.status === "failed") c.failed++;
    else if (isPending(p)) c.pending++;
  }
  for (const c of Object.values(by)) c.net = c.gross - c.refunds;
  return by;
}

/** Net collected by a key (plan, billing, month), per currency. */
export function netBy(
  payments: PaymentRow[],
  key: (p: PaymentRow) => string,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const p of payments) {
    if (!isSuccessful(p)) continue;
    const c = (out[p.currency] ??= {});
    const k = key(p);
    c[k] = (c[k] ?? 0) + p.amount - Math.min(p.amountRefunded, p.amount);
  }
  return out;
}

/**
 * Billed MRR at an instant, from the ledger: every successful payment whose
 * invoice period covers the instant contributes its net amount ÷ the
 * period's months (12 for annual, else 1). Historical by construction —
 * it only uses what was actually charged for that time — so it's the series
 * for MRR trends and month-on-month growth. Payments without a recorded
 * period are left out.
 */
export function billedMrrAt(
  payments: PaymentRow[],
  at: Date,
  currency = "INR",
) {
  let total = 0;
  for (const p of payments) {
    if (!isSuccessful(p) || p.currency !== currency) continue;
    if (!p.periodStart || !p.periodEnd) continue;
    if (!(p.periodStart <= at && at < p.periodEnd)) continue;
    const net = p.amount - Math.min(p.amountRefunded, p.amount);
    total += net / (p.billing === "annual" ? 12 : 1);
  }
  return Math.round(total);
}

/** Average net collected per tenant that paid in the window, per currency. */
export function arpa(payments: PaymentRow[]) {
  const out: Record<string, number> = {};
  const tenants: Record<string, Set<string>> = {};
  for (const p of payments) {
    if (!isSuccessful(p)) continue;
    (tenants[p.currency] ??= new Set()).add(p.tenantId);
  }
  for (const [cur, totals] of Object.entries(collections(payments))) {
    const n = tenants[cur]?.size ?? 0;
    out[cur] = n ? Math.round(totals.net / n) : 0;
  }
  return out;
}
