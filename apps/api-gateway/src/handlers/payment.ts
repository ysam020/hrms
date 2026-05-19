import { Request, Response } from "express";
import Razorpay from "razorpay";
import { createHmac } from "crypto";
import { prisma } from "@hrms/db";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";

// ₹999/month · ₹9,999/year (in paise)
const BILLING_CONFIG = {
  monthly: {
    amount: 99900,
    period: "monthly" as const,
    interval: 1,
    totalCount: 120,
  },
  annual: {
    amount: 999900,
    period: "yearly" as const,
    interval: 1,
    totalCount: 10,
  },
} as const;

// Module-level plan-ID cache — survives for the container's lifetime.
// On restart, we re-create plans in Razorpay (harmless in test mode).
const planIdCache: Record<string, string> = {};

// ─── Payment-method helpers ───────────────────────────────────────────────────

interface PaymentMethodInfo {
  method: string;
  summary: string;
}

function extractPaymentMethodFromEntity(p: any): PaymentMethodInfo {
  const method: string = p.method ?? "unknown";
  let summary = method;

  if (method === "card" && p.card) {
    const network = p.card.network ?? "";
    const last4 = p.card.last4 ?? "";
    summary = [network, last4 ? `•••• ${last4}` : ""].filter(Boolean).join(" ");
  } else if (method === "upi") {
    summary = p.vpa ?? "UPI";
  } else if (method === "netbanking") {
    summary = p.bank_name ?? p.bank ?? "Net Banking";
  } else if (method === "emandate" || method === "nach") {
    summary = p.bank_name ?? p.bank ?? "e-Mandate";
  } else if (method === "wallet") {
    summary = p.wallet ?? "Wallet";
  }

  return { method, summary };
}

export async function fetchPaymentMethod(
  paymentId: string,
): Promise<PaymentMethodInfo | null> {
  try {
    const rzp = getRazorpay();
    const payment = await (rzp.payments.fetch as any)(paymentId);
    return extractPaymentMethodFromEntity(payment);
  } catch (err) {
    logger.warn(`fetchPaymentMethod: could not fetch payment ${paymentId}`, {
      err,
    });
    return null;
  }
}

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

async function getOrCreatePlanId(
  billing: "monthly" | "annual",
): Promise<string> {
  if (planIdCache[billing]) return planIdCache[billing];

  const cfg = BILLING_CONFIG[billing];
  const rzp = getRazorpay();

  const plan = await (rzp.plans.create as any)({
    period: cfg.period,
    interval: cfg.interval,
    item: {
      name: billing === "monthly" ? "HRMS Pro – Monthly" : "HRMS Pro – Annual",
      amount: cfg.amount,
      unit_amount: cfg.amount,
      currency: "INR",
    },
  });

  planIdCache[billing] = plan.id;
  logger.info(`Razorpay plan created (${billing}): ${plan.id}`);
  return plan.id;
}

// POST /payment/create-subscription
export async function createSubscription(req: AuthRequest, res: Response) {
  try {
    const { billing } = req.body as { billing?: "monthly" | "annual" };
    const period = billing === "annual" ? "annual" : "monthly";
    const cfg = BILLING_CONFIG[period];

    const planId = await getOrCreatePlanId(period);
    const rzp = getRazorpay();

    const subscription = await (rzp.subscriptions.create as any)({
      plan_id: planId,
      customer_notify: 1,
      total_count: cfg.totalCount,
      quantity: 1,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        subscriptionId: subscription.id,
        keyId: process.env.RAZORPAY_KEY_ID,
        billing: period,
      },
    });
  } catch (err) {
    logger.error("createSubscription error:", { err });
    return handleError(res, err);
  }
}

// POST /payment/cancel-subscription
export async function cancelSubscription(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { razorpaySubscriptionId: true, subscriptionStatus: true },
    });
    if (!tenant?.razorpaySubscriptionId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No subscription found.",
      });
    }
    if (!["active", "grace_period"].includes(tenant.subscriptionStatus ?? "")) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Subscription is not active.",
      });
    }

    const rzp = getRazorpay();
    await (rzp.subscriptions.cancel as any)(tenant.razorpaySubscriptionId, {
      cancel_at_cycle_end: 0,
    });

    await prisma.tenant.update({
      where: { id: tenantId! },
      data: { subscriptionStatus: "expired" },
    });

    logger.info(`Subscription cancelled for tenant ${tenantId}`);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Subscription cancelled.",
    });
  } catch (err) {
    logger.error("cancelSubscription error:", { err });
    return handleError(res, err);
  }
}

