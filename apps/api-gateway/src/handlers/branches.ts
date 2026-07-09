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

/**
 * A tenant with zero Branch rows still works exactly as before — attendance
 * geofencing falls back to TenantSettings' single office lat/long. The first
 * time anyone opens the Branches list, we seed a "Head Office" Branch from
 * those legacy fields so existing tenants see something sensible instead of
 * an empty list, without ever silently losing their old geofence config.
 */
async function backfillHeadOfficeBranch(
  tenantId: string,
  actingUserId: string,
) {
  const existing = await (prisma as any).branch.findFirst({
    where: { tenantId },
  });
  if (existing) return;

  const activeSettings = await (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!activeSettings?.officeLatitude || !activeSettings?.officeLongitude)
    return;

  await (prisma as any).branch.create({
    data: {
      tenantId,
      name: activeSettings.officeName || "Head Office",
      latitude: activeSettings.officeLatitude,
      longitude: activeSettings.officeLongitude,
      geofenceRadiusMeters: activeSettings.geofenceRadiusMeters ?? null,
      isHeadOffice: true,
      createdBy: actingUserId,
    },
  });
}

/** GET /branches */
export async function listBranches(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    await backfillHeadOfficeBranch(tenantId, req.user!.userId);
    const branches = await (prisma as any).branch.findMany({
      where: { tenantId },
      orderBy: [{ isHeadOffice: "desc" }, { createdAt: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: branches });
  } catch (error: unknown) {
    logger.error("listBranches error:", { error });
    return handleError(res, error);
  }
}

/** POST /branches */
export async function createBranch(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage branches.",
    });
  }
  try {
    const { userId } = req.user!;
    const { name, address, latitude, longitude, geofenceRadiusMeters } =
      req.body;
    const branch = await (prisma as any).branch.create({
      data: {
        tenantId,
        name,
        address: address ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        geofenceRadiusMeters: geofenceRadiusMeters ?? null,
        createdBy: userId,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Branch added.",
      data: branch,
    });
  } catch (error: unknown) {
    logger.error("createBranch error:", { error });
    return handleError(res, error);
  }
}

/** PUT /branches/:id */
export async function updateBranch(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage branches.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).branch.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Branch not found.",
      });
    }
    const {
      name,
      address,
      latitude,
      longitude,
      geofenceRadiusMeters,
      isActive,
    } = req.body;
    const updated = await (prisma as any).branch.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address ?? null }),
        ...(latitude !== undefined && { latitude: latitude ?? null }),
        ...(longitude !== undefined && { longitude: longitude ?? null }),
        ...(geofenceRadiusMeters !== undefined && {
          geofenceRadiusMeters: geofenceRadiusMeters ?? null,
        }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Branch updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateBranch error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /branches/:id — deactivates rather than deletes, so User.branchId references never dangle. */
export async function deleteBranch(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can manage branches.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).branch.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Branch not found.",
      });
    }
    await (prisma as any).branch.update({
      where: { id },
      data: { isActive: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Branch deactivated.",
    });
  } catch (error: unknown) {
    logger.error("deleteBranch error:", { error });
    return handleError(res, error);
  }
}
