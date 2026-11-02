import { Router } from "express";
import * as h from "../handlers/presence";
import { validate } from "../middleware/validate";
import {
  presenceBatchQuerySchema,
  presencePeopleQuerySchema,
  presenceUpdateSchema,
} from "../schemas";

// Employee availability. Mounted under /presence with authenticate +
// requireTenant (routes/index.ts) but not the subscription check: it holds
// no business data, and the sidebar reads it on every page — a 402 there
// would bounce a lapsed organisation's people off the Subscription page.
export const presenceRouter: Router = Router();

presenceRouter.get("/me", h.getMyPresence);
presenceRouter.put("/me", validate(presenceUpdateSchema), h.updateMyPresence);
presenceRouter.post("/me/restore", h.restoreMyPresence);
presenceRouter.delete("/me/message", h.clearMyPresenceMessage);
presenceRouter.get(
  "/people",
  validate(presencePeopleQuerySchema, "query"),
  h.getPresencePeople,
);
presenceRouter.get(
  "/",
  validate(presenceBatchQuerySchema, "query"),
  h.getPresenceBatch,
);
