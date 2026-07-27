import { Request, Response } from "express";
import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@hrms/db";
import { AuthRequest } from "../middleware/authenticate";
import {
  apiResponse,
  RESPONSE_STATUS,
  PLATFORM_FROM,
  renderEmailHtml,
} from "@hrms/common";
import { notify } from "@hrms/notifications";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { buildInvoicePdf } from "./invoice";
import {
  PLAN_PRICING,
  TIER_EMPLOYEE_LIMITS,
  amountPaise,
  monthlyEquivalentPaise,
  type PlanTier,
  type Billing,
} from "../config/billingPlans";
import { getActiveEmployeeCount, getSeatStatus } from "../utils/planLimits";

function isPlanTier(v: unknown): v is PlanTier {
  return v === "starter" || v === "growth" || v === "enterprise";
}

const TIER_LABEL: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

// Resolves the tenant owner's email — the billing relationship is with
// whoever created the org (TenantMembership role "owner"), not necessarily
// whoever is logged in when a webhook fires.
async function getTenantOwnerEmail(
  tenantId: string,
): Promise<{ email: string; username: string } | null> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId, role: "owner" },
    select: { userId: true },
  });
  if (!membership) return null;
  const owner = await prisma.user.findUnique({
    where: { id: membership.userId },
    select: { email: true, username: true },
  });
  if (!owner?.email) return null;
  return { email: owner.email, username: owner.username };
}

// Razorpay wants a subscription's total renewal count up front; 120 months
// (10 years) for monthly, 10 years for annual — effectively "until cancelled".
function totalCountFor(billing: Billing): number {
  return billing === "annual" ? 10 : 120;
}

// Hot-path in-memory cache — avoids Redis round-trips within a single process
// lifetime. Redis (see tenantTokenStore) is the durable layer that survives
// restarts so we never create orphaned plans in Razorpay. Keyed by
// "<tier>:<billing>" since each (tier, billing) pair is its own flat-fee
// Razorpay Plan — quantity is always 1 (there's no per-employee multiplier;
// three fixed-price slabs by headcount, not per-seat billing).
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
  } catch (error: unknown) {
    logger.warn(`fetchPaymentMethod: could not fetch payment ${paymentId}`, {
      error,
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
  tier: PlanTier,
  billing: Billing,
): Promise<string> {
  const cacheKey = `${tier}:${billing}`;

  // 1. In-memory (hot path, same process restart)
  if (planIdMemCache[cacheKey]) return planIdMemCache[cacheKey];

  // 2. Redis (survives restarts — plan IDs are permanent in Razorpay)
  const { getRazorpayPlanId, setRazorpayPlanId } =
    await import("../services/tenantTokenStore");
  const cached = await getRazorpayPlanId(cacheKey);
  if (cached) {
    planIdMemCache[cacheKey] = cached;
    return cached;
  }

  // 3. Create a new plan in Razorpay (only runs once per tier/billing per env)
  // unit_amount is the tier's whole flat price — quantity is always 1.
  const unitAmount = PLAN_PRICING[tier][billing];
  const rzp = getRazorpay();

  const plan = await (rzp.plans.create as any)({
    period: billing === "annual" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `HRMS ${TIER_LABEL[tier]} – ${
        billing === "annual" ? "Annual" : "Monthly"
      }`,
      amount: unitAmount,
      unit_amount: unitAmount,
      currency: "INR",
    },
  });

  planIdMemCache[cacheKey] = plan.id;
  await setRazorpayPlanId(cacheKey, plan.id);
  logger.info(`Razorpay plan created (${cacheKey}): ${plan.id}`);
  return plan.id;
}

// ─── POST /payment/create-subscription ───────────────────────────────────────

export async function createSubscription(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  try {
    const { billing, planTier } = req.body as {
      billing?: Billing;
      planTier?: PlanTier;
    };
    const period: Billing = billing === "annual" ? "annual" : "monthly";

    // Pre-tenant (org-setup) signups pick a tier explicitly (derived from the
    // company-size step); an existing tenant renewing (Subscription.tsx's
    // "Renew" flow, post-expiry) keeps whatever tier it already had rather
    // than silently resetting to starter if the field is omitted.
    let tier: PlanTier = isPlanTier(planTier) ? planTier : "starter";
    if (!isPlanTier(planTier) && tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { planTier: true },
      });
      if (isPlanTier(tenant?.planTier)) tier = tenant!.planTier as PlanTier;
    }

    const planId = await getOrCreatePlanId(tier, period);
    const rzp = getRazorpay();

    const subscription = await (rzp.subscriptions.create as any)({
      plan_id: planId,
      customer_notify: 1,
      total_count: totalCountFor(period),
      quantity: 1,
    });

    // Record pending subscription so the backend can recover without
    // client-side credentials if the tab closes mid-request.
    const { storePendingSubscription } =
      await import("../services/tenantTokenStore");
    await storePendingSubscription(userId, subscription.id, period, tier);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        subscriptionId: subscription.id,
        keyId: process.env.RAZORPAY_KEY_ID,
        billing: period,
        planTier: tier,
      },
    });
  } catch (error: unknown) {
    logger.error("createSubscription error:", { error });
    return handleError(res, error);
  }
}

