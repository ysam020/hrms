import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/leave";
import { addLeaveSchema, updateLeaveStatusSchema } from "../schemas";

export const leaveRouter: Router = Router();

leaveRouter.post(
  "/add-leave",
  authenticate,
  validate(addLeaveSchema),
  h.addLeave,
);
leaveRouter.get(
  "/get-leave-applications",
  authenticate,
  h.getLeaveApplications,
);
leaveRouter.put(
  "/update-leave-status",
  authenticate,
  validate(updateLeaveStatusSchema),
  h.updateLeaveStatus,
);
leaveRouter.get(
  "/get-available-paid-leaves/:username?",
  authenticate,
  h.getAvailablePaidLeaves,
);
