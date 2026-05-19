import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const approveResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, lastWorkingDay, comments } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const resignation = await prisma.resignation.findUnique({ where: { id } });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (resignation.status !== "Submitted") {
      return callback(null, {
        message: MESSAGES.ONLY_SUBMITTED_CAN_BE_APPROVED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedResignation = await prisma.resignation.update({
      where: { id },
      data: {
        status: "Approved",
        approvedOn: new Date(),
        lastWorkingDay: lastWorkingDay ? new Date(lastWorkingDay) : null,
        comments: comments || null,
        lastUpdatedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern("resignations:*");

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("resignationApproved", {
        title: "Resignation",
        message: MESSAGES.RESIGNATION_APPROVED,
        targetUser: updatedResignation.userId,
        eventType: "resignation_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[approveResignation] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.RESIGNATION_APPROVED,
      status: status.OK,
      data: updatedResignation,
    });
  } catch (err) {
    logger.error("ApproveResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
