import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const requestKycRevision = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { employeeId, fieldIssuesJson } = call.request;

    if (!employeeId) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    let fieldIssues: Record<string, string>;
    try {
      fieldIssues = fieldIssuesJson ? JSON.parse(fieldIssuesJson) : {};
    } catch {
      fieldIssues = {};
    }
    if (Object.keys(fieldIssues).length === 0) {
      return callback(null, {
        message: MESSAGES.KYC_FIELD_ISSUES_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // An already-approved KYC is reopened only via the employee's own
    // request-edit-access -> HR-allows-editing path, not a direct revision
    // request — that path also captures the employee's stated reason.
    if (user.kyc_approval === "Approved") {
      return callback(null, {
        message: MESSAGES.KYC_ALREADY_APPROVED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: employeeId },
      data: {
        kyc_approval: "Revision Requested",
        kyc_revision_notes: fieldIssues,
      },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${employeeId}`),
      cacheManager.delete(
        `t:${tenantId}:employee-details:${updatedUser.username}`,
      ),
      // See submitKyc.ts — /get-user-data/:username reads through
      // user-service's GetUser RPC cache, keyed separately from the above.
      cacheManager.delete(`t:${tenantId}:user:v6:${employeeId}`),
      cacheManager.delete(`t:${tenantId}:user:v6:${updatedUser.username}`),
    ]);

    // Notify employee (fire-and-forget)
    const fieldList = Object.keys(fieldIssues).join(", ");
    getNotificationQueue()
      .add("kycRevisionRequested", {
        title: "KYC",
        message: `${MESSAGES.KYC_REVISION_REQUESTED}: ${fieldList}`,
        targetUser: updatedUser.username,
        eventType: "kyc_notification",
        priority: "medium",
        sendPushNotification: true,
      })
      .catch((err) =>
        logger.error("[requestKycRevision] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.KYC_REVISION_REQUESTED,
      status: status.OK,
      kycStatus: updatedUser.kyc_approval,
    });
  } catch (err) {
    logger.error("RequestKycRevision error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
