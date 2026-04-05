import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const sendNotification = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, title, message, eventType, priority } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const notification = await prisma.notification.create({
      data: {
        title: title || null,
        message: message || null,
        eventType: eventType || "general",
        priority: priority || "medium",
        recipients: { create: { userId } },
      },
      include: { recipients: true },
    });

    // Send FCM push (non-fatal)
    try {
      const { sendPushNotifications } = await import("@hrms/firebase");
      await sendPushNotifications([userId], title || "", message || "");
    } catch (fcmErr) {
      logger.warn("FCM send failed (non-fatal):", { fcmErr });
    }

    return callback(null, {
      message: MESSAGES.NOTIFICATION_SENT,
      status: status.OK,
      data: notification,
    });
  } catch (err) {
    logger.error("SendNotification error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: null,
    });
  }
};
