import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue, getResumeParsingQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const applyForJob = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { jobTitleId, name, email, mobile, resume, reason, aadharNo } =
      call.request;

    if (!jobTitleId || !name || !email) {
      return callback(null, {
        message: MESSAGES.JOB_TITLE_ID_NAME_EMAIL_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // getTenantId() is populated by resolvePublicTenant (api-gateway) from
    // the careers-link slug — guard instead of asserting non-null, since a
    // missing context would otherwise silently write the literal string
    // "undefined" into tenantId below.
    const tenantId = getTenantId();
    if (!tenantId) {
      return callback(null, {
        message: MESSAGES.TENANT_REQUIRED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const jobOpening = await prisma.jobOpening.findUnique({
      where: { id: jobTitleId },
    });
    if (!jobOpening || !["Open", "Active"].includes(jobOpening.status)) {
      return callback(null, {
        message: MESSAGES.JOB_NOT_FOUND_OR_CLOSED,
        status: status.NOT_FOUND,
      });
    }

    const existing = await prisma.jobApplication.findFirst({
      where: { jobTitleId, email },
    });
    if (existing) {
      return callback(null, {
        message: MESSAGES.ALREADY_APPLIED,
        status: status.ALREADY_EXISTS,
      });
    }

    // Snapshot the pipeline template in effect right now — jobOpening's own
    // configured template, else the tenant's default one, else none (the
    // legacy free-form `interviews` flow). Snapshotting (not just following
    // jobOpening.pipelineTemplateId live) means editing/deleting a template
    // later doesn't retroactively change what stage an in-flight candidate
    // is already partway through.
    let pipelineTemplateId = jobOpening.pipelineTemplateId ?? null;
    if (!pipelineTemplateId) {
      const defaultTemplate = await prisma.interviewPipelineTemplate.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      });
      pipelineTemplateId = defaultTemplate?.id ?? null;
    }

    const application = await prisma.jobApplication.create({
      data: {
        tenantId,
        jobTitleId,
        name,
        email,
        mobile: mobile || null,
        resume: resume || null,
        reason: reason || null,
        aadharNo: aadharNo || null,
        status: "Applied",
        pipelineTemplateId,
        currentStageOrder: 0,
      },
    });

    await cacheManager.invalidatePattern(`t:${tenantId}:applications:*`);

    // Enqueue resume scoring (fire-and-forget — worker updates DB asynchronously)
    getResumeParsingQueue()
      .add("scoreResume", { applicationId: application.id })
      .catch((err) =>
        logger.warn("[applyForJob] Resume parsing enqueue failed:", { err }),
      );

    // Notify HR + hiring manager (fire-and-forget)
    prisma.user
      .findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      })
      .then(async (hrUsers) => {
        const allTargets = [...hrUsers];
        if (jobOpening.hiringManager) {
          const hmUser = await prisma.user.findFirst({
            where: {
              OR: [
                { username: jobOpening.hiringManager },
                {
                  AND: [
                    { first_name: { not: null } },
                    { last_name: { not: null } },
                  ],
                },
              ],
            },
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
            },
          });
          if (hmUser && !allTargets.find((u) => u.id === hmUser.id))
            allTargets.push(hmUser);
        }
        if (allTargets.length === 0) return;
        return getNotificationQueue().add("jobApplicationReceived", {
          tenantId,
          title: "Recruitment",
          message: `New job application: ${name} has applied for ${jobOpening.jobTitle}`,
          recipients: allTargets.map((u) => u.id),
          pushTargets: allTargets.map((u) => u.username),
          eventType: "job_application",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.error("[applyForJob] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.APPLICATION_SUBMITTED,
      status: status.OK,
      data: {
        id: application.id,
        jobTitleId: application.jobTitleId,
        name: application.name,
        email: application.email,
        mobile: application.mobile ?? "",
        status: application.status,
        resumeScore: application.resumeScore ?? 0,
        aiNotes: application.aiNotes ?? "",
      },
    });
  } catch (err) {
    logger.error("ApplyForJob error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
