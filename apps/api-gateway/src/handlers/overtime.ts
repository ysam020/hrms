import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { instantiateApproval } from "@hrms/approval-engine";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";
import { getActiveSettings } from "./tenantSettings";

function requireTenantId(req: AuthRequest, res: Response): string | null {
  const { tenantId } = req.user!;
  if (!tenantId) {
    apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
    return null;
  }
  return tenantId;
}

/**
 * POST /overtime-requests
 * When the tenant hasn't turned on `overtimePreApprovalRequired`, this still
 * records the request (useful for reporting) but auto-approves it immediately
 * — matching today's implicit behavior where overtime just isn't tracked at
 * all, i.e. nothing blocks it.
 */
export async function requestOvertime(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { date, plannedHours, reason } = req.body;

    const existing = await (prisma as any).overtimeRequest.findFirst({
      where: { tenantId, userId, date: new Date(date) },
    });
    if (existing) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "An overtime request for this date already exists.",
      });
    }

    const settings = await getActiveSettings(tenantId);
    const preApprovalRequired = settings?.overtimePreApprovalRequired ?? false;

    const overtimeRequest = await (prisma as any).overtimeRequest.create({
      data: {
        tenantId,
        userId,
        date: new Date(date),
        plannedHours,
        reason: reason ?? null,
        status: preApprovalRequired ? "Pending" : "Approved",
        ...(preApprovalRequired ? {} : { approvedAt: new Date() }),
      },
    });

    if (preApprovalRequired) {
      await instantiateApproval(
        tenantId,
        "overtime",
        overtimeRequest.id,
        userId,
        {
          plannedHours,
        },
      );
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: preApprovalRequired
        ? "Overtime request submitted for approval."
        : "Overtime logged.",
      data: overtimeRequest,
    });
  } catch (error: unknown) {
    logger.error("requestOvertime error:", { error });
    return handleError(res, error);
  }
}

/** GET /overtime-requests?userId=... */
export async function listOvertimeRequests(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId: requesterId, tenantRole } = req.user!;
    const { userId: queryUserId } = req.query as { userId?: string };
    const superUser = await isSuperUser(requesterId);
    const isPrivileged =
      superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
    const targetUserId =
      isPrivileged && queryUserId ? queryUserId : requesterId;

    const requests = await (prisma as any).overtimeRequest.findMany({
      where: {
        tenantId,
        ...(isPrivileged && !queryUserId ? {} : { userId: targetUserId }),
      },
      orderBy: { date: "desc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: requests });
  } catch (error: unknown) {
    logger.error("listOvertimeRequests error:", { error });
    return handleError(res, error);
  }
}
