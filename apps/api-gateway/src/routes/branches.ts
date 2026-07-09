import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/branches";
import { createBranchSchema, updateBranchSchema } from "../schemas";

export const branchesRouter: Router = Router();

branchesRouter.get("/branches", authenticate, h.listBranches);
branchesRouter.post(
  "/branches",
  authenticate,
  validate(createBranchSchema),
  h.createBranch,
);
branchesRouter.put(
  "/branches/:id",
  authenticate,
  validate(updateBranchSchema),
  h.updateBranch,
);
branchesRouter.delete("/branches/:id", authenticate, h.deleteBranch);
