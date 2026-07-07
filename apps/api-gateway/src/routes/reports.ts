import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/reports";
import { runReportSchema, saveReportSchema } from "../schemas";

export const reportsRouter: Router = Router();

// Schema introspection (must be before /:reportId to avoid route collision)
reportsRouter.get("/schema/:entity", authenticate, h.getEntitySchema);

// Ad-hoc run
reportsRouter.post(
  "/run",
  authenticate,
  validate(runReportSchema),
  h.runReport,
);

// Saved reports CRUD
reportsRouter.post(
  "/saved",
  authenticate,
  validate(saveReportSchema),
  h.saveReport,
);
reportsRouter.get("/saved", authenticate, h.listSavedReports);
reportsRouter.get("/saved/:reportId", authenticate, h.getSavedReport);
reportsRouter.post("/saved/:reportId/run", authenticate, h.runSavedReport);
reportsRouter.delete("/saved/:reportId", authenticate, h.deleteSavedReport);
