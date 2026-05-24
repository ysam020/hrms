import { Response, NextFunction } from "express";
import { prisma } from "@hrms/db";
import { AuthRequest } from "./authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

// Applied after requireTenant — blocks expired orgs, passes grace-period and
// cancelling orgs through with warning headers so the UI can show banners.
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
      // Cancellation requested but not yet confirmed by Razorpay webhook.
      // The tenant retains full access until the webhook sets status to
      // "expired". Signal the UI to show a "cancellation pending" banner.
      res.setHeader("X-Subscription-Cancelling", "true");
    }

    next();
  } catch {
    // Don't block on DB errors — let the request through.
    next();
  }
}
