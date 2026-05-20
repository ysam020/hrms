import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const cancelLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, userId } = call.request;

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
        message: MESSAGES.ONLY_PENDING_CAN_BE_CANCELLED,
        status: status.FAILED_PRECONDITION,
      });
    }

    if (userId && leave.userId !== userId) {
      return callback(null, {
        message: MESSAGES.CANNOT_CANCEL_OTHERS_LEAVE,
        status: status.PERMISSION_DENIED,
      });
    }

    const updatedLeave = await prisma.leaveApplication.update({
      where: { id },
      data: { status: "Cancelled" },
    });

    await cacheManager.invalidatePattern("leaves:*");
    return callback(null, {
      message: MESSAGES.LEAVE_CANCELLED,
      status: status.OK,
      data: updatedLeave,
    });
  } catch (err) {
    logger.error("CancelLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
