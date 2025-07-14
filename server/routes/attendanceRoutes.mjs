import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import addAttendance from "../controllers/attendanceAndLeaves/addAttendance.mjs";
import addLeave from "../controllers/attendanceAndLeaves/addLeave.mjs";
import attendanceCorrection from "../controllers/attendanceAndLeaves/attendanceCorrection.mjs";
import getAllAttendances from "../controllers/attendanceAndLeaves/getAllAttendances.mjs";
import getAllLeaves from "../controllers/attendanceAndLeaves/getAllLeaves.mjs";
import getUserAttendances from "../controllers/attendanceAndLeaves/getUserAttendances.mjs";
import getSummary from "../controllers/attendanceAndLeaves/getSummary.mjs";
import updateLeaveStatus from "../controllers/attendanceAndLeaves/updateLeaveStatus.mjs";
import { updateMonthlyLeaveAccrual } from "../controllers/attendanceAndLeaves/updateLeaveBalance.mjs";
import getAvailablePaidLeaves from "../controllers/attendanceAndLeaves/getAvailablePaidLeaves.mjs";
import schedule from "node-schedule";
import reconcileMonthlyAttendance from "../controllers/attendanceAndLeaves/attendanceCronJob.mjs";

const router = express.Router();

router.post(
  "/api/add-attendance",
  isAuthenticated,
  checkPermission("Attendance", "mark_attendance"),
  addAttendance
);
router.post(
  "/api/add-leave",
  isAuthenticated,
  checkPermission("Leave", "apply"),
  addLeave
);
router.put(
  "/api/attendance-correction",
  isAuthenticated,
  checkPermission("Attendance", "attendance_correction"),
  attendanceCorrection
);
router.get(
  "/api/get-all-attendances/:year/:month",
  isAuthenticated,
  checkPermission("Attendance", "view"),
  getAllAttendances
);
router.get(
  "/api/get-attendances/:month/:year",
  isAuthenticated,
  getUserAttendances
);
router.get(
  "/api/get-attendance-summary/:username/:year/:month",
  isAuthenticated,
  getSummary
);
router.get(
  "/api/get-leave-applications",
  isAuthenticated,
  checkPermission("Leave", "view"),
  getAllLeaves
);
router.put(
  "/api/update-leave-status",
  isAuthenticated,
  checkPermission("Leave", (req) => req.body.status.toLowerCase()),
  updateLeaveStatus
);

router.get(
  "/api/get-available-paid-leaves",
  isAuthenticated,
  getAvailablePaidLeaves
);

schedule.scheduleJob("1 0 1 * *", async () => {
  await updateMonthlyLeaveAccrual();
});

schedule.scheduleJob("15 00 * * *", async () => {
  try {
    await reconcileMonthlyAttendance();
  } catch (error) {
    console.error("Error in attendance scheduled job:", error);
  }
});

export default router;
