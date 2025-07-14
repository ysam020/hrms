import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import schedule from "node-schedule";
import login from "../controllers/auth/login.mjs";
import logout from "../controllers/auth/logout.mjs";
import logoutFromAllSessions from "../controllers/auth/logoutFromAllSessions.mjs";
import resetPassword from "../controllers/auth/resetPassword.mjs";
import enableTwoFactor from "../controllers/auth/enableTwoFactor.mjs";
import disableTwoFactor from "../controllers/auth/disableTwoFactor.mjs";
import sendForgotPasswordOtp from "../controllers/auth/sendForgotPasswordOtp.mjs";
import updatePassword from "../controllers/auth/updatePassword.mjs";
import verifyUser from "../controllers/auth/verifyUser.mjs";
import resetBlockedAccounts from "../controllers/auth/resetBlockedAccounts.mjs";
import requestNewBackupCodes from "../controllers/auth/requestNewBackupCodes.mjs";
import sendBackupCodesMail from "../controllers/auth/sendBackupCodesMail.mjs";
import getSessionData from "../controllers/auth/getSessionData.mjs";
import deleteBackupCodes from "../controllers/auth/deleteBackupCodes.mjs";
import unusualLoginDetection from "../controllers/auth/unusualLoginDetection.mjs";

const router = express.Router();

router.post("/api/login", login);
router.get("/api/logout", logout);
router.get(
  "/api/logout-from-all-sessions",
  isAuthenticated,
  logoutFromAllSessions
);
router.put("/api/reset-password", isAuthenticated, resetPassword),
  router.get("/api/enable-two-factor", isAuthenticated, enableTwoFactor),
  router.delete("/api/disable-two-factor", isAuthenticated, disableTwoFactor),
  router.post("/api/send-forgot-password-otp", sendForgotPasswordOtp);
router.put("/api/update-password", updatePassword);
router.get("/api/verify-user", isAuthenticated, verifyUser);
router.get(
  "/api/request-new-backup-codes",
  isAuthenticated,
  requestNewBackupCodes
);
router.get(
  "/api/send-backup-codes-email",
  isAuthenticated,
  sendBackupCodesMail
);
router.delete("/api/delete-backup-codes", isAuthenticated, deleteBackupCodes);
router.get("/api/get-session-data", isAuthenticated, getSessionData);
router.post("/api/unusual-login-detection", unusualLoginDetection);
schedule.scheduleJob("0 0 * * *", async () => {
  // schedule.scheduleJob("*/10 * * * * *", async () => {
  const result = await resetBlockedAccounts();
  if (result.success) {
    console.log(`Scheduled job: Reset ${result.count} blocked accounts.`);
  } else {
    console.error(`Scheduled job failed: ${result.error}`);
  }
});

export default router;
