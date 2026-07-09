import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { getLeavePolicy, updateLeavePolicy } from "../handlers/leavePolicy";
import * as compOff from "../handlers/compOffCredits";
import { updateLeavePolicySchema, createCompOffCreditSchema } from "../schemas";

export const leavePolicyRouter: Router = Router();

leavePolicyRouter.get("/leave-policy", authenticate, getLeavePolicy);
leavePolicyRouter.put(
  "/leave-policy",
  authenticate,
  validate(updateLeavePolicySchema),
  updateLeavePolicy,
);

leavePolicyRouter.get(
  "/comp-off-credits",
  authenticate,
  compOff.listCompOffCredits,
);
leavePolicyRouter.post(
  "/comp-off-credits",
  authenticate,
  validate(createCompOffCreditSchema),
  compOff.createCompOffCredit,
);
