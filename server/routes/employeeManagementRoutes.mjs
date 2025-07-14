import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import editDetails from "../controllers/employeeManagement/editDetails.mjs";
import getDetails from "../controllers/employeeManagement/getEmployeeDetails.mjs";

const router = express.Router();

router.post(
  "/api/edit-employee-details",
  isAuthenticated,
  checkPermission("EmployeeManagement", "edit"),
  editDetails
);
router.get(
  "/api/get-employee-details/:username",
  isAuthenticated,
  checkPermission("EmployeeManagement", "view"),
  getDetails
);

export default router;
