import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const rejectResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // `comments` isn't a real field on the UpdateStatusRequest proto — the
    // actual field is `remarks` (see UpdateStatusRequest in recruitment.proto).
    const { id, rejectionReason, remarks: comments } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // acting on another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id, tenantId: getTenantId() },
    });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (resignation.status !== "Submitted") {
      return callback(null, {
        message: MESSAGES.ONLY_SUBMITTED_CAN_BE_REJECTED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedResignation = await prisma.resignation.update({
      where: { id },
      data: {
        status: "Rejected",
        rejectedOn: new Date(),
        rejectionReason: rejectionReason || null,
        comments: comments || null,
        lastUpdatedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern(`t:${getTenantId()}:resignations:*`);

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("resignationRejected", {
        title: "Resignation",
        message: MESSAGES.RESIGNATION_REJECTED,
        targetUser: updatedResignation.userId,
        eventType: "resignation_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[rejectResignation] Notification enqueue failed:", {
          err,
        }),
      );

    // RejectResignation's proto response is BasicResponse (message+status
    // only, no `data` field) — a `data` value here would just be silently
    // dropped by the encoder, so don't bother constructing one.
    return callback(null, {
      message: MESSAGES.RESIGNATION_REJECTED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("RejectResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
