import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import * as h from "../handlers/attendance";
import { addAttendanceSchema, attendanceCorrectionSchema } from "../schemas";

export const attendanceRouter: Router = Router();

attendanceRouter.post(
  "/add-attendance",
  authenticate,
  validate(addAttendanceSchema),
  h.addAttendance,
);
attendanceRouter.get(
  "/get-attendances/:month/:year",
  authenticate,
  h.getAttendances,
);
attendanceRouter.get(
  "/get-all-attendances/:year/:month",
  authenticate,
  requireSuperUser,
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
  h.attendanceInsights,
);
