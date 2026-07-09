import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";

async function isPrivileged(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  const superUser = await isSuperUser(userId);
  return superUser || ["owner", "admin"].includes(tenantRole ?? "");
}

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

/** GET /shifts */
export async function listShifts(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const shifts = await (prisma as any).shift.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: shifts });
  } catch (error: unknown) {
    logger.error("listShifts error:", { error });
    return handleError(res, error);
  }
}

/** POST /shifts */
export async function createShift(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage shifts.",
    });
  }
  try {
    const { userId } = req.user!;
    const {
      name,
      startHour,
      startMinute,
      endHour,
      endMinute,
      lateGracePeriodMinutes,
      fullDayMinHours,
      halfDayMinHours,
    } = req.body;
    const shift = await (prisma as any).shift.create({
      data: {
        tenantId,
        name,
        startHour,
        startMinute,
        endHour,
        endMinute,
        lateGracePeriodMinutes,
        fullDayMinHours,
        halfDayMinHours,
        createdBy: userId,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Shift added.",
      data: shift,
    });
  } catch (error: unknown) {
    logger.error("createShift error:", { error });
    return handleError(res, error);
  }
}

/** PUT /shifts/:id */
export async function updateShift(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage shifts.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).shift.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Shift not found.",
      });
    }
    const {
      name,
      startHour,
      startMinute,
      endHour,
      endMinute,
      lateGracePeriodMinutes,
      fullDayMinHours,
      halfDayMinHours,
      isActive,
      isDefault,
    } = req.body;

    // Only one default shift per tenant — unset the previous one.
    if (isDefault === true) {
      await (prisma as any).shift.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await (prisma as any).shift.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(startHour !== undefined && { startHour }),
        ...(startMinute !== undefined && { startMinute }),
        ...(endHour !== undefined && { endHour }),
        ...(endMinute !== undefined && { endMinute }),
        ...(lateGracePeriodMinutes !== undefined && { lateGracePeriodMinutes }),
        ...(fullDayMinHours !== undefined && { fullDayMinHours }),
        ...(halfDayMinHours !== undefined && { halfDayMinHours }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Shift updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateShift error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /shifts/:id — deactivates rather than deletes, so User/Team.shiftId references never dangle. */
export async function deleteShift(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage shifts.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).shift.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Shift not found.",
      });
    }
    await (prisma as any).shift.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Shift deactivated.",
    });
  } catch (error: unknown) {
    logger.error("deleteShift error:", { error });
    return handleError(res, error);
  }
}

/** PUT /shifts/:id/assign — body: { userIds?: string[], teamIds?: string[] } */
export async function assignShift(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can assign shifts.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const shift = await (prisma as any).shift.findFirst({
      where: { id, tenantId },
    });
    if (!shift) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Shift not found.",
      });
    }
    const { userIds, teamIds } = req.body as {
      userIds?: string[];
      teamIds?: string[];
    };

    const [userResult, teamResult] = await Promise.all([
      userIds?.length
        ? (prisma as any).user.updateMany({
            where: { id: { in: userIds }, tenantId },
            data: { shiftId: id },
          })
        : Promise.resolve({ count: 0 }),
      teamIds?.length
        ? (prisma as any).team.updateMany({
            where: { id: { in: teamIds }, tenantId },
            data: { shiftId: id },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Shift assigned to ${userResult.count} employee(s) and ${teamResult.count} team(s).`,
    });
  } catch (error: unknown) {
    logger.error("assignShift error:", { error });
    return handleError(res, error);
  }
}
