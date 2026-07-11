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

/**
 * PUT /applications/:id/advance-stage
 * Logs a new ApplicationStageEvent and advances JobApplication.currentStageOrder.
 * Does not touch the legacy `interviews` Json field — new pipelines are
 * tracked entirely through the event trail from here on.
 */
export async function advanceApplicationStage(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can advance a candidate's stage.",
    });
  }
  try {
    const { userId } = req.user!;
    const { id: applicationId } = req.params as { id: string };
    let {
      stageName,
      stageOrder,
      outcome,
      interviewerId,
      scorecards,
      bgvVendor,
      bgvResult,
      scheduledAt,
      notes,
    } = req.body;

    const application = await (prisma as any).jobApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!application) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found.",
      });
    }

    // Validate against the pipeline template snapshotted at apply-time
    // (applyForJob.ts) — without this, stageName/stageOrder/BGV requirement
    // were whatever the caller happened to send, with nothing checking they
    // matched what was actually configured for this job opening.
    if (application.pipelineTemplateId) {
      const template = await (
        prisma as any
      ).interviewPipelineTemplate.findFirst({
        where: { id: application.pipelineTemplateId, tenantId },
      });
      const stages = Array.isArray(template?.stages) ? template.stages : [];
      const configuredStage = stages.find((s: any) => s.order === stageOrder);
      if (configuredStage) {
        if (!stageName) {
          stageName = configuredStage.name;
        } else if (stageName !== configuredStage.name) {
          return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
            message: `Stage ${stageOrder} of this candidate's pipeline is "${configuredStage.name}", not "${stageName}".`,
          });
        }
        if (configuredStage.isBgvStage) {
          if (!bgvVendor) {
            return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
              message: `"${configuredStage.name}" is a background-verification stage — bgvVendor is required.`,
            });
          }
          if (outcome && outcome !== "pending" && !bgvResult) {
            return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
              message: `"${configuredStage.name}" is a background-verification stage — bgvResult is required to record an outcome.`,
            });
          }
        }
      }
    }

    const [event] = await Promise.all([
      (prisma as any).applicationStageEvent.create({
        data: {
          tenantId,
          applicationId,
          stageName,
          stageOrder,
          outcome: outcome ?? "pending",
          interviewerId: interviewerId ?? null,
          scorecards: scorecards ?? null,
          bgvVendor: bgvVendor ?? null,
          bgvResult: bgvResult ?? null,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          completedAt: outcome && outcome !== "pending" ? new Date() : null,
          notes: notes ?? null,
          createdBy: userId,
        },
      }),
      (prisma as any).jobApplication.update({
        where: { id: applicationId },
        data: { currentStageOrder: stageOrder },
      }),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Stage updated.",
      data: event,
    });
  } catch (error: unknown) {
    logger.error("advanceApplicationStage error:", { error });
    return handleError(res, error);
  }
}

/** GET /applications/:id/stage-events */
export async function listApplicationStageEvents(
  req: AuthRequest,
  res: Response,
) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { id: applicationId } = req.params as { id: string };
    const events = await (prisma as any).applicationStageEvent.findMany({
      where: { tenantId, applicationId },
      orderBy: { stageOrder: "asc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: events });
  } catch (error: unknown) {
    logger.error("listApplicationStageEvents error:", { error });
    return handleError(res, error);
  }
}

/**
 * POST /applications/bulk-advance-stage
 * For manufacturing/BPO-style bulk hiring drives — loops the same
 * single-application write rather than a new schema shape.
 */
export async function bulkAdvanceStage(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can advance candidates.",
    });
  }
  try {
    const { userId } = req.user!;
    const { applicationIds, stageName, stageOrder, outcome } = req.body as {
      applicationIds: string[];
      stageName: string;
      stageOrder: number;
      outcome?: string;
    };

    const applications = await (prisma as any).jobApplication.findMany({
      where: { id: { in: applicationIds }, tenantId },
      select: { id: true },
    });
    const validIds = applications.map((a: any) => a.id);

    await (prisma as any).applicationStageEvent.createMany({
      data: validIds.map((applicationId: string) => ({
        tenantId,
        applicationId,
        stageName,
        stageOrder,
        outcome: outcome ?? "pending",
        completedAt: outcome && outcome !== "pending" ? new Date() : null,
        createdBy: userId,
      })),
    });
    await (prisma as any).jobApplication.updateMany({
      where: { id: { in: validIds } },
      data: { currentStageOrder: stageOrder },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `${validIds.length} application(s) advanced.`,
      data: { updated: validIds.length },
    });
  } catch (error: unknown) {
    logger.error("bulkAdvanceStage error:", { error });
    return handleError(res, error);
  }
}

// ─── Offers ─────────────────────────────────────────────────────────────────────

/** GET /applications/:id/offers */
export async function listOffers(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { id: applicationId } = req.params as { id: string };
    const offers = await (prisma as any).offer.findMany({
      where: { tenantId, applicationId },
      orderBy: { version: "desc" },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: offers });
  } catch (error: unknown) {
    logger.error("listOffers error:", { error });
    return handleError(res, error);
  }
}

/** POST /applications/:id/offers — creates the next version (offer, or a revised counter). */
export async function createOffer(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  if (!(await isPrivileged(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners, admins, and HR can extend an offer.",
    });
  }
  try {
    const { userId } = req.user!;
    const { id: applicationId } = req.params as { id: string };
    const {
      designation,
      department,
      offeredCTC,
      joiningDate,
      candidateNote,
      internalNote,
    } = req.body;

    const application = await (prisma as any).jobApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!application) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Application not found.",
      });
    }

    const latest = await (prisma as any).offer.findFirst({
      where: { applicationId },
      orderBy: { version: "desc" },
    });

    const offer = await (prisma as any).offer.create({
      data: {
        tenantId,
        applicationId,
        version: (latest?.version ?? 0) + 1,
        designation: designation ?? null,
        department: department ?? null,
        offeredCTC: offeredCTC ?? null,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        candidateNote: candidateNote ?? null,
        internalNote: internalNote ?? null,
        createdBy: userId,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Offer v${offer.version} created.`,
      data: offer,
    });
  } catch (error: unknown) {
    logger.error("createOffer error:", { error });
    return handleError(res, error);
  }
}

/** PUT /offers/:id/status */
export async function updateOfferStatus(req: AuthRequest, res: Response) {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return;
  try {
    const { id } = req.params as { id: string };
    const { status: newStatus } = req.body as { status: string };

    const offer = await (prisma as any).offer.findFirst({
      where: { id, tenantId },
    });
    if (!offer) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Offer not found.",
      });
    }

    const updated = await (prisma as any).offer.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === "Sent" && { sentAt: new Date() }),
        ...(["Accepted", "Declined"].includes(newStatus) && {
          respondedAt: new Date(),
        }),
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `Offer marked ${newStatus}.`,
      data: updated,
    });
  } catch (error: unknown) {
    logger.error("updateOfferStatus error:", { error });
    return handleError(res, error);
  }
}
