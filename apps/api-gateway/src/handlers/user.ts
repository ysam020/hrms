import { Request, Response } from "express";
import { userClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { camelToSnake, apiResponse, RESPONSE_STATUS } from "@hrms/common";

export async function getAllUsers(req: Request, res: Response) {
  try {
    const response = await grpcCall(userClient, "listUsers", {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
      search: req.query.search || "",
      role: req.query.role || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getUserData(req: Request, res: Response) {
  try {
    const response = (await grpcCall(userClient, "getUser", {
      userId: req.params.username,
    })) as any;
    if (!response.data)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);

    const u = response.data;
    const snake = camelToSnake(u);
    snake.role = u.role ? u.role.split(",").filter(Boolean) : [];
    snake.isSuperUser = u.isSuperUser;
    snake.employeeStatus = u.employeeStatus;
    snake.dateOfTermination = u.dateOfTermination;
    snake.reasonForTermination = u.reasonForTermination;
    snake.dateOfAbscond = u.dateOfAbscond;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: response.message,
      status: response.status,
      data: snake,
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function saveFcmToken(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { fcmToken, deviceFingerprint, deviceInfo } = req.body;
    const response = await grpcCall(userClient, "registerFcmToken", {
      userId: user!.userId,
      token: fcmToken || "",
      deviceFingerprint: deviceFingerprint || "",
      browser: deviceInfo?.browser || "",
      os: deviceInfo?.os || "",
      deviceType: deviceInfo?.deviceType || "",
      ipAddress: req.ip || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function disablePushNotifications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { deviceFingerprint, disableAll } = req.body;
    const response = await grpcCall(userClient, "removeFcmToken", {
      userId: user!.userId,
      deviceFingerprint: deviceFingerprint || "",
      disableAll: !!disableAll,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}
