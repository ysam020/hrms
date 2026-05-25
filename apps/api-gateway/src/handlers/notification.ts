import { Request, Response } from "express";
import { notificationClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";

export async function getNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall(notificationClient, "getNotifications", {
      userId: user!.userId,
      unreadOnly: req.query.unreadOnly === "true",
      ...parsePagination(req.query, 50),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /get-notifications error:", { error });
    return handleError(res, error);
  }
}

export async function clearNotification(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall(notificationClient, "markAsRead", {
      userId: user!.userId,
      notificationIds: [req.params._id],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("PUT /clear-notification error:", { error });
    return handleError(res, error);
  }
}

export async function clearAllNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall(notificationClient, "markAllAsRead", {
      userId: user!.userId,
      notificationIds: [],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("PUT /clear-all-notifications error:", { error });
    return handleError(res, error);
  }
}
