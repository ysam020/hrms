import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { updateSalarySchema } from "../schemas";
import * as h from "../handlers/salary";
import { generateTdsWorksheet } from "../handlers/tdsWorksheet";
import { generateForm16 } from "../handlers/form16";

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
salaryRouter.get(
  "/generate-tds-worksheet/:userId/:year/:month",
  authenticate,
  generateTdsWorksheet,
);
salaryRouter.get(
  "/generate-form16/:userId/:financialYear",
  authenticate,
  generateForm16,
);
