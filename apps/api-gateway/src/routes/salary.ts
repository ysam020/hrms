import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { updateSalarySchema } from "../schemas";
import * as h from "../handlers/salary";

export const salaryRouter: Router = Router();

// Authorization (owner/admin/hr/superuser or SalaryManagement:update_salary)
// is enforced inside h.updateSalary itself — see canManageSalary.
salaryRouter.post(
  "/update-salary",
  authenticate,
  validate(updateSalarySchema),
  h.updateSalary,
);
salaryRouter.get(
  "/get-user-salary/:userId/:year/:month",
  authenticate,
  h.getUserSalary,
);
salaryRouter.get(
  "/generate-salary-slip/:userId/:year/:month",
  authenticate,
  h.generateSalarySlip,
);
