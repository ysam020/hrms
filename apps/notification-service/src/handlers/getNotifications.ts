import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getNotifications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, unreadOnly = false, page = 1, limit = 20 } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const skip = (page - 1) * limit;
    const recipientWhere: any = { userId };
    if (unreadOnly) recipientWhere.isCleared = false;

    const [recipients, total, unreadCount] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where: recipientWhere,
        skip,
        take: limit,
        include: { notification: true },
        orderBy: { id: "desc" },
      }),
      prisma.notificationRecipient.count({ where: recipientWhere }),
      prisma.notificationRecipient.count({
        where: { userId, isCleared: false },
      }),
    ]);

    const data = recipients.map((r) => ({
      id: r.id,
      title: r.notification.title || "",
      body: r.notification.message || "",
      type: r.notification.eventType || "",
      isRead: r.isCleared,
      createdAt: r.notification.timeStamp
        ? r.notification.timeStamp.toISOString()
        : "",
    }));

    return callback(null, {
      message: MESSAGES.NOTIFICATIONS_FETCHED,
      status: status.OK,
      data,
      total,
      unreadCount,
    });
  } catch (err) {
    logger.error("GetNotifications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
      unreadCount: 0,
    });
  }
};
