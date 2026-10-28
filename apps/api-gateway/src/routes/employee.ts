import { Router } from "express";
import { authenticate, requireHrPrivileged } from "../middleware/authenticate";
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
// Organisation-wide counts — HR or above only. It used to be open because
// Classic's dashboard showed it to everyone; the Today dashboard now gets its
// own permission-scoped figures from /dashboard/data (docs/dashboard-data-inventory.md).
employeeRouter.get(
  "/employee-insights",
  authenticate,
  requireHrPrivileged,
  h.employeeInsights,
);
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
// Organisation-wide KYC counts — for KYC reviewers only (HR or above, or a
// BasicKYCDetails view/approve "all" grant; enforced in the handler).
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
