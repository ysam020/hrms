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

// ─── Checklist item definitions (tenant-level config) ──────────────────────────

/** GET /exit-checklist-item-defs */
export async function listExitChecklistDefs(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const defs = await (prisma as any).exitChecklistItemDef.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: defs });
  } catch (error: unknown) {
    logger.error("listExitChecklistDefs error:", { error });
    return handleError(res, error);
  }
}

/** POST /exit-checklist-item-defs */
export async function createExitChecklistDef(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure the exit checklist.",
    });
  }
  try {
    const def = await (prisma as any).exitChecklistItemDef.create({
      data: { tenantId, ...req.body },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Checklist item added.",
      data: def,
    });
  } catch (error: unknown) {
    logger.error("createExitChecklistDef error:", { error });
    return handleError(res, error);
  }
}

/** PUT /exit-checklist-item-defs/:id */
export async function updateExitChecklistDef(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure the exit checklist.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).exitChecklistItemDef.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Item not found.",
      });
    }
    const updated = await (prisma as any).exitChecklistItemDef.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Checklist item updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateExitChecklistDef error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /exit-checklist-item-defs/:id — deactivates rather than deletes. */
export async function deleteExitChecklistDef(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure the exit checklist.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).exitChecklistItemDef.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Item not found.",
      });
    }
    await (prisma as any).exitChecklistItemDef.update({
      where: { id },
      data: { isActive: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Checklist item removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteExitChecklistDef error:", { error });
    return handleError(res, error);
  }
}

// ─── Per-resignation checklist status ──────────────────────────────────────────

/** GET /resignations/:id/checklist — defs joined with this resignation's status. */
export async function getResignationChecklist(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { id: resignationId } = req.params as { id: string };

    const resignation = await (prisma as any).resignation.findFirst({
      where: { id: resignationId, tenantId },
      select: { userId: true },
    });
    if (!resignation) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found.",
      });
    }
    if (resignation.userId !== userId && !(await isPrivileged(req))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only view your own exit checklist.",
      });
    }

    const [defs, statuses] = await Promise.all([
      (prisma as any).exitChecklistItemDef.findMany({
        where: { tenantId, isActive: true },
        orderBy: { order: "asc" },
      }),
      (prisma as any).exitChecklistItemStatus.findMany({
        where: { resignationId, tenantId },
      }),
    ]);
    const statusByDef = new Map(statuses.map((s: any) => [s.itemDefId, s]));
    const merged = defs.map((def: any) => ({
      itemDefId: def.id,
      label: def.label,
      owningRole: def.owningRole,
      isRequired: def.isRequired,
      isComplete: (statusByDef.get(def.id) as any)?.isComplete ?? false,
      completedBy: (statusByDef.get(def.id) as any)?.completedBy ?? null,
      completedAt: (statusByDef.get(def.id) as any)?.completedAt ?? null,
      notes: (statusByDef.get(def.id) as any)?.notes ?? null,
    }));
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: merged });
  } catch (error: unknown) {
    logger.error("getResignationChecklist error:", { error });
    return handleError(res, error);
  }
}

/** PUT /resignations/:id/checklist/:itemDefId */
export async function updateResignationChecklistItem(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can update exit clearance.",
    });
  }
  try {
    const { userId } = req.user!;
    const { id: resignationId, itemDefId } = req.params as {
      id: string;
      itemDefId: string;
    };
    const { isComplete, notes } = req.body;

    const status = await (prisma as any).exitChecklistItemStatus.upsert({
      where: { resignationId_itemDefId: { resignationId, itemDefId } },
      update: {
        isComplete,
        notes: notes ?? null,
        completedBy: isComplete ? userId : null,
        completedAt: isComplete ? new Date() : null,
      },
      create: {
        tenantId,
        resignationId,
        itemDefId,
        isComplete,
        notes: notes ?? null,
        completedBy: isComplete ? userId : null,
        completedAt: isComplete ? new Date() : null,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Checklist item updated.",
      data: status,
    });
  } catch (error: unknown) {
    logger.error("updateResignationChecklistItem error:", { error });
    return handleError(res, error);
  }
}
