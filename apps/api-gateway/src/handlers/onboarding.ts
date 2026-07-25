import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS, hasPrivilegedRole } from "@hrms/common";
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
  return superUser || hasPrivilegedRole(tenantRole ?? "");
}

/** GET /onboarding-checklist */
export async function getOnboardingChecklist(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const state = await (prisma as any).onboardingChecklistState.findUnique({
      where: { tenantId },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { itemStatus: state?.itemStatus ?? {} },
    });
  } catch (error: unknown) {
    logger.error("getOnboardingChecklist error:", { error });
    return handleError(res, error);
  }
}

/** PUT /onboarding-checklist/:stepKey — body: { status: "completed" | "skipped" } */
export async function updateOnboardingChecklistItem(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can update the setup checklist.",
    });
  }
  try {
    const { stepKey } = req.params as { stepKey: string };
    const { status } = req.body as { status: "completed" | "skipped" };

    const existing = await (prisma as any).onboardingChecklistState.findUnique({
      where: { tenantId },
    });
    const itemStatus = {
      ...((existing?.itemStatus as Record<string, string>) ?? {}),
      [stepKey]: status,
    };

    const state = existing
      ? await (prisma as any).onboardingChecklistState.update({
          where: { tenantId },
          data: { itemStatus },
        })
      : await (prisma as any).onboardingChecklistState.create({
          data: { tenantId, itemStatus },
        });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Checklist updated.",
      data: { itemStatus: state.itemStatus },
    });
  } catch (error: unknown) {
    logger.error("updateOnboardingChecklistItem error:", { error });
    return handleError(res, error);
  }
}
