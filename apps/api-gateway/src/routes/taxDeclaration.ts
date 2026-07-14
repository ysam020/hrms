import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/taxDeclaration";
import {
  saveDraftDeclarationSchema,
  submitDeclarationSchema,
  submitDeclarationProofsSchema,
  reviewDeclarationSchema,
  reviewDeclarationProofsSchema,
} from "../schemas";

export const taxDeclarationRouter: Router = Router();

// ── Self-service ──────────────────────────────────────────────────────────────
taxDeclarationRouter.get("/mine", authenticate, h.getMyDeclaration);
taxDeclarationRouter.post(
  "/draft",
  authenticate,
  validate(saveDraftDeclarationSchema),
  h.saveDraftDeclaration,
);
taxDeclarationRouter.post(
  "/submit",
  authenticate,
  validate(submitDeclarationSchema),
  h.submitDeclaration,
);
taxDeclarationRouter.post(
  "/proofs",
  authenticate,
  validate(submitDeclarationProofsSchema),
  h.submitDeclarationProofs,
);

// ── HR review ──────────────────────────────────────────────────────────────────
taxDeclarationRouter.get("/", authenticate, h.listDeclarations);
taxDeclarationRouter.get(
  "/pending",
  authenticate,
  h.getPendingDeclarationActions,
);
taxDeclarationRouter.post(
  "/review",
  authenticate,
  validate(reviewDeclarationSchema),
  h.reviewDeclaration,
);
taxDeclarationRouter.post(
  "/review-proofs",
  authenticate,
  validate(reviewDeclarationProofsSchema),
  h.reviewDeclarationProofs,
);
// Must stay last among GET routes — a param route would otherwise shadow the
// literal "/mine" and "/pending" routes above it.
taxDeclarationRouter.get("/:userId", authenticate, h.getDeclarationForReview);
