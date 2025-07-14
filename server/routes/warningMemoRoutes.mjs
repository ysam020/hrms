import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addWarningMemo from "../controllers/warningMemo/addWarningMemo.mjs";
import viewWarningMemos from "../controllers/warningMemo/viewWarningMemos.mjs";
import deleteWarningMemo from "../controllers/warningMemo/deleteWarningMemo.mjs";
import acknowledgeMemo from "../controllers/warningMemo/acknowledgeMemo.mjs";

const router = express.Router();

router.post(
  "/api/add-warning-memo",
  isAuthenticated,
  checkPermission("WarningMemo", "issue_warning_memo"),
  addWarningMemo
);
router.get(
  "/api/view-warning-memos",
  isAuthenticated,
  checkPermission("WarningMemo", "view_warning_memo"),
  viewWarningMemos
);
router.delete(
  "/api/delete-warning-memo/:username/:_id",
  isAuthenticated,
  checkPermission("WarningMemo", "delete_warning_memo"),
  deleteWarningMemo
);
router.put(
  "/api/acknowledge-warning-memo/:username/:_id",
  isAuthenticated,
  checkPermission("WarningMemo", "delete_warning_memo"),
  acknowledgeMemo
);

export default router;
