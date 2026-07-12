import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

export const rejectLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.LEAVE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const leave = await prisma.leaveApplication.findUnique({ where: { id } });

    if (!leave) {
      return callback(null, {
        message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (leave.status !== "Pending") {
      return callback(null, {
        message: MESSAGES.ONLY_PENDING_CAN_BE_REJECTED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedLeave = await prisma.leaveApplication.update({
      where: { id },
      data: { status: "Rejected" },
    });

    await cacheManager.invalidatePattern(
      `t:${getTenantId() ?? "global"}:leaves:*`,
    );

    getNotificationQueue()
      .add("leaveRejected", {
        tenantId: getTenantId()!,
        title: "Leave",
        message: MESSAGES.LEAVE_REJECTED,
        targetUser: updatedLeave.userId,
        eventType: "leave_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.warn("[rejectLeave] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.LEAVE_REJECTED,
      status: status.OK,
      data: toLeaveApplicationProto(updatedLeave),
    });
  } catch (err) {
    logger.error("RejectLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
