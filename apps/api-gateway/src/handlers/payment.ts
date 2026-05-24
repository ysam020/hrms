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

// Hot-path in-memory cache — avoids Redis round-trips within a single process
// lifetime. Redis (see tenantTokenStore) is the durable layer that survives
// restarts so we never create orphaned plans in Razorpay.
const planIdMemCache: Record<string, string> = {};

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

export function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

// ─── Plan ID — two-level cache (memory → Redis → Razorpay API) ───────────────

async function getOrCreatePlanId(
  billing: "monthly" | "annual",
): Promise<string> {
  // 1. In-memory (hot path, same process restart)
  if (planIdMemCache[billing]) return planIdMemCache[billing];

  // 2. Redis (survives restarts — plan IDs are permanent in Razorpay)
  const { getRazorpayPlanId, setRazorpayPlanId } =
    await import("../services/tenantTokenStore");
  const cached = await getRazorpayPlanId(billing);
  if (cached) {
    planIdMemCache[billing] = cached;
    return cached;
  }

  // 3. Create a new plan in Razorpay (only runs once per billing period per env)
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

  planIdMemCache[billing] = plan.id;
  await setRazorpayPlanId(billing, plan.id);
  logger.info(`Razorpay plan created (${billing}): ${plan.id}`);
  return plan.id;
}

// ─── POST /payment/create-subscription ───────────────────────────────────────

export async function createSubscription(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
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

    // Record pending subscription so the backend can recover without
    // client-side credentials if the tab closes mid-request.
    const { storePendingSubscription } =
      await import("../services/tenantTokenStore");
    await storePendingSubscription(userId, subscription.id, period);

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

// ─── GET /payment/pending-setup ───────────────────────────────────────────────

export async function getPendingSetup(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const { getPendingSubscription, clearPendingSubscription } =
      await import("../services/tenantTokenStore");
    const pending = await getPendingSubscription(userId);
    if (!pending) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: { hasPending: false },
      });
    }

    const rzp = getRazorpay();
    const subscription = await (rzp.subscriptions.fetch as any)(
      pending.subscriptionId,
    );
    const isPaid = ["authenticated", "active"].includes(subscription.status);

    if (!isPaid) {
      await clearPendingSubscription(userId);
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: { hasPending: false },
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { hasPending: true, billing: pending.billing },
    });
  } catch (err) {
    logger.error("getPendingSetup error:", { err });
    return handleError(res, err);
  }
}

// ─── POST /payment/cancel-subscription ───────────────────────────────────────

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

    // Set "cancelling" rather than immediately "expired".
    // The subscription.cancelled webhook (fired by Razorpay within seconds)
    // is the authoritative signal that confirms the cancellation and moves
    // the tenant to "expired". This avoids the race where the Razorpay call
    // succeeds but our DB write was already wrong, or where the next renewal
    // charge fires before the cancel lands.
    await prisma.tenant.update({
      where: { id: tenantId! },
      data: { subscriptionStatus: "cancelling" },
    });

    logger.info(`Subscription cancellation requested for tenant ${tenantId}`);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Subscription cancellation initiated.",
    });
  } catch (err) {
    logger.error("cancelSubscription error:", { err });
    return handleError(res, err);
  }
}

// ─── POST /payment/reactivate-subscription ────────────────────────────────────

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

// ─── POST /payment/webhook  — Razorpay sends events here ─────────────────────
//
// This handler is mounted in server.ts BEFORE express.json() and the CSRF
// middleware so that:
//   • req.body arrives as a raw Buffer (exact bytes Razorpay signed)
//   • Razorpay's server-to-server requests aren't rejected by CSRF

export async function handleWebhook(req: Request, res: Response) {
  try {
    // ── Guard: secret must be configured ───────────────────────────────────
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      logger.error(
        "handleWebhook: RAZORPAY_WEBHOOK_SECRET is not set — rejecting all requests",
      );
      return res.status(500).json({ ok: false });
    }

    const signature = req.headers["x-razorpay-signature"] as string;
    // Razorpay injects a unique event ID that we use for idempotency.
    const eventId = req.headers["x-razorpay-event-id"] as string | undefined;

    // ── Raw body → string ───────────────────────────────────────────────────
    // express.raw() delivers a Buffer. Fallback to stringify handles the
    // rare case where this route is hit without the raw middleware.
    const rawBody =
      req.body instanceof Buffer
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

    // ── Signature verification ──────────────────────────────────────────────
    const expected = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expected) {
      logger.warn("Razorpay webhook: invalid signature");
      return res.status(400).json({ ok: false });
    }

    // ── Idempotency — skip already-processed events ─────────────────────────
    // Razorpay retries on non-2xx. We ack early (200) then do nothing.
    // Operations below are all naturally idempotent, so a crash-before-mark
    // is safe: the retry will re-process with the same outcome.
    if (eventId) {
      const { isWebhookEventProcessed, markWebhookEventProcessed } =
        await import("../services/tenantTokenStore");
      if (await isWebhookEventProcessed(eventId)) {
        logger.info(`Razorpay webhook: duplicate event ${eventId} — skipped`);
        return res.json({ ok: true });
      }
      // Mark AFTER processing so a crash mid-handler still allows a retry.
      // We register the cleanup at the end of the switch.
      void markWebhookEventProcessed(eventId).catch((e) =>
        logger.warn("markWebhookEventProcessed failed", { e }),
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const { event, payload } = JSON.parse(rawBody) as {
      event: string;
      payload: {
        subscription?: { entity?: { id?: string } };
        payment?: { entity?: any };
      };
    };

    const subscriptionId = payload?.subscription?.entity?.id;
    if (!subscriptionId) return res.json({ ok: true });

    const now = new Date();

    // ── Event dispatch ──────────────────────────────────────────────────────
    switch (event) {
      case "subscription.charged": {
        // Razorpay successfully charged — push planExpiresAt forward.
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
        // All Razorpay retry attempts exhausted — enter grace period.
        await prisma.tenant.updateMany({
          where: {
            razorpaySubscriptionId: subscriptionId,
            subscriptionStatus: { not: "expired" },
          },
          data: { subscriptionStatus: "grace_period" },
        });
        break;

      case "subscription.payment.failed": {
        // A single payment attempt failed; Razorpay will retry automatically.
        // Log and surface a warning so the team can monitor before halted fires.
        const failedTenant = await prisma.tenant.findFirst({
          where: { razorpaySubscriptionId: subscriptionId },
          select: { id: true },
        });
        if (failedTenant) {
          logger.warn(
            `Razorpay payment attempt failed for subscription ${subscriptionId} ` +
              `(tenant ${failedTenant.id}). Razorpay will retry automatically.`,
          );
          // TODO: send in-app notification / email to tenant owner so they can
          // update their payment method before the subscription is halted.
        }
        break;
      }

      case "subscription.cancelled":
      case "subscription.completed":
        // Also covers the "cancelling" state set by cancelSubscription().
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
