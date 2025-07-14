import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addHrActivity from "../controllers/hrActivities/addHrActivity.mjs";
import getHrActivities from "../controllers/hrActivities/getHrActivities.mjs";
import deleteHrActivity from "../controllers/hrActivities/deleteHrActivity.mjs";
import editHrActivity from "../controllers/hrActivities/editHrActivity.mjs";

const router = express.Router();

router.post(
  "/api/add-hr-activity",
  isAuthenticated,
  checkPermission("HRActivities", "create"),
  addHrActivity
);
router.get("/api/get-hr-activities", isAuthenticated, getHrActivities);
router.delete(
  "/api/delete-hr-activity/:_id",
  isAuthenticated,
  checkPermission("HRActivities", "delete"),
  deleteHrActivity
);
router.put(
  "/api/edit-hr-activity/:_id",
  isAuthenticated,
  checkPermission("HRActivities", "edit"),
  editHrActivity
);

export default router;
