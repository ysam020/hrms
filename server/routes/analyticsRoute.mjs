import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import getEmployeeDepartments from "../controllers/analytics/getEmployeeDepartments.mjs";
import getEmployeeDesignations from "../controllers/analytics/getEmployeeDesignations.mjs";
import getAgeDistribution from "../controllers/analytics/getAgeDistribution.mjs";
import getJoiningData from "../controllers/analytics/getJoiningData.mjs";

const router = express.Router();

router.get(
  "/api/get-employee-departments",
  isAuthenticated,
  getEmployeeDepartments
);
router.get(
  "/api/get-employee-designations",
  isAuthenticated,
  getEmployeeDesignations
);
router.get("/api/get-age-distribution", isAuthenticated, getAgeDistribution);
router.get("/api/get-joining-data", isAuthenticated, getJoiningData);

export default router;
