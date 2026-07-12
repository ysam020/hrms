import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { getKycApprovers } from "../utils/kycApprovers";

/**
 * Employee-initiated: asks to reopen an already-Approved KYC for editing
 * (e.g. bank account or address changed since approval). Does not unlock
 * editing by itself — see allowKycEdit.ts for the HR-side grant.
 */
export const requestKycEditAccess = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, reason } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }
    if (!reason || !String(reason).trim()) {
      return callback(null, {
        message: MESSAGES.KYC_REASON_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }
    if (user.kyc_approval !== "Approved") {
      return callback(null, {
        message: MESSAGES.KYC_NOT_APPROVED_YET,
        status: status.FAILED_PRECONDITION,
      });
    }

    const requestedAt = new Date();
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        kyc_approval: "Edit Requested",
        kyc_edit_request_reason: reason,
        kyc_edit_requested_at: requestedAt,
      },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${userId}`),
      cacheManager.delete(
        `t:${tenantId}:employee-details:${updatedUser.username}`,
      ),
      cacheManager.delete(`t:${tenantId}:user:v6:${userId}`),
      cacheManager.delete(`t:${tenantId}:user:v6:${updatedUser.username}`),
    ]);

    // Notify everyone who can actually act on this — i.e. whoever
    // allowKycEdit's own permission check (BasicKYCDetails:request_kyc_
    // revision:all, or owner/admin/hr/superuser) would let through — rather
    // than a "HUMAN RESOURCES" department string match, which doesn't
    // necessarily overlap with who's actually permitted to allow editing.
    getKycApprovers(tenantId, "request_kyc_revision")
      .then((approvers) => {
        if (approvers.length === 0) return;
        return getNotificationQueue().add("kycEditAccessRequested", {
          tenantId: getTenantId()!,
          title: "KYC",
          message: `${user.username} requested to edit their approved KYC: ${reason}`,
          recipients: approvers.map((u) => u.id),
          pushTargets: approvers.map((u) => u.username),
          eventType: "kyc_notification",
          priority: "medium",
          sendPushNotification: true,
          // Live-refresh signal for anyone with this employee's KYC page
          // open, and for the Pending Approvals widget — see
          // useSocketEvent consumers in apps/web.
          socketEvent: "kyc-edit-requested",
          socketPayload: {
            userId,
            username: user.username,
            reason,
            requestedAt: requestedAt.toISOString(),
          },
        });
      })
      .catch((err) =>
        logger.error("[requestKycEditAccess] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.KYC_EDIT_ACCESS_REQUESTED,
      status: status.OK,
      kycStatus: updatedUser.kyc_approval,
    });
  } catch (err) {
    logger.error("RequestKycEditAccess error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
