import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/notification";

export const notificationRouter: Router = Router();

notificationRouter.get("/get-notifications", authenticate, h.getNotifications);
notificationRouter.put(
  "/clear-notification/:_id",
  authenticate,
  h.clearNotification,
);
notificationRouter.put(
  "/clear-all-notifications",
  authenticate,
  h.clearAllNotifications,
);
