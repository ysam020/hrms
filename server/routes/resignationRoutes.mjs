import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addResignation from "../controllers/resignation/addResignation.mjs";
import viewResignations from "../controllers/resignation/viewResignations.mjs";
import addExitFeedback from "../controllers/resignation/addExitFeedback.mjs";
import withdrawResignation from "../controllers/resignation/withdrawResignation.mjs";
import approveResignation from "../controllers/resignation/approveResignation.mjs";
import rejectResignation from "../controllers/resignation/rejectResignation.mjs";
import updateResignationStatus from "../controllers/resignation/updateResignation.mjs";

const router = express.Router();

router.post(
  "/api/add-resignation",
  isAuthenticated,
  checkPermission("ResignationProcess", "resign"),
  addResignation
);
router.get(
  "/api/view-resignations",
  isAuthenticated,
  checkPermission("ResignationProcess", "view_resignation"),
  viewResignations
);
router.post(
  "/api/add-exit-feedback",
  isAuthenticated,
  checkPermission("ResignationProcess", "add_exit_feedback"),
  addExitFeedback
);
router.put(
  "/api/withdraw-resignation/:_id",
  isAuthenticated,
  checkPermission("ResignationProcess", "withdraw_resignation"),
  withdrawResignation
);
router.put(
  "/api/approve-resignation/:_id",
  isAuthenticated,
  checkPermission("ResignationProcess", "approve_resignation"),
  approveResignation
);
router.put(
  "/api/reject-resignation/:_id",
  isAuthenticated,
  checkPermission("ResignationProcess", "reject_resignation"),
  rejectResignation
);
router.put(
  "/api/update-resignation/:_id",
  isAuthenticated,
  checkPermission("ResignationProcess", "update_resignation_status"),
  updateResignationStatus
);

export default router;
