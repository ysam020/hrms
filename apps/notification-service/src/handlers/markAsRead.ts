import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const markAsRead = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, notificationIds } = call.request;

    await prisma.notificationRecipient.updateMany({
      where: { userId, notificationId: { in: notificationIds } },
      data: { isCleared: true },
    });

    return callback(null, {
      message: MESSAGES.NOTIFICATIONS_MARKED_READ,
      status: status.OK,
    });
  } catch (err) {
    logger.error("MarkAsRead error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