// POST /payment/reactivate-subscription — renew after expiry
export async function reactivateSubscription(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  try {
    const {
      billing,
      razorpayPaymentId,
      razorpaySubscriptionId,
      razorpaySignature,
    } = req.body as {
      billing?: string;
      razorpayPaymentId?: string;
      razorpaySubscriptionId?: string;
      razorpaySignature?: string;
    };

    if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment details are required.",
      });
    }

    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
      .digest("hex");
    if (expected !== razorpaySignature) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment verification failed.",
      });
    }

    const now = new Date();
    const planExpiresAt = new Date(now);
    if (billing === "annual") {
      planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);
    } else {
      planExpiresAt.setMonth(planExpiresAt.getMonth() + 1);
    }

    const pmInfo = await fetchPaymentMethod(razorpayPaymentId);

    await prisma.tenant.update({
      where: { id: tenantId! },
      data: {
        razorpaySubscriptionId,
        billing: billing ?? "monthly",
        subscriptionStatus: "active",
        planActivatedAt: now,
        planExpiresAt,
        ...(pmInfo && {
          paymentMethod: pmInfo.method,
          paymentMethodSummary: pmInfo.summary,
        }),
      },
    });

    logger.info(`Subscription reactivated for tenant ${tenantId}`);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Subscription reactivated.",
    });
  } catch (err) {
    logger.error("reactivateSubscription error:", { err });
    return handleError(res, err);
  }
}

// POST /payment/webhook  — Razorpay sends events here
export async function handleWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    const expected = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    if (signature !== expected) {
      logger.warn("Razorpay webhook: invalid signature");
      return res.status(400).json({ ok: false });
    }

    const { event, payload } = req.body as {
      event: string;
      payload: {
        subscription?: { entity?: { id?: string } };
        payment?: { entity?: any };
      };
    };

    const subscriptionId = payload?.subscription?.entity?.id;
    if (!subscriptionId) return res.json({ ok: true });

    const now = new Date();
    const GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    switch (event) {
      case "subscription.charged": {
        // Razorpay successfully charged — push planExpiresAt forward
        const tenant = await prisma.tenant.findFirst({
          where: { razorpaySubscriptionId: subscriptionId },
        });
        if (tenant) {
          const base =
            tenant.planExpiresAt && tenant.planExpiresAt > now
              ? tenant.planExpiresAt
              : now;
          const billing = tenant.billing === "annual" ? "annual" : "monthly";
          const next = new Date(base);
          billing === "annual"
            ? next.setFullYear(next.getFullYear() + 1)
            : next.setMonth(next.getMonth() + 1);

          // Extract payment method from webhook payload (free — no extra API call)
          const pmEntity = payload.payment?.entity;
          const pmInfo = pmEntity
            ? extractPaymentMethodFromEntity(pmEntity)
            : null;

          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionStatus: "active",
              planExpiresAt: next,
              ...(pmInfo && {
                paymentMethod: pmInfo.method,
                paymentMethodSummary: pmInfo.summary,
              }),
            },
          });
        }
        break;
      }

      case "subscription.halted":
        // All Razorpay retry attempts failed — enter grace period
        await prisma.tenant.updateMany({
          where: {
            razorpaySubscriptionId: subscriptionId,
            subscriptionStatus: { not: "expired" },
          },
          data: { subscriptionStatus: "grace_period" },
        });
        break;

      case "subscription.cancelled":
      case "subscription.completed":
        await prisma.tenant.updateMany({
          where: { razorpaySubscriptionId: subscriptionId },
          data: { subscriptionStatus: "expired" },
        });
        break;
    }

    logger.info(
      `Razorpay webhook processed: ${event} for subscription ${subscriptionId}`,
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error("handleWebhook error:", { err });
    return res.status(500).json({ ok: false });
  }
}
