import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import updateSalary from "../controllers/salaryManagement/updateSalary.mjs";
import getUserSalary from "../controllers/salaryManagement/getUserSalary.mjs";
import generateSalarySlip from "../controllers/salaryManagement/generateSalarySlip.mjs";

const router = express.Router();

// Conditional permission middleware for salary slip generation
const conditionalPermissionCheck = (req, res, next) => {
  // If user is requesting their own salary slip, skip permission check
  if (req.user.username === req.params.username) {
    return next();
  }
  // Otherwise, apply the permission check
  return checkPermission("SalaryManagement", "view_salary_slips")(
    req,
    res,
    next
  );
};

router.post(
  "/api/update-salary",
  isAuthenticated,
  checkPermission("SalaryManagement", "update_salary"),
  updateSalary
);

router.get(
  "/api/get-user-salary/:username/:year/:month",
  isAuthenticated,
  checkPermission("SalaryManagement", "view_salaries"),
  getUserSalary
);

router.get(
  "/api/generate-salary-slip/:username/:year/:month",
  isAuthenticated,
  conditionalPermissionCheck,
  generateSalarySlip
);

export default router;
