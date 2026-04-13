import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import * as h from "../handlers/leave";

export const leaveRouter: Router = Router();

leaveRouter.post("/add-leave", authenticate, h.validateAddLeave, h.addLeave);
leaveRouter.get(
  "/get-leave-applications",
  authenticate,
  h.getLeaveApplications,
);
leaveRouter.put(
  "/update-leave-status",
  authenticate,
  h.validateUpdateLeaveStatus,
  h.updateLeaveStatus,
);
leaveRouter.get(
  "/get-available-paid-leaves/:username?",
  authenticate,
  h.getAvailablePaidLeaves,
);
