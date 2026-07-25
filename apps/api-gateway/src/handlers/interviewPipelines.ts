import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import {
  apiResponse,
  RESPONSE_STATUS,
  hasPrivilegedRole,
  HR_ROLES,
} from "@hrms/common";
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
  if (superUser || hasPrivilegedRole(tenantRole ?? "", HR_ROLES)) {
    return true;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return (user?.permissions ?? []).includes(
    "Organisation:edit_organisation_settings",
  );
}

/** GET /interview-pipeline-templates */
export async function listInterviewPipelineTemplates(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const templates = await (prisma as any).interviewPipelineTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: templates });
  } catch (error: unknown) {
    logger.error("listInterviewPipelineTemplates error:", { error });
    return handleError(res, error);
  }
}

/** POST /interview-pipeline-templates */
export async function createInterviewPipelineTemplate(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure interview pipelines.",
    });
  }
  try {
    const { userId } = req.user!;
    const { name, stages, isDefault } = req.body;

    if (isDefault) {
      await (prisma as any).interviewPipelineTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await (prisma as any).interviewPipelineTemplate.create({
      data: {
        tenantId,
        name,
        stages,
        isDefault: !!isDefault,
        createdBy: userId,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pipeline template created.",
      data: template,
    });
  } catch (error: unknown) {
    logger.error("createInterviewPipelineTemplate error:", { error });
    return handleError(res, error);
  }
}

/** PUT /interview-pipeline-templates/:id */
export async function updateInterviewPipelineTemplate(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure interview pipelines.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).interviewPipelineTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Template not found.",
      });
    }

    const { name, stages, isDefault, isActive } = req.body;
    if (isDefault === true) {
      await (prisma as any).interviewPipelineTemplate.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await (prisma as any).interviewPipelineTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(stages !== undefined && { stages }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pipeline template updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateInterviewPipelineTemplate error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /interview-pipeline-templates/:id — deactivates rather than deletes. */
export async function deleteInterviewPipelineTemplate(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure interview pipelines.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).interviewPipelineTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Template not found.",
      });
    }
    await (prisma as any).interviewPipelineTemplate.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pipeline template removed.",
    });
  } catch (error: unknown) {
    logger.error("deleteInterviewPipelineTemplate error:", { error });
    return handleError(res, error);
  }
}
