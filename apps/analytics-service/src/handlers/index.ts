import { getDashboardStats } from "./getDashboardStats";
import { getAttendanceAnalytics } from "./getAttendanceAnalytics";
import { getLeaveAnalytics } from "./getLeaveAnalytics";
import { getRecruitmentAnalytics } from "./getRecruitmentAnalytics";
import { getSalaryAnalytics } from "./getSalaryAnalytics";
import { getEmployeeGrowth } from "./getEmployeeGrowth";

export const handlers = {
  GetDashboardStats: getDashboardStats,
  GetAttendanceAnalytics: getAttendanceAnalytics,
  GetLeaveAnalytics: getLeaveAnalytics,
  GetRecruitmentAnalytics: getRecruitmentAnalytics,
  GetSalaryAnalytics: getSalaryAnalytics,
  GetEmployeeGrowth: getEmployeeGrowth,
};
