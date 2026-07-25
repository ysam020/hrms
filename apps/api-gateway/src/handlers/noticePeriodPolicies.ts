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

/** GET /notice-period-policies */
export async function listNoticePeriodPolicies(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const policies = await (prisma as any).noticePeriodPolicy.findMany({
      where: { tenantId },
      orderBy: [{ priority: "desc" }, { minTenureMonths: "asc" }],
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: policies });
  } catch (error: unknown) {
    logger.error("listNoticePeriodPolicies error:", { error });
    return handleError(res, error);
  }
}

/** POST /notice-period-policies */
export async function createNoticePeriodPolicy(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message:
        "Only owners, admins, and HR can configure notice period policy.",
    });
  }
  try {
    const { userId } = req.user!;
    const policy = await (prisma as any).noticePeriodPolicy.create({
      data: { tenantId, ...req.body, createdBy: userId },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Notice period policy created.",
      data: policy,
    });
  } catch (error: unknown) {
    logger.error("createNoticePeriodPolicy error:", { error });
    return handleError(res, error);
  }
}

/** PUT /notice-period-policies/:id */
export async function updateNoticePeriodPolicy(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message:
        "Only owners, admins, and HR can configure notice period policy.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).noticePeriodPolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Policy not found.",
      });
    }
    const updated = await (prisma as any).noticePeriodPolicy.update({
      where: { id },
      data: req.body,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Notice period policy updated.",
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateNoticePeriodPolicy error:", { error });
    return handleError(res, error);
  }
}

/** DELETE /notice-period-policies/:id */
export async function deleteNoticePeriodPolicy(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message:
        "Only owners, admins, and HR can configure notice period policy.",
    });
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await (prisma as any).noticePeriodPolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Policy not found.",
      });
    }
    await (prisma as any).noticePeriodPolicy.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Policy deleted.",
    });
  } catch (error: unknown) {
    logger.error("deleteNoticePeriodPolicy error:", { error });
    return handleError(res, error);
  }
}

// Notice-period resolution itself happens in recruitment-service
// (apps/recruitment-service/src/handlers/noticePeriod.ts) at submission
// time — this file only manages the policy rows admins configure.
