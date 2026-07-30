import { Response, NextFunction } from "express";
import { prisma } from "@hrms/db";
import { AuthRequest } from "./authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

// Applied after requireTenant — blocks expired orgs (and cancelled orgs past
// their paid period), passes grace-period, cancelling (legacy), and
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
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionStatus: true, planExpiresAt: true },
    });

    if (!tenant) return next();

    if (tenant.subscriptionStatus === "expired") {
      return apiResponse(res, RESPONSE_STATUS.PAYMENT_REQUIRES, {
        message: "Your subscription has expired. Please renew to continue.",
      });
    }

    if (tenant.subscriptionStatus === "grace_period") {
      // Allow access but signal the UI to show a renewal banner.
      res.setHeader("X-Subscription-Grace-Period", "true");
      if (tenant.planExpiresAt) {
        res.setHeader("X-Plan-Expires-At", tenant.planExpiresAt.toISOString());
      }
    }

    if (tenant.subscriptionStatus === "cancelling") {
      // Legacy transitional state — no longer set by current code
      // (cancelSubscription now sets "cancelled" synchronously), but a
      // pre-existing row could still carry this value. Fail open: full
      // access, no special banner.
      res.setHeader("X-Subscription-Cancelling", "true");
    }

    if (tenant.subscriptionStatus === "cancelled") {
      // The tenant explicitly cancelled — cancel_at_cycle_end means they
      // keep access through the period they already paid for. Checked live
      // on every request rather than via a scheduled job, so access ends
      // exactly when planExpiresAt passes, not whenever a batch job next runs.
      const stillWithinPaidPeriod =
        tenant.planExpiresAt && tenant.planExpiresAt > new Date();
      if (!stillWithinPaidPeriod) {
        return apiResponse(res, RESPONSE_STATUS.PAYMENT_REQUIRES, {
          message:
            "Your subscription was cancelled and your access has ended. Please resubscribe to continue.",
        });
      }
      res.setHeader("X-Subscription-Cancelled", "true");
      if (tenant.planExpiresAt) {
        res.setHeader("X-Plan-Expires-At", tenant.planExpiresAt.toISOString());
      }
    }

    next();
  } catch {
    // Don't block on DB errors — let the request through.
    next();
  }
}
