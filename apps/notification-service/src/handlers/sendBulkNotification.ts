import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const sendBulkNotification = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userIds, title, message, eventType, priority } = call.request;

    if (!userIds || userIds.length === 0) {
      return callback(null, {
        message: "No user IDs provided",
        status: status.INVALID_ARGUMENT,
      });
    }

    const notification = await prisma.notification.create({
      data: {
        title: title || null,
        message: message || null,
        eventType: eventType || "general",
        priority: priority || "medium",
        recipients: {
          create: (userIds as string[]).map((userId: string) => ({ userId })),
        },
      },
      include: { recipients: true },
    });

    return callback(null, {
      message: `Bulk notification sent to ${userIds.length} users`,
      status: status.OK,
      data: notification,
    });
  } catch (err) {
    logger.error("SendBulkNotification error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
