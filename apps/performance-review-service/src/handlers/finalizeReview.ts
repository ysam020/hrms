import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, prisma as masterPrisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { getNotificationQueue, getEmailQueue } from "@hrms/queue";
import { tenantFrom, tenantReplyTo, renderEmailHtml } from "@hrms/common";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewProto } from "./serializers";

// Called by api-gateway's MODULE_SIDE_EFFECTS["performance_review"] once the
// approval-engine instance for this review reaches a final decision. The
// gateway (the only cross-service orchestrator in this codebase) has already
// created the new SalaryStructure via salary-service when applicable, and
// passes its id through here so it's stored on the review.
export const finalizeReview = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, approved, salaryStructureId } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.REVIEW_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.performanceReview.findUnique({
      where: { id },
    });
    if (!existing) {
      return callback(null, {
        message: MESSAGES.REVIEW_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    const updated = await prisma.performanceReview.update({
      where: { id },
      data: {
        status: approved ? "approved" : "rejected",
        salaryStructureId: salaryStructureId || null,
        finalizedAt: new Date(),
      },
    });

    // Notify the employee of the outcome (fire-and-forget, in-app + email).
    const decisionMessage = approved
      ? "Your performance review has been finalized and approved."
      : "Your performance review has been finalized and rejected.";

    getNotificationQueue()
      .add("performanceReviewFinalized", {
        tenantId: updated.tenantId,
        title: "Performance Review",
        message: decisionMessage,
        targetUser: updated.userId,
        eventType: "performance_review_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.warn("[finalizeReview] Notification enqueue failed:", { err }),
      );

    Promise.all([
      prisma.user.findUnique({
        where: { id: updated.userId },
        select: { email: true },
      }),
      masterPrisma.tenant.findUnique({
        where: { id: updated.tenantId },
        select: { name: true, helpEmail: true },
      }),
    ])
      .then(([employee, tenant]) => {
        if (!employee?.email) return;
        const tenantName = tenant?.name ?? "your organisation";
        return getEmailQueue().add("performanceReviewFinalized", {
          to: employee.email,
          subject: approved
            ? "Your performance review was approved"
            : "Your performance review was rejected",
          html: renderEmailHtml({
            title: "Performance Review Finalized",
            tenantName,
            bodyHtml: `<h2>Hello,</h2><p>${decisionMessage}</p>`,
          }),
          from: tenantFrom(tenantName),
          replyTo: tenantReplyTo(tenant?.helpEmail),
        });
      })
      .catch((err) =>
        logger.warn("[finalizeReview] email enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.REVIEW_FINALIZED,
      status: status.OK,
      data: toPerformanceReviewProto(updated),
    });
  } catch (err) {
    logger.error("FinalizeReview error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
