import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  editEmployeeDetailsSchema,
  completeKycSchema,
  kycApprovalSchema,
} from "../schemas";
import * as h from "../handlers/employee";

export const employeeRouter: Router = Router();

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
  requireSuperUser,
  validate(kycApprovalSchema),
  h.kycApproval,
);
employeeRouter.get(
  "/view-all-kycs",
  authenticate,
  requireSuperUser,
  h.viewAllKycs,
);
employeeRouter.get(
  "/get-kyc-insights",
  authenticate,
  requireSuperUser,
  h.getKycInsights,
);
