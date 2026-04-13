import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import * as h from "../handlers/hrm";

export const hrmRouter: Router = Router();

hrmRouter.get(
  "/hr-activities",
  authenticate,
  requireSuperUser,
  h.getHrActivities,
);
hrmRouter.get(
  "/hr-activities/:_id",
  authenticate,
  requireSuperUser,
  h.getHrActivity,
);
hrmRouter.post(
  "/hr-activities",
  authenticate,
  requireSuperUser,
  h.validateAddHrActivity,
  h.addHrActivity,
);
hrmRouter.put(
  "/hr-activities/:_id",
  authenticate,
  requireSuperUser,
  h.validateEditHrActivity,
  h.editHrActivity,
);
hrmRouter.delete(
  "/hr-activities/:_id",
  authenticate,
  requireSuperUser,
  h.deleteHrActivity,
);

hrmRouter.get("/rules", authenticate, h.getRules);
hrmRouter.post(
  "/rules",
  authenticate,
  requireSuperUser,
  h.validateCreateRule,
  h.createRule,
);
hrmRouter.put(
  "/rules/:id",
  authenticate,
  requireSuperUser,
  h.validateUpdateRule,
  h.updateRule,
);
hrmRouter.delete("/rules/:id", authenticate, requireSuperUser, h.deleteRule);
hrmRouter.patch(
  "/rules/:id/status",
  authenticate,
  requireSuperUser,
  h.validateUpdateRuleStatus,
  h.updateRuleStatus,
);
hrmRouter.post("/rules/test", authenticate, requireSuperUser, h.testRule);

hrmRouter.get("/policies", authenticate, h.getPolicies);
hrmRouter.post(
  "/policies",
  authenticate,
  requireSuperUser,
  h.validateCreatePolicy,
  h.createOrUpdatePolicy,
);
hrmRouter.get("/policies/:id/pdf", authenticate, h.getPolicyPdf);
hrmRouter.get("/policies/:id", authenticate, h.getPolicy);
hrmRouter.put(
  "/policies/:id",
  authenticate,
  requireSuperUser,
  h.validateUpdatePolicy,
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
