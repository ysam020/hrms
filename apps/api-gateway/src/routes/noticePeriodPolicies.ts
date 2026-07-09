import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/noticePeriodPolicies";
import {
  createNoticePeriodPolicySchema,
  updateNoticePeriodPolicySchema,
} from "../schemas";

export const noticePeriodPoliciesRouter: Router = Router();

noticePeriodPoliciesRouter.get(
  "/notice-period-policies",
  authenticate,
  h.listNoticePeriodPolicies,
);
noticePeriodPoliciesRouter.post(
  "/notice-period-policies",
  authenticate,
  validate(createNoticePeriodPolicySchema),
  h.createNoticePeriodPolicy,
);
noticePeriodPoliciesRouter.put(
  "/notice-period-policies/:id",
  authenticate,
  validate(updateNoticePeriodPolicySchema),
  h.updateNoticePeriodPolicy,
);
noticePeriodPoliciesRouter.delete(
  "/notice-period-policies/:id",
  authenticate,
  h.deleteNoticePeriodPolicy,
);
