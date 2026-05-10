import { Request, Response } from "express";
import { leaveClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";

async function resolveUsername(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  return user?.username ?? null;
}

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
    const username = await resolveUsername(user!.userId);
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const { from, to, leaveType, reason, sick_leave, medicalCertificate } =
      req.body;
    const response = await grpcCall(leaveClient, "applyLeave", {
      username,
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
    let username: string | undefined;

    if (superUser && req.query.username) {
      // Superusers may query any employee's leaves
      username = req.query.username as string;
    } else {
      // Everyone else can only see their own leaves
      username = (await resolveUsername(user!.userId)) ?? undefined;
    }

    const response = await grpcCall(leaveClient, "getLeaves", {
      userId: username,
      status: req.query.status || "",
      ...parsePagination(req.query),
    });
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
      const approverUsername = await resolveUsername(user!.userId);
      payload = { id: leaveId, approvedByUsername: approverUsername };
    } else if (action === "reject") {
      method = "rejectLeave";
      payload = { id: leaveId };
    } else if (action === "cancel") {
      method = "cancelLeave";
      const username = await resolveUsername(user!.userId);
      payload = { id: leaveId, username };
    } else {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid action. Use approve, reject or cancel",
      });
    }

    const response = await grpcCall(leaveClient, method, payload);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("PUT /update-leave-status error:", { error });
    return handleError(res, error);
  }
}

export async function getAvailablePaidLeaves(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const superUser = await isSuperUser(user!.userId);
    let username: string | undefined;

    if (superUser && req.params.username) {
      // Superusers may query any employee's balance
      username = String(req.params.username);
    } else {
      // Everyone else is scoped to their own balance
      username = (await resolveUsername(user!.userId)) ?? undefined;
    }

    if (!username)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const response = await grpcCall(leaveClient, "getLeaveBalance", {
      username,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("GET /get-available-paid-leaves error:", { error });
    return handleError(res, error);
  }
}
