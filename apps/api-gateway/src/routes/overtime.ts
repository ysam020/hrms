import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/overtime";
import { requestOvertimeSchema } from "../schemas";

export const overtimeRouter: Router = Router();

overtimeRouter.post(
  "/overtime-requests",
  authenticate,
  validate(requestOvertimeSchema),
  h.requestOvertime,
);
overtimeRouter.get("/overtime-requests", authenticate, h.listOvertimeRequests);
