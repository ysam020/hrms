import { Router } from "express";
import { authenticate, requireTenant } from "../middleware/authenticate";
import {
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
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

// Webhook must receive the raw JSON body for signature verification.
// Express's global json() middleware re-serialises req.body, which is fine
// as long as we stringify it ourselves in the handler (which we do).
paymentRouter.post("/payment/webhook", handleWebhook);