// ─── GET /payment/plan-pricing ────────────────────────────────────────────────
// Authenticated-only (not requireTenant) — needed by the org-setup PlanStep
// before a tenant exists, and by Subscription.tsx afterwards. The frontend
// never hardcodes these numbers independent of what the backend will actually
// charge.

export async function getPlanPricing(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  try {
    let activeEmployeeCount = 0;
    if (tenantId) {
      activeEmployeeCount = await getActiveEmployeeCount(tenantId);
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        pricing: PLAN_PRICING,
        tierEmployeeLimits: TIER_EMPLOYEE_LIMITS,
        activeEmployeeCount,
      },
    });
  } catch (error: unknown) {
    logger.error("getPlanPricing error:", { error });
    return handleError(res, error);
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
  } catch (error: unknown) {
    logger.error("getPendingSetup error:", { error });
    return handleError(res, error);
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
  } catch (error: unknown) {
    logger.error("cancelSubscription error:", { error });
    return handleError(res, error);
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
  } catch (error: unknown) {
    logger.error("reactivateSubscription error:", { error });
    return handleError(res, error);
  }
}

// ─── POST /payment/change-plan ────────────────────────────────────────────────
//
// Tier changes within the same billing period are the only case that gets an
// immediate, prorated charge (billing-period changes always land at the next
// renewal — see the plan doc's "scope-reducing assumptions"). This endpoint
// only computes what's needed and, for the immediate-upgrade path, returns an
// order for the frontend to collect payment on — it never mutates the tenant
// itself; confirmPlanUpgrade does that once payment is verified.

export async function changePlan(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  try {
    const { planTier, billing } = req.body as {
      planTier?: PlanTier;
      billing?: Billing;
    };
    if (!isPlanTier(planTier)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "A valid planTier ('starter', 'growth', or 'enterprise') is required.",
      });
    }
    if (billing !== "monthly" && billing !== "annual") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A valid billing ('monthly' or 'annual') is required.",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: {
        planTier: true,
        billing: true,
        pendingPlanTier: true,
        razorpaySubscriptionId: true,
        subscriptionStatus: true,
        planExpiresAt: true,
      },
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

    const currentTier: PlanTier = isPlanTier(tenant.planTier)
      ? tenant.planTier
      : "starter";
    const currentBilling: Billing =
      tenant.billing === "annual" ? "annual" : "monthly";

    // Requesting the currently-active tier/billing is only a genuine no-op
    // if nothing is staged — if a downgrade/billing-change IS pending, this
    // is how the frontend cancels it (re-points Razorpay's cycle_end
    // schedule back at the plan that's actually still active).
    if (
      planTier === currentTier &&
      billing === currentBilling &&
      !tenant.pendingPlanTier
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "You're already on this plan.",
      });
    }

    const limit = TIER_EMPLOYEE_LIMITS[planTier];
    if (limit !== null) {
      const activeEmployeeCount = await getActiveEmployeeCount(tenantId!);
      if (activeEmployeeCount > limit) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: `${TIER_LABEL[planTier]} supports up to ${limit} employees. You currently have ${activeEmployeeCount} — reduce headcount or choose a higher tier.`,
        });
      }
    }

    const newPlanId = await getOrCreatePlanId(planTier, billing);

    // Billing-period changes (with or without a tier change) always defer to
    // the next renewal — no proration. Only a same-billing tier change is
    // eligible for the immediate/prorated path.
    const billingUnchanged = billing === currentBilling;
    const isUpgrade =
      billingUnchanged &&
      monthlyEquivalentPaise(planTier, billing) >
        monthlyEquivalentPaise(currentTier, currentBilling);

    const rzp = getRazorpay();

    if (billingUnchanged && isUpgrade) {
      const currentAmount = amountPaise(currentTier, currentBilling);
      const newAmount = amountPaise(planTier, billing);
      const now = new Date();
      const cycleDays = currentBilling === "annual" ? 365 : 30;
      const remainingMs = tenant.planExpiresAt
        ? tenant.planExpiresAt.getTime() - now.getTime()
        : 0;
      const remainingDays = Math.max(
        Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
        0,
      );
      const proratedPaise = Math.max(
        Math.round(((newAmount - currentAmount) * remainingDays) / cycleDays),
        0,
      );

      if (proratedPaise <= 0) {
        // Remaining cycle is worth ~nothing (e.g. renewal is today) — just
        // swap immediately with no charge.
        await (rzp.subscriptions.update as any)(tenant.razorpaySubscriptionId, {
          plan_id: newPlanId,
          quantity: 1,
          schedule_change_at: "now",
        });
        await prisma.tenant.update({
          where: { id: tenantId! },
          data: { planTier, billing },
        });
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
          data: { requiresPayment: false },
          message: "Plan changed.",
        });
      }

      const order = await (rzp.orders as any).create({
        amount: proratedPaise,
        currency: "INR",
        receipt: `upgrade_${tenantId}_${now.getTime()}`,
        notes: {
          tenantId: tenantId!,
          planTier,
          billing,
          purpose: "plan_upgrade_proration",
        },
      });

      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: {
          requiresPayment: true,
          orderId: order.id,
          amount: proratedPaise,
          keyId: process.env.RAZORPAY_KEY_ID,
          planTier,
          billing,
        },
      });
    }

    // Downgrade, or any billing-period change — scheduled for next cycle,
    // Razorpay applies it automatically, no charge collected now.
    await (rzp.subscriptions.update as any)(tenant.razorpaySubscriptionId, {
      plan_id: newPlanId,
      quantity: 1,
      schedule_change_at: "cycle_end",
    });
    await prisma.tenant.update({
      where: { id: tenantId! },
      data: {
        pendingPlanTier: planTier,
        pendingBilling: billing,
        pendingPlanChangeAt: tenant.planExpiresAt,
      },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { requiresPayment: false, effectiveAt: tenant.planExpiresAt },
      message: `Your plan will change on ${tenant.planExpiresAt?.toLocaleDateString("en-IN") ?? "your next renewal"}.`,
    });
  } catch (error: unknown) {
    logger.error("changePlan error:", { error });
    return handleError(res, error);
  }
}

