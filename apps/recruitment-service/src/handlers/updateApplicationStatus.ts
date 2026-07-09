import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const updateApplicationStatus = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, applicationStatus } = call.request;

    if (!id || !applicationStatus) {
      return callback(null, {
        message: MESSAGES.APPLICATION_ID_STATUS_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id },
    });
    if (!application) {
      return callback(null, {
        message: MESSAGES.APPLICATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updatedApplication = await prisma.jobApplication.update({
      where: { id },
      data: { status: applicationStatus },
    });

    // If hired, increment candidatesHired on the job opening
    if (applicationStatus === "Hired" && application.jobTitleId) {
      await prisma.jobOpening.update({
        where: { id: application.jobTitleId },
        data: { candidatesHired: { increment: 1 } },
      });
    }

    const tenantId = getTenantId();
    await cacheManager.invalidatePattern(`t:${tenantId}:applications:*`);
    // Hiring also changes job openings counts
    if (applicationStatus === "Hired")
      await cacheManager.invalidatePattern(`t:${tenantId}:jobOpenings:*`);

    // Notify HR (fire-and-forget)
    prisma.user
      .findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      })
      .then((hrUsers) => {
        if (hrUsers.length === 0) return;
        return getNotificationQueue().add("applicationStatusUpdated", {
          title: "Recruitment",
          message: `Interview status updated: ${updatedApplication.name} - ${applicationStatus}`,
          recipients: hrUsers.map((u) => u.id),
          pushTargets: hrUsers.map((u) => u.username),
          eventType: "interview_status_update",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.error("[updateApplicationStatus] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.APPLICATION_STATUS_UPDATED,
      status: status.OK,
      data: {
        id: updatedApplication.id,
        jobTitleId: updatedApplication.jobTitleId || "",
        name: updatedApplication.name || "",
        email: updatedApplication.email || "",
        mobile: updatedApplication.mobile || "",
        resume: updatedApplication.resume || "",
        status: updatedApplication.status || "",
        appliedAt: "",
        resumeScore: updatedApplication.resumeScore ?? 0,
        aiNotes: updatedApplication.aiNotes || "",
      },
    });
  } catch (err) {
    logger.error("UpdateApplicationStatus error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
