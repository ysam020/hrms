import { Request, Response } from "express";
import { leaveClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { handleError, handleActionError } from "../utils/handleError";
import { parsePagination } from "../utils/pagination";
import { isSuperUser } from "../utils/user";
import { actOnApprovalForEntity, isPrivileged } from "./approvalChains";

export async function addLeave(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      from,
      to,
      leaveType,
      reason,
      sick_leave,
      medicalCertificate,
      unit,
      session,
      shortLeaveHours,
    } = req.body;
    const response = await grpcCall(leaveClient, "applyLeave", {
      userId: user!.userId,
      leaveType,
      from,
      to,
      reason: reason || "",
      sickLeave: sick_leave || false,
      medicalCertificate: medicalCertificate || "",
      unit: unit || "full_day",
      session: session || "",
      shortLeaveHours: shortLeaveHours || 0,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("POST /add-leave error:", { error });
    return handleError(res, error);
  }
}

export async function getLeaveApplications(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  const { user } = authReq;
  try {
    const privileged = await isPrivileged(authReq);
    let userId: string | undefined;

    if (privileged && req.query.userId) {
      userId = req.query.userId as string;
    } else if (privileged && req.query.search) {
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
    } else if (!privileged) {
      userId = user!.userId;
    }

    const response = (await grpcCall(leaveClient, "getLeaves", {
      userId,
      status: req.query.status || "",
      futureOnly: req.query.futureOnly === "true",
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
  const authReq = req as AuthRequest;
  const { user } = authReq;
  try {
    const { action, leaveId, reason } = req.body;
    if (!leaveId || !action)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "leaveId and action are required",
      });

    if (action === "approve" || action === "reject") {
      // Every leave application gets an Approval Chain instance at apply
      // time (see leave-service/applyLeave.ts), so the decision is recorded
      // against that instance instead of calling approveLeave/rejectLeave
      // directly — this is what enforces that only the resolved approver
      // (or an owner/admin/superuser) can act, and lets a multi-step chain
      // forward to the next approver instead of finalizing immediately.
      const tenantId = user!.tenantId;
      if (!tenantId) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: "No active tenant.",
        });
      }
      const privileged = await isPrivileged(authReq);
      const result = await actOnApprovalForEntity(
        tenantId,
        "leave",
        leaveId,
        user!.userId,
        action === "approve" ? "approved" : "rejected",
        reason || undefined,
        privileged,
      );
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: result.isFinal
          ? `Leave ${result.finalStatus}.`
          : "Approved — forwarded to the next approver.",
        data: result,
      });
    }

    if (action === "cancel") {
      // If the leave is still Pending this cancels immediately; if it's
      // already Approved, leave-service instead requests cancellation and
      // routes it through the Approval Chain (module "leave").
      //
      // userId is omitted entirely for a privileged caller withdrawing on
      // someone else's behalf — cancelLeave's ownership check
      // (leave.userId !== userId) only runs when userId is present, so
      // sending the privileged caller's own id here would always trip it
      // and reject a withdrawal this route just authorized above.
      const privileged = await isPrivileged(authReq);
      const response = (await grpcCall(leaveClient, "cancelLeave", {
        id: leaveId,
        ...(privileged ? {} : { userId: user!.userId }),
        reason: reason || "",
      })) as any;
      return apiResponse(res, grpcToHttpStatus(response.status), response);
    }

    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Invalid action. Use approve, reject or cancel",
    });
  } catch (error) {
    logger.error("PUT /update-leave-status error:", { error });
    return handleActionError(res, error);
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
