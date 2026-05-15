import { Request, Response } from "express";
import { leaveClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";

async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

export async function addLeave(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { from, to, leaveType, reason, sick_leave, medicalCertificate } =
      req.body;
    const response = await grpcCall(leaveClient, "applyLeave", {
      userId: user!.userId,
      leaveType,
      from,
      to,
      reason: reason || "",
      sickLeave: sick_leave || false,
      medicalCertificate: medicalCertificate || "",
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("POST /add-leave error:", { error });
    return handleError(res, error);
  }
}

export async function getLeaveApplications(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let userId: string | undefined;

    if (superUser && req.query.userId) {
      userId = req.query.userId as string;
    } else if (superUser && req.query.search) {
      const search = String(req.query.search);
      const found = await prisma.user.findFirst({
        where: { username: { contains: search, mode: "insensitive" } },
        select: { id: true },
      });
      if (!found) {
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
          message: "Leave applications",
          status: 0,
          data: [],
          total: 0,
        });
      }
      userId = found.id;
    } else if (!superUser) {
      userId = user!.userId;
    }

    const response = (await grpcCall(leaveClient, "getLeaves", {
      userId,
      status: req.query.status || "",
      ...parsePagination(req.query),
    })) as any;

    const records: any[] = response?.data ?? [];
    if (records.length > 0) {
      const userIds = [
        ...new Set(records.map((l: any) => l.userId).filter(Boolean)),
      ] as string[];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.username]));
      response.data = records.map((l: any) => ({
        ...l,
        username: userMap.get(l.userId) ?? l.userId,
      }));
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /get-leave-applications error:", { error });
    return handleError(res, error);
  }
}

export async function updateLeaveStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { action, leaveId } = req.body;
    if (!leaveId || !action)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "leaveId and action are required",
      });

    let method: string;
    let payload: Record<string, any>;

    if (action === "approve") {
      method = "approveLeave";
      payload = { id: leaveId, approvedById: user!.userId };
    } else if (action === "reject") {
      method = "rejectLeave";
      payload = { id: leaveId };
    } else if (action === "cancel") {
      method = "cancelLeave";
      payload = { id: leaveId, userId: user!.userId };
    } else {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid action. Use approve, reject or cancel",
      });
    }

    const response = (await grpcCall(leaveClient, method, payload)) as any;
    return apiResponse(res, grpcToHttpStatus(response.status), response);
  } catch (error: unknown) {
    logger.error("PUT /update-leave-status error:", { error });
    return handleError(res, error);
  }
}

export async function getAvailablePaidLeaves(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let userId: string;

    if (superUser && req.params.userId) {
      userId = String(req.params.userId);
    } else {
      userId = user!.userId;
    }

    const response = await grpcCall(leaveClient, "getLeaveBalance", { userId });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /get-available-paid-leaves error:", { error });
    return handleError(res, error);
  }
}
