import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/wfh";
import { requestWfhSchema, updateWfhStatusSchema } from "../schemas";

export const wfhRouter: Router = Router();

wfhRouter.post(
  "/requests",
  authenticate,
  validate(requestWfhSchema),
  h.requestWfh,
);
wfhRouter.get("/requests", authenticate, h.listWfhRequests);
wfhRouter.patch(
  "/requests/status",
  authenticate,
  validate(updateWfhStatusSchema),
  h.updateWfhStatus,
);
wfhRouter.get("/calendar", authenticate, h.getWfhCalendar);
