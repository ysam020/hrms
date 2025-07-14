import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import disablePushNotifications from "../controllers/pushNotifications/disablePushNotifications.mjs";
import saveFcmToken from "../controllers/pushNotifications/saveFcmToken.mjs";

const router = express.Router();

router.delete(
  "/api/disable-push-notifications",
  isAuthenticated,
  disablePushNotifications
);
router.put("/api/save-fcm-token", isAuthenticated, saveFcmToken);

export default router;
