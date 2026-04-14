import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import * as h from "../handlers/attendance";

export const attendanceRouter: Router = Router();

attendanceRouter.post("/add-attendance", authenticate, h.addAttendance);
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
  h.attendanceCorrection,
);
attendanceRouter.get(
  "/get-attendance-summary/:username/:year/:month",
  authenticate,
  h.getAttendanceSummary,
);
attendanceRouter.get(
  "/attendance-insights",
  authenticate,
  h.attendanceInsights,
);
