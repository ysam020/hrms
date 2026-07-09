import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/approvalChains";
import {
  createApprovalChainSchema,
  updateApprovalChainSchema,
  createApprovalDelegateSchema,
  actOnApprovalSchema,
} from "../schemas";

export const approvalChainsRouter: Router = Router();

approvalChainsRouter.get(
  "/approval-chains",
  authenticate,
  h.listApprovalChains,
);
approvalChainsRouter.post(
  "/approval-chains",
  authenticate,
  validate(createApprovalChainSchema),
  h.createApprovalChain,
);
approvalChainsRouter.put(
  "/approval-chains/:id",
  authenticate,
  validate(updateApprovalChainSchema),
  h.updateApprovalChain,
);
approvalChainsRouter.delete(
  "/approval-chains/:id",
  authenticate,
  h.deleteApprovalChain,
);

approvalChainsRouter.get(
  "/approval-delegates",
  authenticate,
  h.listApprovalDelegates,
);
approvalChainsRouter.post(
  "/approval-delegates",
  authenticate,
  validate(createApprovalDelegateSchema),
  h.createApprovalDelegate,
);
approvalChainsRouter.delete(
  "/approval-delegates/:id",
  authenticate,
  h.deleteApprovalDelegate,
);

approvalChainsRouter.get(
  "/approvals/pending",
  authenticate,
  h.listPendingApprovals,
);
approvalChainsRouter.put(
  "/approvals/:instanceId/act",
  authenticate,
  validate(actOnApprovalSchema),
  h.actOnApproval,
);
