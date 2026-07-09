import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const approveKyc = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { employeeId } = call.request;

    if (!employeeId) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
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

    if (user.kyc_approval === "Approved") {
      return callback(null, {
        message: MESSAGES.KYC_ALREADY_APPROVED,
        status: status.ALREADY_EXISTS,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: employeeId },
      data: { kyc_approval: "Approved" },
    });

    const tenantId = getTenantId() ?? "global";
    await Promise.all([
      cacheManager.invalidatePattern(`t:${tenantId}:employees:*`),
      cacheManager.delete(`t:${tenantId}:employee:${employeeId}`),
      cacheManager.delete(`t:${tenantId}:employee-details:${updatedUser.username}`),
    ]);

    // Notify employee (fire-and-forget)
    getNotificationQueue()
      .add("kycApproved", {
        title: "KYC",
        message: MESSAGES.KYC_APPROVED,
        targetUser: updatedUser.username,
        eventType: "kyc_notification",
        priority: "medium",
      })
      .catch((err) =>
        logger.error("[approveKyc] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.KYC_APPROVED,
      status: status.OK,
      data: updatedUser,
    });
  } catch (err) {
    logger.error("ApproveKyc error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
