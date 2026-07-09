import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";

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

/** POST /attendance/:recordId/breaks — start a break on today's attendance record. */
export async function startBreak(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId, tenantRole } = req.user!;
    const { recordId } = req.params as { recordId: string };
    const { breakType, isPaid } = req.body;

    const record = await (prisma as any).attendanceRecord.findFirst({
      where: { id: recordId, tenantId },
    });
    if (!record) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Attendance record not found.",
      });
    }
    const superUser = await isSuperUser(userId);
    const isPrivileged =
      superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
    if (!isPrivileged && record.userId !== userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only log breaks on your own attendance record.",
      });
    }

    const open = await (prisma as any).attendanceBreak.findFirst({
      where: { attendanceRecordId: recordId, endTime: null },
    });
    if (open) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "A break is already in progress — end it before starting another.",
      });
    }

    const brk = await (prisma as any).attendanceBreak.create({
      data: {
        tenantId,
        attendanceRecordId: recordId,
        breakType,
        isPaid,
        startTime: new Date(),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Break started.",
      data: brk,
    });
  } catch (error: unknown) {
    logger.error("startBreak error:", { error });
    return handleError(res, error);
  }
}

/** PUT /attendance/breaks/:id/end */
export async function endBreak(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId, tenantRole } = req.user!;
    const { id } = req.params as { id: string };

    const brk = await (prisma as any).attendanceBreak.findFirst({
      where: { id, tenantId },
    });
    if (!brk) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Break not found.",
      });
    }
    if (brk.endTime) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Break already ended.",
      });
    }

    const record = await (prisma as any).attendanceRecord.findUnique({
      where: { id: brk.attendanceRecordId },
    });
    const superUser = await isSuperUser(userId);
    const isPrivileged =
      superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
    if (!isPrivileged && record?.userId !== userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only end your own break.",
      });
    }

    const endTime = new Date();
    const durationMinutes =
      Math.round(
        ((endTime.getTime() - new Date(brk.startTime).getTime()) / 60000) * 10,
      ) / 10;

    const updated = await (prisma as any).attendanceBreak.update({
      where: { id },
      data: { endTime, durationMinutes },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Break ended.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("endBreak error:", { error });
    return handleError(res, error);
  }
}
