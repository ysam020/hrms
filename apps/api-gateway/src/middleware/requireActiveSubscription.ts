import { Response, NextFunction } from "express";
import { prisma } from "@hrms/db";
import { AuthRequest } from "./authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { TRIAL_GRACE_MS } from "../config/trial";

export type SubscriptionAccess =
  | {
      allowed: true;
      subscriptionStatus: string | null;
      planExpiresAt: Date | null;
    }
  | { allowed: false; message: string };

// The access decision on its own, shared with the MCP endpoint (see
// mcp/principal.ts), which has no Express middleware chain to run this in.
// Throws on a DB error — callers fail open, as below.
export async function getSubscriptionAccess(
  tenantId: string,
): Promise<SubscriptionAccess> {
  const cached = await loadTenantSubscription(tenantId, false);
  const access = decideAccess(cached);
  if (access.allowed) return access;
  // Never deny from a cached row: a tenant that has just paid must get in
  // straight away, so a denial is always re-checked against the database.
  return decideAccess(await loadTenantSubscription(tenantId, true));
}

export type TenantSubscription = {
  subscriptionStatus: string | null;
  planExpiresAt: Date | null;
  planActivatedAt: Date | null;
  trialEndsAt: Date | null;
} | null;

// This check runs on every business request, so the tenant row is kept per
// process for ~30 s (jittered so cluster workers don't refresh in step) with
// one in-flight load per tenant. Date-based expiry is still evaluated live
// against the clock in decideAccess; only a status change written elsewhere
// (webhook, reconciler, scheduler) can take up to the TTL to revoke access.
const SUBSCRIPTION_TTL_MS = 30_000;
const subscriptionCache = new Map<
  string,
  { expiresAt: number; row: Promise<TenantSubscription> }
>();

function loadTenantSubscription(
  tenantId: string,
  fresh: boolean,
): Promise<TenantSubscription> {
  const hit = subscriptionCache.get(tenantId);
  if (!fresh && hit && hit.expiresAt > Date.now()) return hit.row;
  const row = prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      subscriptionStatus: true,
      planExpiresAt: true,
      planActivatedAt: true,
      trialEndsAt: true,
    },
  });
  const expiresAt =
    Date.now() + SUBSCRIPTION_TTL_MS * (0.8 + Math.random() * 0.4);
  subscriptionCache.set(tenantId, { expiresAt, row });
  // A failed load must not be served from the cache.
  row.catch(() => {
    if (subscriptionCache.get(tenantId)?.row === row)
      subscriptionCache.delete(tenantId);
  });
  return row;
}

/** Test hook; also usable after a local write that must apply at once. */
export function clearSubscriptionCache(): void {
  subscriptionCache.clear();
}

// Exported for the Platform Console, which reports "has access" with the
// exact rule this guard enforces.
export function decideAccess(tenant: TenantSubscription): SubscriptionAccess {
  if (!tenant)
    return { allowed: true, subscriptionStatus: null, planExpiresAt: null };

  // Never paid: the trial ended and its first charge didn't go through.
  const trialOnly = Boolean(tenant.trialEndsAt && !tenant.planActivatedAt);

  if (tenant.subscriptionStatus === "expired") {
    return {
      allowed: false,
      message: trialOnly
        ? "Your free trial has ended. Subscribe to continue."
        : "Your subscription has expired. Please renew to continue.",
    };
  }

  if (tenant.subscriptionStatus === "trialing") {
    // The scheduler moves an unpaid trial to grace_period and then expired
    // (checkSubscriptionExpiry); this live check ends access on time even
    // if those runs are late or missed.
    const end = tenant.trialEndsAt ?? tenant.planExpiresAt;
    if (end && end.getTime() + TRIAL_GRACE_MS <= Date.now()) {
      return {
        allowed: false,
        message: "Your free trial has ended. Subscribe to continue.",
      };
    }
  }

  if (tenant.subscriptionStatus === "cancelled") {
    // The tenant explicitly cancelled — cancel_at_cycle_end means they
    // keep access through the period they already paid for. Checked live
    // on every request rather than via a scheduled job, so access ends
    // exactly when planExpiresAt passes, not whenever a batch job next runs.
    const stillWithinPaidPeriod =
      tenant.planExpiresAt && tenant.planExpiresAt > new Date();
    if (!stillWithinPaidPeriod) {
      return {
        allowed: false,
        message: trialOnly
          ? "Your free trial was cancelled and has ended. Subscribe to continue."
          : "Your subscription was cancelled and your access has ended. Please resubscribe to continue.",
      };
    }
  }

  return {
    allowed: true,
    subscriptionStatus: tenant.subscriptionStatus,
    planExpiresAt: tenant.planExpiresAt,
  };
}

// Applied after requireTenant — blocks expired orgs (and cancelled orgs past
// their paid period, and trials past their grace), passes trialing,
// grace-period, cancelling (legacy), and
// still-within-period cancelled orgs through with warning headers so the UI
// can show banners.
export async function requireActiveSubscription(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return next();

  try {
    const access = await getSubscriptionAccess(tenantId);

    if (!access.allowed) {
      return apiResponse(res, RESPONSE_STATUS.PAYMENT_REQUIRES, {
        message: access.message,
      });
    }

    const { subscriptionStatus, planExpiresAt } = access;

    if (subscriptionStatus === "grace_period") {
      // Allow access but signal the UI to show a renewal banner.
      res.setHeader("X-Subscription-Grace-Period", "true");
      if (planExpiresAt) {
        res.setHeader("X-Plan-Expires-At", planExpiresAt.toISOString());
      }
    }

    if (subscriptionStatus === "trialing") {
      res.setHeader("X-Subscription-Trial", "true");
      if (planExpiresAt) {
        res.setHeader("X-Plan-Expires-At", planExpiresAt.toISOString());
      }
    }

    if (subscriptionStatus === "cancelling") {
      // Legacy transitional state — no longer set by current code
      // (cancelSubscription now sets "cancelled" synchronously), but a
      // pre-existing row could still carry this value. Fail open: full
      // access, no special banner.
      res.setHeader("X-Subscription-Cancelling", "true");
    }

    if (subscriptionStatus === "cancelled") {
      res.setHeader("X-Subscription-Cancelled", "true");
      if (planExpiresAt) {
        res.setHeader("X-Plan-Expires-At", planExpiresAt.toISOString());
      }
    }

    next();
  } catch {
    // Don't block on DB errors — let the request through.
    next();
  }
}
