import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as templates from "../handlers/exitInterviewTemplates";
import * as checklist from "../handlers/exitChecklist";
import * as extras from "../handlers/resignationExtras";
import {
  updateExitInterviewTemplateSchema,
  submitExitInterviewResponseSchema,
  createExitChecklistItemSchema,
  updateExitChecklistItemSchema,
  updateExitChecklistStatusSchema,
  renegotiateNoticeSchema,
} from "../schemas";

export const exitPolicyRouter: Router = Router();

// Exit interview template (single active template per tenant)
exitPolicyRouter.get(
  "/exit-interview-templates",
  authenticate,
  templates.getExitInterviewTemplate,
);
exitPolicyRouter.put(
  "/exit-interview-templates",
  authenticate,
  validate(updateExitInterviewTemplateSchema),
  templates.updateExitInterviewTemplate,
);
exitPolicyRouter.post(
  "/resignations/:id/exit-interview-response",
  authenticate,
  validate(submitExitInterviewResponseSchema),
  templates.submitExitInterviewResponse,
);

// Exit checklist item definitions (tenant-level config)
exitPolicyRouter.get(
  "/exit-checklist-item-defs",
  authenticate,
  checklist.listExitChecklistDefs,
);
exitPolicyRouter.post(
  "/exit-checklist-item-defs",
  authenticate,
  validate(createExitChecklistItemSchema),
  checklist.createExitChecklistDef,
);
exitPolicyRouter.put(
  "/exit-checklist-item-defs/:id",
  authenticate,
  validate(updateExitChecklistItemSchema),
  checklist.updateExitChecklistDef,
);
exitPolicyRouter.delete(
  "/exit-checklist-item-defs/:id",
  authenticate,
  checklist.deleteExitChecklistDef,
);

// Per-resignation checklist status
exitPolicyRouter.get(
  "/resignations/:id/checklist",
  authenticate,
  checklist.getResignationChecklist,
);
exitPolicyRouter.put(
  "/resignations/:id/checklist/:itemDefId",
  authenticate,
  validate(updateExitChecklistStatusSchema),
  checklist.updateResignationChecklistItem,
);

// Notice renegotiation, rehire flag, FnF settlement
exitPolicyRouter.put(
  "/resignations/:id/renegotiate-notice",
  authenticate,
  validate(renegotiateNoticeSchema),
  extras.renegotiateNotice,
);
exitPolicyRouter.get(
  "/resignations/:id/notice-events",
  authenticate,
  extras.listNoticeEvents,
);
exitPolicyRouter.put(
  "/resignations/:id/rehire-eligibility",
  authenticate,
  extras.setRehireEligibility,
);
exitPolicyRouter.post(
  "/resignations/:id/fnf-settlement",
  authenticate,
  extras.computeFnfSettlement,
);
exitPolicyRouter.put(
  "/resignations/:id/fnf-settlement/approve",
  authenticate,
  extras.approveFnfSettlement,
);
