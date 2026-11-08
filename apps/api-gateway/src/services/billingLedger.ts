/**
 * Platform billing ledger (BillingPayment, master DB): a read model of
 * Razorpay subscription payments for the Platform Console. Razorpay stays
 * the source of truth and nothing here affects billing or access.
 *
 * Dedup and replay safety: one row per Razorpay payment id (unique index),
 * and every write copies the payment's *current* state fetched from
 * Razorpay (status, amount_refunded) rather than applying the event's delta.
 * A webhook delivered twice, out of order, or alongside a sync therefore
 * converges on the same row with the same values.
 *
 * What gets recorded: payments attached to a subscription invoice (renewal
 * and first charges, and failed attempts at them). The mandate
 * authorisation a trial makes at signup has no invoice and is deliberately
 * left out — it is refunded automatically and isn't revenue.
 */
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { getRazorpay } from "./razorpayClient";
import {
  PLAN_PRICING,
  type Billing,
  type PlanTier,
} from "../config/billingPlans";

const DAY_MS = 24 * 60 * 60 * 1000;
const fromUnix = (s: unknown): Date | null =>
  typeof s === "number" && s > 0 ? new Date(s * 1000) : null;

/** An invoice's billing period → monthly | annual (null if unknown). */
export function billingFromPeriod(
  start: Date | null,
  end: Date | null,
): Billing | null {
  if (!start || !end) return null;
  return end.getTime() - start.getTime() > 45 * DAY_MS ? "annual" : "monthly";
}

/** The list-price plan an amount corresponds to, or null if none matches. */
export function inferPlanTier(
  amount: number,
  billing: Billing | null,
): PlanTier | null {
  for (const [tier, prices] of Object.entries(PLAN_PRICING)) {
    if (
      billing
        ? prices[billing] === amount
        : Object.values(prices).includes(amount)
    )
      return tier as PlanTier;
  }
  return null;
}

export interface LedgerRow {
  razorpayPaymentId: string;
  tenantId: string;
  subscriptionId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  amountRefunded: number;
  refundStatus: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  planTier: string | null;
  billing: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date;
}

/** Razorpay payment (+ its invoice) → ledger row. Pure. */
export function ledgerRow(
  payment: any,
  invoice: any | null,
  tenantId: string,
  subscriptionId: string,
): LedgerRow {
  const periodStart = fromUnix(invoice?.billing_start);
  const periodEnd = fromUnix(invoice?.billing_end);
  const billing = billingFromPeriod(periodStart, periodEnd);
  const amount = Number(payment.amount) || 0;
  return {
    razorpayPaymentId: String(payment.id),
    tenantId,
    subscriptionId,
    invoiceId: invoice?.id ?? payment.invoice_id ?? null,
    amount,
    currency: String(payment.currency || "INR").toUpperCase(),
    status: String(payment.status || "created"),
    method: payment.method ?? null,
    amountRefunded: Number(payment.amount_refunded) || 0,
    refundStatus: payment.refund_status ?? null,
    errorCode: payment.error_code ?? null,
    errorDescription: payment.error_description ?? null,
    planTier: inferPlanTier(amount, billing),
    billing,
    periodStart,
    periodEnd,
    paidAt: fromUnix(payment.created_at) ?? new Date(),
  };
}

const isDuplicateKey = (err: any) =>
  err?.code === "P2002" || /E11000|duplicate key/i.test(String(err?.message));

export async function upsertLedgerRow(row: LedgerRow): Promise<void> {
  const { razorpayPaymentId, ...rest } = row;
  const data = { ...rest, syncedAt: new Date() };
  try {
    await prisma.billingPayment.upsert({
      where: { razorpayPaymentId },
      create: { razorpayPaymentId, ...data },
      update: data,
    });
  } catch (err) {
    // Two writers creating the same payment at once: the loser updates.
    if (!isDuplicateKey(err)) throw err;
    await prisma.billingPayment.update({ where: { razorpayPaymentId }, data });
  }
}

