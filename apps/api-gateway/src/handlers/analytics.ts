import { Request, Response } from "express";
import { z } from "zod";
import { analyticsCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";
import { validateQuery } from "../middleware/validate";

// ─── Reusable field schemas ───────────────────────────────────────────────────

const department = z.string().max(100).optional().default("");
const month = z
  .string()
  .regex(/^\d{1,2}$/, "month must be a 1-2 digit number")
  .optional()
  .default("");
const year = z
  .string()
  .regex(/^\d{4}$/, "year must be a 4-digit number")
  .optional()
  .default("");
const period = (allowed: string[]) =>
  z.enum(allowed as [string, ...string[]]).optional();

// ─── Per-endpoint query schemas ───────────────────────────────────────────────

export const dashboardStatsSchema = z.object({
  period: period(["day", "week", "month", "quarter", "year"]).default("month"),
  department,
});

export const headcountSchema = z.object({
  period: period(["current", "month", "quarter", "year"]).default("current"),
  department,
});

export const attendanceAnalyticsSchema = z.object({ month, year, department });
export const leaveAnalyticsSchema = z.object({
  month,
  year,
  department,
  leaveType: z.string().max(50).optional().default(""),
});
export const recruitmentAnalyticsSchema = z.object({
  period: period(["week", "month", "quarter", "year"]).default("month"),
  year,
});
export const salaryAnalyticsSchema = z.object({ month, year, department });
export const turnoverAnalyticsSchema = z.object({ year, department });
export const performanceAnalyticsSchema = z.object({
  period: period(["month", "quarter", "year"]).default("quarter"),
  department,
});

// ─── Middleware exports (used by the router) ──────────────────────────────────

export const validateDashboardStats = validateQuery(dashboardStatsSchema);
export const validateHeadcount = validateQuery(headcountSchema);
export const validateAttendanceAnalytics = validateQuery(
  attendanceAnalyticsSchema,
);
export const validateLeaveAnalytics = validateQuery(leaveAnalyticsSchema);
export const validateRecruitmentAnalytics = validateQuery(
  recruitmentAnalyticsSchema,
);
export const validateSalaryAnalytics = validateQuery(salaryAnalyticsSchema);
export const validateTurnoverAnalytics = validateQuery(turnoverAnalyticsSchema);
export const validatePerformanceAnalytics = validateQuery(
  performanceAnalyticsSchema,
);

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function getDashboardStats(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetDashboardStats", {
      period: (req.query.period as string) || "month",
      department: req.query.department,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getHeadcount(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetHeadcount", {
      department: req.query.department,
      period: req.query.period,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getAttendanceAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetAttendanceAnalytics", {
      month: req.query.month,
      year: req.query.year,
      department: req.query.department,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getLeaveAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetLeaveAnalytics", {
      month: req.query.month,
      year: req.query.year,
      department: req.query.department,
      leaveType: req.query.leaveType,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getRecruitmentAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetRecruitmentAnalytics", {
      period: req.query.period,
      year: req.query.year,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getSalaryAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetSalaryAnalytics", {
      month: req.query.month,
      year: req.query.year,
      department: req.query.department,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getTurnoverAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetTurnoverAnalytics", {
      year: req.query.year,
      department: req.query.department,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getPerformanceAnalytics(req: Request, res: Response) {
  try {
    const response = await analyticsCall("GetPerformanceAnalytics", {
      period: (req.query.period as string) || "quarter",
      department: req.query.department,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
