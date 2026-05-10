import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const rejectKyc = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { employeeId } = call.request;

    if (!employeeId) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_ID_REQUIRED,
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

    if (user.kyc_approval === "Rejected") {
      return callback(null, {
        message: MESSAGES.KYC_ALREADY_REJECTED,
        status: status.ALREADY_EXISTS,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: employeeId },
      data: { kyc_approval: "Rejected" },
    });

    await Promise.all([
      cacheManager.invalidatePattern("employees:*"),
      cacheManager.delete(`employee:${employeeId}`),
    ]);

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("kycRejected", {
        title: "KYC",
        message: MESSAGES.KYC_REJECTED,
        targetUser: updatedUser.username,
        eventType: "kyc_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[rejectKyc] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.KYC_REJECTED,
      status: status.OK,
      data: updatedUser,
    });
  } catch (err) {
    logger.error("RejectKyc error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
