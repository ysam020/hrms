import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/assets";
import {
  createAssetSchema,
  updateAssetSchema,
  assignAssetSchema,
  returnAssetSchema,
  acknowledgeAssignmentSchema,
  reportAssetIssueSchema,
  updateAssetIssueStatusSchema,
} from "../schemas";

export const assetsRouter: Router = Router();

// ── Issue routes (static, must come before /:assetId) ─────────────────────
assetsRouter.get("/issues", authenticate, h.listAssetIssues);
assetsRouter.post(
  "/issues",
  authenticate,
  validate(reportAssetIssueSchema),
  h.reportAssetIssue,
);
assetsRouter.get("/issues/:issueId", authenticate, h.getAssetIssue);
assetsRouter.patch(
  "/issues/:issueId/status",
  authenticate,
  validate(updateAssetIssueStatusSchema),
  h.updateAssetIssueStatus,
);

// ── Summary (static, before /:assetId) ────────────────────────────────────
assetsRouter.get("/summary", authenticate, h.getAssetSummary);

// ── Assignment sub-actions ─────────────────────────────────────────────────
assetsRouter.post(
  "/assign",
  authenticate,
  validate(assignAssetSchema),
  h.assignAsset,
);
assetsRouter.post(
  "/return",
  authenticate,
  validate(returnAssetSchema),
  h.returnAsset,
);

// ── Acknowledgement ────────────────────────────────────────────────────────
assetsRouter.post(
  "/assignments/:assignmentId/acknowledge",
  authenticate,
  validate(acknowledgeAssignmentSchema),
  h.acknowledgeAssignment,
);

// ── Core CRUD ─────────────────────────────────────────────────────────────
assetsRouter.get("/", authenticate, h.listAssets);
assetsRouter.post(
  "/",
  authenticate,
  validate(createAssetSchema),
  h.createAsset,
);
assetsRouter.get("/:assetId", authenticate, h.getAsset);
assetsRouter.patch(
  "/:assetId",
  authenticate,
  validate(updateAssetSchema),
  h.updateAsset,
);
// POST /:assetId/retire is the primary retirement endpoint (state transition).
// DELETE /:assetId is kept for backward-compatibility.
assetsRouter.post("/:assetId/retire", authenticate, h.retireAsset);
assetsRouter.delete("/:assetId", authenticate, h.retireAsset);
