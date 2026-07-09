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

async function isPrivileged(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  const superUser = await isSuperUser(userId);
  return superUser || ["owner", "admin", "hr"].includes(tenantRole ?? "");
}

/** GET /comp-off-credits?userId=... — HR/admin can view anyone's; employees only their own. */
export async function listCompOffCredits(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId: requesterId } = req.user!;
    const { userId: queryUserId } = req.query as { userId?: string };
    const privileged = await isPrivileged(req);
    const targetUserId = privileged && queryUserId ? queryUserId : requesterId;

    // Lazily expire anything past its expiry date so balances stay accurate
    // without a separate cron.
    await (prisma as any).compOffCredit.updateMany({
      where: {
        tenantId,
        userId: targetUserId,
        status: "available",
        expiresOn: { lt: new Date() },
      },
      data: { status: "expired" },
    });

    const credits = await (prisma as any).compOffCredit.findMany({
      where: { tenantId, userId: targetUserId },
      orderBy: { sourceDate: "desc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: credits });
  } catch (error: unknown) {
    logger.error("listCompOffCredits error:", { error });
    return handleError(res, error);
  }
}

/** POST /comp-off-credits — HR/admin manually credits an employee for a worked holiday/weekend. */
export async function createCompOffCredit(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can credit comp-off.",
    });
  }
  try {
    const { userId: createdBy } = req.user!;
    const { userId, sourceDate, earnedDays, expiresOn } = req.body;
    const credit = await (prisma as any).compOffCredit.create({
      data: {
        tenantId,
        userId,
        sourceDate: new Date(sourceDate),
        earnedDays,
        expiresOn: expiresOn ? new Date(expiresOn) : null,
        createdBy,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Comp-off credited.",
      data: credit,
    });
  } catch (error: unknown) {
    logger.error("createCompOffCredit error:", { error });
    return handleError(res, error);
  }
}
