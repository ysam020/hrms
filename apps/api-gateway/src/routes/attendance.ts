import { Router } from "express";
import { authenticate, requireHrPrivileged } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/attendance";
import * as breaks from "../handlers/attendanceBreaks";
import {
  addAttendanceSchema,
  attendanceCorrectionSchema,
  startBreakSchema,
} from "../schemas";

export const attendanceRouter: Router = Router();

attendanceRouter.post(
  "/add-attendance",
  authenticate,
  validate(addAttendanceSchema),
  h.addAttendance,
);
attendanceRouter.get(
  "/get-attendances/:year/:month",
  authenticate,
  h.getAttendances,
);
attendanceRouter.get(
  "/get-all-attendances/:year/:month",
  authenticate,
  h.getAllAttendances,
);
attendanceRouter.put(
  "/attendance-correction",
  authenticate,
  validate(attendanceCorrectionSchema),
  h.attendanceCorrection,
);
attendanceRouter.get(
  "/get-attendance-summary/:userId/:year/:month",
  authenticate,
  h.getAttendanceSummary,
);
attendanceRouter.get(
  "/attendance-insights",
  authenticate,
  requireHrPrivileged,
  h.attendanceInsights,
);

attendanceRouter.post(
  "/attendance/:recordId/breaks",
  authenticate,
  validate(startBreakSchema),
  breaks.startBreak,
);
attendanceRouter.put(
  "/attendance/breaks/:id/end",
  authenticate,
  breaks.endBreak,
);
