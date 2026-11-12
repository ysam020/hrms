import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { UNREAD } from "./getNotifications";

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Read state is per recipient and only ever set once: the first read time is
// kept (the condition skips rows already read), and cleared rows are left
// alone. Neither touches the notification itself or any delivery history.

export const readNotifications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, notificationIds } = call.request;
    const ids: string[] = (notificationIds ?? []).filter((id: unknown) =>
      OBJECT_ID.test(String(id)),
    );
    if (!userId || !OBJECT_ID.test(String(userId))) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }
    if (ids.length > 0) {
      await prisma.notificationRecipient.updateMany({
        where: {
          userId,
          notificationId: { in: ids },
          isCleared: false,
          ...UNREAD,
        },
        data: { readAt: new Date() },
      });
    }
    return callback(null, {
      message: MESSAGES.NOTIFICATIONS_MARKED_READ,
      status: status.OK,
    });
  } catch (err) {
    logger.error("ReadNotifications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};

export const readAllNotifications = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;
    if (!userId || !OBJECT_ID.test(String(userId))) {
      return callback(null, {
        message: MESSAGES.USER_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }
    await prisma.notificationRecipient.updateMany({
      where: { userId, isCleared: false, ...UNREAD },
      data: { readAt: new Date() },
    });
    return callback(null, {
      message: MESSAGES.ALL_NOTIFICATIONS_READ,
      status: status.OK,
    });
  } catch (err) {
    logger.error("ReadAllNotifications error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
