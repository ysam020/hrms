import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import * as h from "../handlers/employee";

export const employeeRouter: Router = Router();

employeeRouter.put(
  "/edit-employee-details",
  authenticate,
  h.validateEditEmployee,
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
  h.validateKyc,
  h.completeKyc,
);
employeeRouter.put("/edit-kyc", authenticate, h.validateKyc, h.editKyc);
employeeRouter.post(
  "/kyc-approval",
  authenticate,
  requireSuperUser,
  h.validateKycApproval,
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
