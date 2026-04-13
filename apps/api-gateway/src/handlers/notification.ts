import { Request, Response } from "express";
import { notificationCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS, errorMessage } from "@hrms/common";

export async function getNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await notificationCall("getNotifications", {
      userId: user!.userId,
      unreadOnly: req.query.unreadOnly === "true",
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function clearNotification(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await notificationCall("markAsRead", {
      userId: user!.userId,
      notificationIds: [req.params._id],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function clearAllNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await notificationCall("markAllAsRead", {
      userId: user!.userId,
      notificationIds: [],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}
