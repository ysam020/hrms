import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import getNotifications from "../controllers/general/getNotifications.mjs";
import getAllUsers from "../controllers/general/getAllUsers.mjs";
import addFavoriteModule from "../controllers/general/addFavoriteModule.mjs";
import getAuditLogs from "../controllers/general/getAuditLogs.mjs";
import isSuperUser from "../controllers/general/isSuperUser.mjs";
import addHoliday from "../controllers/general/addHoliday.mjs";
import viewHolidays from "../controllers/general/viewHolidays.mjs";
import deleteHoliday from "../controllers/general/deleteHoliday.mjs";
import chatbot from "../controllers/general/chatbot.mjs";

const router = express.Router();

router.get("/api/get-notifications", isAuthenticated, getNotifications);
router.get("/api/get-all-users", isAuthenticated, getAllUsers);
router.post("/api/add-favorite-module", addFavoriteModule);
router.get(
  "/api/audit-logs",
  isAuthenticated,
  checkPermission("AuditLogs", "view"),
  getAuditLogs
);
router.get("/api/is-superuser/:username", isAuthenticated, isSuperUser);
router.post(
  "/api/add-holiday",
  isAuthenticated,
  checkPermission("Holidays", "add"),
  addHoliday
);
router.get("/api/get-holidays/:year", isAuthenticated, viewHolidays);
router.put(
  "/api/delete-holiday",
  isAuthenticated,
  checkPermission("Holidays", "delete"),
  deleteHoliday
);
router.post("/api/chatbot", isAuthenticated, chatbot);

export default router;
