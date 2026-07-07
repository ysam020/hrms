import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/payroll";
import {
  initiatePayrollRunSchema,
  updatePayrollRunStatusSchema,
  requestSalaryAdvanceSchema,
  updateSalaryAdvanceStatusSchema,
} from "../schemas";

export const payrollRouter: Router = Router();

// ── Payroll Runs ─────────────────────────────────────────────────────────────
payrollRouter.post(
  "/runs",
  authenticate,
  validate(initiatePayrollRunSchema),
  h.initiatePayrollRun,
);
payrollRouter.get("/runs", authenticate, h.listPayrollRuns);
payrollRouter.get("/runs/:runId", authenticate, h.getPayrollRun);
payrollRouter.patch(
  "/runs/status",
  authenticate,
  validate(updatePayrollRunStatusSchema),
  h.updatePayrollRunStatus,
);

// ── Salary Advances ───────────────────────────────────────────────────────────
payrollRouter.post(
  "/advances",
  authenticate,
  validate(requestSalaryAdvanceSchema),
  h.requestSalaryAdvance,
);
payrollRouter.get("/advances", authenticate, h.listSalaryAdvances);
payrollRouter.patch(
  "/advances/status",
  authenticate,
  validate(updateSalaryAdvanceStatusSchema),
  h.updateSalaryAdvanceStatus,
);

// ── Self-service ──────────────────────────────────────────────────────────────
payrollRouter.get("/my-payslips", authenticate, h.getMyPayslips);
