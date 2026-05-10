import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { saveFcmTokenSchema } from "../schemas";
import * as h from "../handlers/user";

export const userRouter: Router = Router();

userRouter.get("/get-all-users", authenticate, h.getAllUsers);
userRouter.get("/get-user-data/:username", authenticate, h.getUserData);
userRouter.put(
  "/save-fcm-token",
  authenticate,
  validate(saveFcmTokenSchema),
  h.saveFcmToken,
);
userRouter.delete(
  "/disable-push-notifications",
  authenticate,
  h.disablePushNotifications,
);
