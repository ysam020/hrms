import { Request, Response } from "express";
import { analyticsClient, grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";

export async function getDashboardStats(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetDashboardStats", {
      period: req.query.period || "month",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getHeadcount(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetHeadcount", {
      department: req.query.department || "",
      period: req.query.period || "current",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getAttendanceAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetAttendanceAnalytics", {
      month: req.query.month || "",
      year: req.query.year || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getLeaveAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetLeaveAnalytics", {
      month: req.query.month || "",
      year: req.query.year || "",
      department: req.query.department || "",
      leaveType: req.query.leaveType || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getRecruitmentAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(
      analyticsClient,
      "GetRecruitmentAnalytics",
      {
        period: req.query.period || "month",
        year: req.query.year || "",
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getSalaryAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetSalaryAnalytics", {
      month: req.query.month || "",
      year: req.query.year || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getTurnoverAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(analyticsClient, "GetTurnoverAnalytics", {
      year: req.query.year || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}

export async function getPerformanceAnalytics(req: Request, res: Response) {
  try {
    const response = await grpcCall(
      analyticsClient,
      "GetPerformanceAnalytics",
      {
        period: req.query.period || "quarter",
        department: req.query.department || "",
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("analytics handler error:", { error });
    return handleError(res, error);
  }
}
