import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const markAllAsRead = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    await prisma.notificationRecipient.updateMany({
      where: { userId, isCleared: false },
      data: { isCleared: true },
    });

    return callback(null, {
      message: MESSAGES.ALL_NOTIFICATIONS_READ,
      status: status.OK,
    });
  } catch (err) {
    logger.error("MarkAllAsRead error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
