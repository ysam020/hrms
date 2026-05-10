import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { updateSalarySchema } from "../schemas";
import * as h from "../handlers/salary";

export const salaryRouter: Router = Router();

salaryRouter.post(
  "/update-salary",
  authenticate,
  requireSuperUser,
  validate(updateSalarySchema),
  h.updateSalary,
);
salaryRouter.get(
  "/get-user-salary/:username/:year/:month",
  authenticate,
  h.getUserSalary,
);
salaryRouter.get(
  "/generate-salary-slip/:username/:year/:month",
  authenticate,
  h.generateSalarySlip,
);
