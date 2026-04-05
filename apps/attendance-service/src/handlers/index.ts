import { markAttendance } from "./markAttendance";
import { getAttendance } from "./getAttendance";
import { getAttendanceSummary } from "./getAttendanceSummary";
import { getTodayAttendance } from "./getTodayAttendance";
import { correctAttendance } from "./correctAttendance";

export const handlers = {
  MarkAttendance: markAttendance,
  GetAttendance: getAttendance,
  GetAttendanceSummary: getAttendanceSummary,
  GetTodayAttendance: getTodayAttendance,
  CorrectAttendance: correctAttendance,
};
