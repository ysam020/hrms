import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/webhooks";
import { createWebhookSchema, updateWebhookSchema } from "../schemas";
import { z } from "zod";

export const webhooksRouter: Router = Router();

// Endpoint management
webhooksRouter.post(
  "/endpoints",
  authenticate,
  validate(createWebhookSchema),
  h.createEndpoint,
);
webhooksRouter.get("/endpoints", authenticate, h.listEndpoints);
webhooksRouter.patch(
  "/endpoints/:endpointId",
  authenticate,
  validate(updateWebhookSchema),
  h.updateEndpoint,
);
webhooksRouter.delete("/endpoints/:endpointId", authenticate, h.deleteEndpoint);

// Delivery log + retry
webhooksRouter.get(
  "/endpoints/:endpointId/deliveries",
  authenticate,
  h.listDeliveries,
);
webhooksRouter.post(
  "/deliveries/:deliveryId/retry",
  authenticate,
  h.retryDelivery,
);

// Test ping
webhooksRouter.post(
  "/test",
  authenticate,
  validate(z.object({ endpointId: z.string().min(1) })),
  h.testEndpoint,
);
