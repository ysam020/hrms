import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/leave";
import {
  addLeaveSchema,
  updateLeaveStatusSchema,
  bulkUpdateLeaveStatusSchema,
} from "../schemas";

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
leaveRouter.put(
  "/bulk-update-leave-status",
  authenticate,
  validate(bulkUpdateLeaveStatusSchema),
  h.bulkUpdateLeaveStatus,
);
leaveRouter.get(
  "/get-available-paid-leaves/:userId?",
  authenticate,
  h.getAvailablePaidLeaves,
);
