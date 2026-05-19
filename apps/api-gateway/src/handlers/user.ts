import { Request, Response } from "express";
import { userClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { camelToSnake, apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { parsePagination, PAGINATION } from "../utils/pagination";
import { handleError } from "../utils/handleError";

export async function getAllUsers(req: Request, res: Response) {
  try {
    const response = await grpcCall(userClient, "listUsers", {
      ...parsePagination(
        req.query,
        PAGINATION.DEFAULT_LIMIT_LARGE,
        PAGINATION.MAX_LIMIT_LARGE,
      ),
      search: req.query.search || "",
      role: req.query.role || "",
      department: req.query.department || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function getUserData(req: Request, res: Response) {
  const { user } = req as AuthRequest;
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

    // Append salary fields (not in the user service proto)
    const salaryData = await prisma.user.findFirst({
      where: { id: u.id },
      select: {
        salary: true,
        salaryBasicPay: true,
        salaryHra: true,
        salaryConveyance: true,
        salaryPf: true,
        salaryEsi: true,
        salaryPt: true,
      },
    });
    if (salaryData) {
      snake.salary = salaryData.salary;
      snake.salaryStructure = {
        basicPay: salaryData.salaryBasicPay,
        hra: salaryData.salaryHra,
        conveyance: salaryData.salaryConveyance,
        pf: salaryData.salaryPf,
        esi: salaryData.salaryEsi,
        pt: salaryData.salaryPt,
      };
    }

    // Strip PII that only the owner or a superuser may see
    const callerIsOwner = user?.userId === req.params.username;
    if (!callerIsOwner) {
      const caller = await prisma.user.findUnique({
        where: { id: user!.userId },
        select: { isSuperUser: true },
      });
      if (!caller?.isSuperUser) {
        delete snake.aadhar_no;
        delete snake.bank_account_no;
        delete snake.pan_no;
      }
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: response.message,
      status: response.status,
      data: snake,
    });
  } catch (error: unknown) {
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
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: "Internal Server Error",
    });
  }
}

export async function checkFaceDescriptor(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const row = await prisma.user.findUnique({
      where: { id: user!.userId },
      select: { face_descriptor: true },
    });
    const descriptor = (row?.face_descriptor as number[] | null) ?? [];
    const hasDescriptor =
      Array.isArray(descriptor) && descriptor.length === 128;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Face descriptor status fetched",
      data: {
        hasDescriptor,
        descriptor: hasDescriptor ? descriptor : null,
      },
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function saveFaceDescriptor(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { descriptor } = req.body;
    await prisma.user.update({
      where: { id: user!.userId },
      data: { face_descriptor: descriptor },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Face descriptor saved successfully",
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}
