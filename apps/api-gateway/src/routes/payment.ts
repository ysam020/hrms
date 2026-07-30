import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  getPendingSetup,
  getPlanPricing,
  changePlan,
  confirmPlanUpgrade,
  startPaymentMethodChange,
  confirmPaymentMethodChange,
} from "../handlers/payment";

export const paymentRouter: Router = Router();

paymentRouter.post(
  "/payment/create-subscription",
  authenticate,
  createSubscription,
);
paymentRouter.get("/payment/pending-setup", authenticate, getPendingSetup);
// authenticate-only (no requireTenant) — needed by org-setup's PlanStep
// before a tenant exists, as well as by Subscription.tsx afterwards.
paymentRouter.get("/payment/plan-pricing", authenticate, getPlanPricing);
paymentRouter.post(
  "/payment/cancel-subscription",
  authenticate,
  requireTenant,
  cancelSubscription,
);
paymentRouter.post(
  "/payment/reactivate-subscription",
  authenticate,
  requireTenant,
  reactivateSubscription,
);
paymentRouter.post(
  "/payment/change-plan",
  authenticate,
  requireTenant,
  changePlan,
);
paymentRouter.post(
  "/payment/confirm-plan-upgrade",
  authenticate,
  requireTenant,
  confirmPlanUpgrade,
);
paymentRouter.post(
  "/payment/start-payment-method-change",
  authenticate,
  requireTenant,
  startPaymentMethodChange,
);
paymentRouter.post(
  "/payment/confirm-payment-method-change",
  authenticate,
  requireTenant,
  confirmPaymentMethodChange,
);

// NOTE: /payment/webhook is mounted directly in server.ts before the CSRF
// middleware and express.json() so Razorpay's raw bytes are preserved for
// HMAC signature verification. Do not re-add it here.
