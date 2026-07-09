import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/hrm";
import {
  addHrActivitySchema,
  editHrActivitySchema,
  createOrUpdatePolicySchema,
  updatePolicySchema,
} from "../schemas";

export const hrmRouter: Router = Router();

hrmRouter.get(
  "/get-hr-activities",
  authenticate,
  requireSuperUser,
  h.getHrActivities,
);
hrmRouter.get(
  "/hr-activity/:_id",
  authenticate,
  requireSuperUser,
  h.getHrActivity,
);
hrmRouter.post(
  "/add-hr-activity",
  authenticate,
  requireSuperUser,
  validate(addHrActivitySchema),
  h.addHrActivity,
);
hrmRouter.put(
  "/edit-hr-activity/:_id",
  authenticate,
  requireSuperUser,
  validate(editHrActivitySchema),
  h.editHrActivity,
);
hrmRouter.delete(
  "/delete-hr-activity/:_id",
  authenticate,
  requireSuperUser,
  h.deleteHrActivity,
);

hrmRouter.get("/policies", authenticate, h.getPolicies);
hrmRouter.post(
  "/policies",
  authenticate,
  requireSuperUser,
  validate(createOrUpdatePolicySchema),
  h.createOrUpdatePolicy,
);
hrmRouter.get("/policies/:id/pdf", authenticate, h.getPolicyPdf);
hrmRouter.get("/policies/:id", authenticate, h.getPolicy);
hrmRouter.put(
  "/policies/:id",
  authenticate,
  requireSuperUser,
  validate(updatePolicySchema),
  h.updatePolicy,
);
hrmRouter.delete(
  "/policies/:id",
  authenticate,
  requireSuperUser,
  h.deletePolicy,
);

hrmRouter.get(
  "/is-superuser/:username",
  authenticate,
  requireSuperUser,
  h.isSuperuser,
);
