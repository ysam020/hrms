import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { getKycApprovers } from "../utils/kycApprovers";

/**
 * HR-side: grants a pending edit-access request (see
 * requestKycEditAccess.ts), reopening the record for editing by moving it
 * back to Pending — the same status that already makes editKyc/submitKyc
 * reachable, so no separate "is editable" branch is needed there.
 *
 * Several people can be eligible to grant the same request (superusers,
 * permission holders, owner/admin/hr) — updateMany's status-guarded where
 * clause makes "first click wins" atomic: only one concurrent caller's
 * write actually matches kyc_approval: "Edit Requested", so a second caller
 * racing in gets count 0 and a graceful "already handled" response instead
 * of a duplicate grant.
 */
export const allowKycEdit = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { employeeId, actorUserId } = call.request;

    if (!employeeId) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const result = await prisma.user.updateMany({
      where: { id: employeeId, kyc_approval: "Edit Requested" },
      data: {
        kyc_approval: "Pending",
        kyc_edit_request_reason: null,
        kyc_edit_requested_at: null,
        // Opens the one-time edit window — submitKyc closes it again the
        // moment the employee's next self-submit lands.
        kyc_edit_window: "open",
      },
    });

    if (result.count === 0) {
      const existing = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { kyc_approval: true },
      });
      if (!existing) {
        return callback(null, {
          message: MESSAGES.EMPLOYEE_NOT_FOUND,
          status: status.NOT_FOUND,
        });
      }
      return callback(null, {
        message: MESSAGES.KYC_EDIT_ACCESS_NOT_PENDING,
        status: status.FAILED_PRECONDITION,
        kycStatus: existing.kyc_approval,
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: employeeId },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${employeeId}`),
      cacheManager.delete(
        `t:${tenantId}:employee-details:${updatedUser!.username}`,
      ),
      cacheManager.delete(`t:${tenantId}:user:v6:${employeeId}`),
      cacheManager.delete(`t:${tenantId}:user:v6:${updatedUser!.username}`),
    ]);

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("kycEditAllowed", {
        tenantId: getTenantId()!,
        title: "KYC",
        message: MESSAGES.KYC_EDIT_ALLOWED,
        targetUser: updatedUser!.username,
        eventType: "kyc_notification",
        priority: "medium",
        sendPushNotification: true,
        socketEvent: "kyc-edit-allowed",
        socketPayload: { userId: employeeId, username: updatedUser!.username },
      })
      .catch((err) =>
        logger.error("[allowKycEdit] Notification enqueue failed:", { err }),
      );

    // Tell every OTHER eligible approver this is resolved, so it disappears
    // live from their pending list instead of surfacing a stale, already-
    // handled "Allow Editing" action.
    getKycApprovers(tenantId, "request_kyc_revision")
      .then((approvers) => {
        const others = approvers.filter((a) => a.id !== actorUserId);
        if (others.length === 0) return;
        return getNotificationQueue().add("kycEditResolved", {
          tenantId: getTenantId()!,
          title: "KYC",
          message: `${updatedUser!.username}'s KYC edit-access request was already handled.`,
          pushTargets: others.map((u) => u.username),
          eventType: "kyc_notification",
          priority: "low",
          sendPushNotification: false,
          socketEvent: "kyc-edit-resolved",
          socketPayload: {
            userId: employeeId,
            username: updatedUser!.username,
          },
        });
      })
      .catch((err) =>
        logger.error("[allowKycEdit] Resolved-notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.KYC_EDIT_ALLOWED,
      status: status.OK,
      kycStatus: updatedUser!.kyc_approval,
    });
  } catch (err) {
    logger.error("AllowKycEdit error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
