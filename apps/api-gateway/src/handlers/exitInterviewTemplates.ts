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

const DEFAULT_QUESTIONS = [
  {
    id: "communication",
    label: "How would you rate communication within the company?",
    type: "rating",
    required: true,
  },
  {
    id: "manager_support",
    label: "How supported did you feel by your manager?",
    type: "rating",
    required: true,
  },
  {
    id: "culture",
    label: "How would you describe the overall company culture?",
    type: "text",
    required: false,
  },
  {
    id: "suggestions",
    label: "Any suggestions for improvement?",
    type: "text",
    required: false,
  },
];

/** GET /exit-interview-templates — the single active template for this tenant. */
export async function getExitInterviewTemplate(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const template = await (prisma as any).exitInterviewTemplate.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: template ?? { id: null, questions: DEFAULT_QUESTIONS },
    });
  } catch (error: unknown) {
    logger.error("getExitInterviewTemplate error:", { error });
    return handleError(res, error);
  }
}

/** PUT /exit-interview-templates — replaces the active template's question set. */
export async function updateExitInterviewTemplate(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can configure the exit interview.",
    });
  }
  try {
    const { userId } = req.user!;
    const { questions } = req.body;

    const existing = await (prisma as any).exitInterviewTemplate.findFirst({
      where: { tenantId, isActive: true },
    });
    const template = existing
      ? await (prisma as any).exitInterviewTemplate.update({
          where: { id: existing.id },
          data: { questions },
        })
      : await (prisma as any).exitInterviewTemplate.create({
          data: { tenantId, questions, createdBy: userId },
        });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Exit interview questions updated.",
      data: template,
    });
  } catch (error: unknown) {
    logger.error("updateExitInterviewTemplate error:", { error });
    return handleError(res, error);
  }
}

/** POST /resignations/:id/exit-interview-response */
export async function submitExitInterviewResponse(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { userId } = req.user!;
    const { id: resignationId } = req.params as { id: string };
    const { answers } = req.body;

    const resignation = await (prisma as any).resignation.findFirst({
      where: { id: resignationId, tenantId },
    });
    if (!resignation) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Resignation not found.",
      });
    }
    if (resignation.userId !== userId && !(await isPrivileged(req))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You can only submit exit feedback for your own resignation.",
      });
    }

    const template = await (prisma as any).exitInterviewTemplate.findFirst({
      where: { tenantId, isActive: true },
    });

    const existing = await (prisma as any).exitInterviewResponse.findFirst({
      where: { resignationId },
    });
    const response = existing
      ? await (prisma as any).exitInterviewResponse.update({
          where: { id: existing.id },
          data: { answers, submittedOn: new Date() },
        })
      : await (prisma as any).exitInterviewResponse.create({
          data: {
            tenantId,
            resignationId,
            templateId: template?.id ?? "default",
            answers,
          },
        });

    await (prisma as any).resignation.update({
      where: { id: resignationId },
      data: { feedbackSubmittedOn: new Date() },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Exit interview submitted.",
      data: response,
    });
  } catch (error: unknown) {
    logger.error("submitExitInterviewResponse error:", { error });
    return handleError(res, error);
  }
}
