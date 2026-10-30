import { Router } from "express";
import {
  authenticate,
  requireTenant,
  requireSubscriptionManager,
} from "../middleware/authenticate";
import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  getPendingSetup,
  getPlanPricing,
  getTrialEligibility,
  changePlan,
  confirmPlanUpgrade,
  startPaymentMethodChange,
  confirmPaymentMethodChange,
} from "../handlers/payment";

export const paymentRouter: Router = Router();

// Every mutation below acts on the tenant's subscription, so each one is
// limited to the people who manage billing (requireSubscriptionManager) —
// requireTenant alone would let any employee cancel or re-plan it.
paymentRouter.post(
  "/payment/create-subscription",
  authenticate,
  requireSubscriptionManager,
  createSubscription,
);
paymentRouter.get("/payment/pending-setup", authenticate, getPendingSetup);
// authenticate-only (no requireTenant) — needed by org-setup's PlanStep
// before a tenant exists, as well as by Subscription.tsx afterwards.
paymentRouter.get("/payment/plan-pricing", authenticate, getPlanPricing);
paymentRouter.get(
  "/payment/trial-eligibility",
  authenticate,
  getTrialEligibility,
);
paymentRouter.post(
  "/payment/cancel-subscription",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  cancelSubscription,
);
paymentRouter.post(
  "/payment/reactivate-subscription",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  reactivateSubscription,
);
paymentRouter.post(
  "/payment/change-plan",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  changePlan,
);
paymentRouter.post(
  "/payment/confirm-plan-upgrade",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  confirmPlanUpgrade,
);
paymentRouter.post(
  "/payment/start-payment-method-change",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  startPaymentMethodChange,
);
paymentRouter.post(
  "/payment/confirm-payment-method-change",
  authenticate,
  requireTenant,
  requireSubscriptionManager,
  confirmPaymentMethodChange,
);

// NOTE: /payment/webhook is mounted directly in server.ts before the CSRF
// middleware and express.json() so Razorpay's raw bytes are preserved for
// HMAC signature verification. Do not re-add it here.
