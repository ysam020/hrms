import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/wfh";
import {
  requestWfhSchema,
  updateWfhStatusSchema,
  bulkUpdateWfhStatusSchema,
} from "../schemas";

export const wfhRouter: Router = Router();

wfhRouter.use(authenticate, h.requireWfhEnabled);

wfhRouter.post("/requests", validate(requestWfhSchema), h.requestWfh);
wfhRouter.get("/requests", h.listWfhRequests);
wfhRouter.patch(
  "/requests/status",
  validate(updateWfhStatusSchema),
  h.updateWfhStatus,
);
wfhRouter.patch(
  "/requests/bulk-status",
  validate(bulkUpdateWfhStatusSchema),
  h.bulkUpdateWfhStatus,
);
wfhRouter.get("/calendar", h.getWfhCalendar);
