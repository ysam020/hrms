import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addAppraisal from "../controllers/appraisals/addAppraisal.mjs";
import viewAppraisals from "../controllers/appraisals/viewAppraisals.mjs";
import deleteAppraisal from "../controllers/appraisals/deleteAppraisal.mjs";
import addFeedback from "../controllers/appraisals/addFeedback.mjs";

const router = express.Router();

router.post(
  "/api/add-appraisal",
  isAuthenticated,
  checkPermission("PerformanceAppraisal", "apply"),
  addAppraisal
);
router.get(
  "/api/view-appraisals",
  isAuthenticated,
  checkPermission("PerformanceAppraisal", "view"),
  viewAppraisals
);
router.delete(
  "/api/delete-appraisal/:username/:_id",
  isAuthenticated,
  checkPermission("PerformanceAppraisal", "delete"),
  deleteAppraisal
);
router.put(
  "/api/add-appraisal-feedback/:username/:_id",
  isAuthenticated,
  checkPermission("PerformanceAppraisal", "provide_feedback"),
  addFeedback
);

export default router;