async function tenantForSubscription(subscriptionId: string) {
  return prisma.tenant.findFirst({
    where: {
      OR: [
        { razorpaySubscriptionId: subscriptionId },
        { previousRazorpaySubscriptionId: subscriptionId },
      ],
    },
    select: { id: true },
  });
}

/**
 * Record one payment from Razorpay's current view of it. Skips payments
 * that belong to no subscription invoice, or to a subscription no tenant
 * holds. Returns whether a row was written.
 */
export async function recordPayment(
  paymentId: string,
  known: { invoice?: any; tenantId?: string; subscriptionId?: string } = {},
): Promise<boolean> {
  const rzp = getRazorpay();
  const payment = await (rzp.payments.fetch as any)(paymentId);
  const invoiceId = known.invoice?.id ?? payment?.invoice_id;
  if (!invoiceId) return false;
  const invoice =
    known.invoice ?? (await (rzp.invoices.fetch as any)(invoiceId));
  const subscriptionId = known.subscriptionId ?? invoice?.subscription_id;
  if (!subscriptionId) return false;
  const tenantId =
    known.tenantId ?? (await tenantForSubscription(subscriptionId))?.id;
  if (!tenantId) return false;
  await upsertLedgerRow(ledgerRow(payment, invoice, tenantId, subscriptionId));
  return true;
}

/**
 * Pull a subscription's invoices and record their payments (all of them, or
 * only invoices created in the last `sinceDays` — the reconciler's routine
 * pass, which catches late refunds without re-fetching years of history).
 * Invoices that were never paid carry no payment id; failed attempts at
 * them are recorded from the payment.failed webhook instead.
 */
export async function syncSubscriptionLedger(
  tenantId: string,
  subscriptionId: string,
  { sinceDays }: { sinceDays?: number } = {},
): Promise<number> {
  const since = sinceDays ? Date.now() / 1000 - sinceDays * 86_400 : 0;
  const rzp = getRazorpay();
  let written = 0;
  for (let skip = 0; ; skip += 100) {
    const page = await (rzp.invoices.all as any)({
      subscription_id: subscriptionId,
      count: 100,
      skip,
    });
    const items: any[] = page?.items ?? [];
    for (const invoice of items) {
      if (!invoice?.payment_id) continue;
      if (since && Number(invoice.created_at) < since) continue;
      if (
        await recordPayment(invoice.payment_id, {
          invoice,
          tenantId,
          subscriptionId,
        })
      )
        written++;
    }
    if (items.length < 100) break;
  }
  return written;
}

/** Sync a tenant's current and (if still known) previous subscription. */
export async function syncTenantLedger(
  tenant: {
    id: string;
    razorpaySubscriptionId?: string | null;
    previousRazorpaySubscriptionId?: string | null;
  },
  options: { sinceDays?: number } = {},
): Promise<number> {
  let written = 0;
  for (const sub of new Set(
    [
      tenant.razorpaySubscriptionId,
      tenant.previousRazorpaySubscriptionId,
    ].filter(Boolean) as string[],
  )) {
    written += await syncSubscriptionLedger(tenant.id, sub, options);
  }
  return written;
}

const LEDGER_EVENTS = new Set([
  "subscription.charged",
  "payment.failed",
  "payment.captured",
  "refund.created",
  "refund.processed",
]);

/**
 * Webhook hook (best effort — the reconciler's sync heals anything missed).
 * Called for every verified, de-duplicated event; ignores the rest.
 */
export async function recordWebhookPayment(
  event: string,
  payload: any,
): Promise<void> {
  if (!LEDGER_EVENTS.has(event)) return;
  const paymentId =
    payload?.payment?.entity?.id ?? payload?.refund?.entity?.payment_id;
  if (!paymentId) return;
  try {
    await recordPayment(String(paymentId), {
      subscriptionId: payload?.subscription?.entity?.id,
    });
  } catch (err) {
    logger.warn(`Billing ledger: couldn't record ${event} for ${paymentId}`, {
      err,
    });
  }
}