// ─── POST /payment/confirm-plan-upgrade ───────────────────────────────────────
//
// Completes the immediate-upgrade path from changePlan once the one-time
// prorated Razorpay order has actually been paid. Verifies the standard
// Razorpay Orders signature — HMAC(order_id|payment_id) — distinct from the
// subscription signature (HMAC(payment_id|subscription_id)) used elsewhere in
// this file.

export async function confirmPlanUpgrade(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      planTier,
      billing,
    } = req.body as {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
      planTier?: PlanTier;
      billing?: Billing;
    };

    if (
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature ||
      !isPlanTier(planTier) ||
      (billing !== "monthly" && billing !== "annual")
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment details are required.",
      });
    }

    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    if (expected !== razorpaySignature) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment verification failed.",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { razorpaySubscriptionId: true },
    });
    if (!tenant?.razorpaySubscriptionId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No subscription found.",
      });
    }

    const newPlanId = await getOrCreatePlanId(planTier, billing);

    const rzp = getRazorpay();
    // schedule_change_at: "now" applies the new plan starting immediately,
    // for all future cycles — planExpiresAt is untouched, so the renewal
    // date doesn't move, only the price from here on does.
    await (rzp.subscriptions.update as any)(tenant.razorpaySubscriptionId, {
      plan_id: newPlanId,
      quantity: 1,
      schedule_change_at: "now",
    });

    await prisma.tenant.update({
      where: { id: tenantId! },
      data: {
        planTier,
        billing,
        pendingPlanTier: null,
        pendingBilling: null,
        pendingPlanChangeAt: null,
      },
    });

    logger.info(
      `Plan upgrade confirmed for tenant ${tenantId}: ${planTier}/${billing}`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Plan upgraded.",
    });
  } catch (error: unknown) {
    logger.error("confirmPlanUpgrade error:", { error });
    return handleError(res, error);
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

    const signatureBuf = Buffer.from(signature || "", "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      signatureBuf.length !== expectedBuf.length ||
      !timingSafeEqual(signatureBuf, expectedBuf)
    ) {
      logger.warn("Razorpay webhook: invalid signature");
      return res.status(400).json({ ok: false });
    }

    // ── Idempotency — skip already-processed events ─────────────────────────
    // Razorpay retries on non-2xx. We ack early (200) then do nothing.
    // tryReserveWebhookEvent is an atomic SET NX: only one concurrent
    // delivery of the same event ID can ever win this check, closing the
    // race a separate GET-then-SETEX would leave open. Operations below are
    // all naturally idempotent, so a crash after reserving but before
    // finishing is safe: the key's TTL eventually expires and a later retry
    // (if Razorpay sends one) re-processes with the same outcome.
    if (eventId) {
      const { tryReserveWebhookEvent } =
        await import("../services/tenantTokenStore");
      if (!(await tryReserveWebhookEvent(eventId))) {
        logger.info(`Razorpay webhook: duplicate event ${eventId} — skipped`);
        return res.json({ ok: true });
      }
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

          // If a downgrade/billing-change was scheduled (changePlan, "cycle_end"),
          // Razorpay has already started charging the new terms by the time this
          // charge lands — this is the moment our own DB catches up and clears it.
          const hasPendingChange = Boolean(tenant.pendingPlanTier);
          const pendingOrCurrentTier =
            tenant.pendingPlanTier ?? tenant.planTier;
          const effectiveTier: PlanTier = isPlanTier(pendingOrCurrentTier)
            ? pendingOrCurrentTier
            : "starter";
          const billing: Billing =
            (tenant.pendingBilling ?? tenant.billing) === "annual"
              ? "annual"
              : "monthly";

          const next = new Date(base);
          billing === "annual"
            ? next.setFullYear(next.getFullYear() + 1)
            : next.setMonth(next.getMonth() + 1);

          // Extract payment method from webhook payload (free — no extra API call)
          const pmEntity = payload.payment?.entity;
          const pmInfo = pmEntity
            ? extractPaymentMethodFromEntity(pmEntity)
            : null;

          // Informational only now (flat-fee slabs, not per-seat billing) —
          // carried onto the invoice so it shows headcount at charge time.
          const employeeCount = await getActiveEmployeeCount(tenant.id);

          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              subscriptionStatus: "active",
              planExpiresAt: next,
              planTier: effectiveTier,
              billing,
              lastBilledQuantity: employeeCount,
              ...(hasPendingChange && {
                pendingPlanTier: null,
                pendingBilling: null,
                pendingPlanChangeAt: null,
              }),
              ...(pmInfo && {
                paymentMethod: pmInfo.method,
                paymentMethodSummary: pmInfo.summary,
              }),
            },
          });

          // Platform-branded renewal email + invoice PDF — billing
          // relationship is with Praesto, not tenant HR.
          const amountPaise = pmEntity?.amount;
          getTenantOwnerEmail(tenant.id)
            .then((owner) => {
              if (!owner || typeof amountPaise !== "number") return;
              const invoicePdf = buildInvoicePdf({
                tenantName: tenant.name,
                plan: tenant.plan ?? "pro",
                planTier: effectiveTier,
                quantity: employeeCount,
                billing,
                amountPaise,
                paymentMethodSummary:
                  pmInfo?.summary ?? tenant.paymentMethodSummary,
                billingPeriodStart: base,
                billingPeriodEnd: next,
                invoiceDate: now,
              });
              return notify({
                tenantId: tenant.id,
                event: "subscriptionRenewed",
                email: {
                  to: owner.email,
                  subject: `Your Praesto subscription has been renewed`,
                  html: renderEmailHtml({
                    title: "Subscription Renewed",
                    tenantName: tenant.name,
                    // Billing relationship is with Praesto, not tenant HR —
                    // keep the platform signature even though the tenant name
                    // is still shown in the header for context.
                    signature: "Praesto Team",
                    bodyHtml: `<h2>Hello ${owner.username},</h2><p>Your Praesto subscription for <strong>${tenant.name}</strong> has been renewed. The invoice is attached.</p>`,
                  }),
                  from: PLATFORM_FROM,
                  attachments: [
                    {
                      filename: `invoice_${tenant.slug}_${now.toISOString().slice(0, 10)}.pdf`,
                      content: invoicePdf.toString("base64"),
                    },
                  ],
                },
              });
            })
            .catch((error: unknown) =>
              logger.warn("[handleWebhook] renewal email failed:", {
                error,
              }),
            );
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
          select: { id: true, name: true },
        });
        if (failedTenant) {
          logger.warn(
            `Razorpay payment attempt failed for subscription ${subscriptionId} ` +
              `(tenant ${failedTenant.id}). Razorpay will retry automatically.`,
          );
          getTenantOwnerEmail(failedTenant.id)
            .then((owner) => {
              if (!owner) return;
              return notify({
                tenantId: failedTenant.id,
                event: "subscriptionPaymentFailed",
                email: {
                  to: owner.email,
                  subject: "Action needed: your Praesto payment failed",
                  html: renderEmailHtml({
                    title: "Payment Failed",
                    tenantName: failedTenant.name,
                    // Billing relationship is with Praesto, not tenant HR —
                    // keep the platform signature even though the tenant name
                    // is still shown in the header for context.
                    signature: "Praesto Team",
                    bodyHtml: `<h2>Hello ${owner.username},</h2><p>We couldn't process your latest Praesto subscription payment. We'll retry automatically, but please update your payment method to avoid an interruption to your subscription.</p>`,
                  }),
                  from: PLATFORM_FROM,
                },
              });
            })
            .catch((error: unknown) =>
              logger.warn("[handleWebhook] payment-failed notify failed:", {
                error,
              }),
            );
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
  } catch (error: unknown) {
    logger.error("handleWebhook error:", { error });
    return res.status(500).json({ ok: false });
  }
}
