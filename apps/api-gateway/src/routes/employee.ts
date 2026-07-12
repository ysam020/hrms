import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  editEmployeeDetailsSchema,
  completeKycSchema,
  kycApprovalSchema,
  requestKycEditAccessSchema,
} from "../schemas";
import * as h from "../handlers/employee";

export const employeeRouter: Router = Router();

// No requireSuperUser guard here — editEmployeeDetails itself admits
// owner/admin/superuser OR explicit EmployeeManagement:edit permission
// holders (see isPrivileged check inside the handler).
employeeRouter.put(
  "/edit-employee-details",
  authenticate,
  validate(editEmployeeDetailsSchema),
  h.editEmployeeDetails,
);
employeeRouter.get(
  "/get-employee-details/:username",
  authenticate,
  h.getEmployeeDetails,
);
// Aggregate counts only (no per-employee PII) — shared by the Dashboard
// widgets (visible to everyone) and the Employee Management "Insights" tab
// (frontend-gated to HR+ there), so this stays open to any authenticated user.
employeeRouter.get("/employee-insights", authenticate, h.employeeInsights);
employeeRouter.post(
  "/complete-kyc",
  authenticate,
  validate(completeKycSchema),
  h.completeKyc,
);
employeeRouter.put(
  "/edit-kyc",
  authenticate,
  validate(completeKycSchema),
  h.editKyc,
);
employeeRouter.post(
  "/kyc-approval",
  authenticate,
  validate(kycApprovalSchema),
  h.kycApproval,
);
employeeRouter.get("/view-all-kycs", authenticate, h.viewAllKycs);
// Aggregate counts only (no per-employee PII) — shared by the Dashboard KYC
// Status widget (visible to everyone) and the KYC "Insights" tab
// (frontend-gated to HR+ there), so this stays open to any authenticated user.
employeeRouter.get("/get-kyc-insights", authenticate, h.getKycInsights);
employeeRouter.post(
  "/request-kyc-edit-access",
  authenticate,
  validate(requestKycEditAccessSchema),
  h.requestKycEditAccess,
);
employeeRouter.put("/allow-kyc-edit", authenticate, h.allowKycEdit);
employeeRouter.get(
  "/kyc-approvals/pending",
  authenticate,
  h.listPendingKycActions,
);
