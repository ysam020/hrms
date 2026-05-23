import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  getPendingSetup,
} from "../handlers/payment";

export const paymentRouter: Router = Router();

paymentRouter.post(
  "/payment/create-subscription",
  authenticate,
  createSubscription,
);
paymentRouter.get("/payment/pending-setup", authenticate, getPendingSetup);
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

// NOTE: /payment/webhook is mounted directly in server.ts before the CSRF
// middleware and express.json() so Razorpay's raw bytes are preserved for
// HMAC signature verification. Do not re-add it here.
