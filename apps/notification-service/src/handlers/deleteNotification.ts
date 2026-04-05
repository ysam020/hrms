import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const deleteNotification = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, notificationIds } = call.request;

    await prisma.notificationRecipient.deleteMany({
      where: { userId, notificationId: { in: notificationIds } },
    });

    return callback(null, {
      message: MESSAGES.NOTIFICATIONS_DELETED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteNotification error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
