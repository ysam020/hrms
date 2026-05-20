import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const removeFcmToken = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, deviceFingerprint, disableAll } = call.request;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });

    const existingTokens = (user.fcmTokens as any[]) || [];
    let updatedTokens: any[] = [];
    let removedCount = 0;

    if (disableAll) {
      removedCount = existingTokens.length;
      updatedTokens = [];
    } else if (deviceFingerprint) {
      const tokenIndex = existingTokens.findIndex(
        (t: any) => t.deviceFingerprint === deviceFingerprint,
      );
      if (tokenIndex === -1) {
        return callback(null, {
          message: MESSAGES.NO_FCM_TOKEN_FOUND,
          status: status.NOT_FOUND,
        });
      }
      updatedTokens = existingTokens.filter(
        (t: any) => t.deviceFingerprint !== deviceFingerprint,
      );
      removedCount = 1;
    } else {
      return callback(null, {
        message: MESSAGES.DEVICE_FINGERPRINT_OR_DISABLE_ALL_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: updatedTokens },
    });

    const message = disableAll
      ? MESSAGES.PUSH_NOTIFICATIONS_DISABLED_ALL
      : MESSAGES.PUSH_NOTIFICATIONS_DISABLED_DEVICE;

    return callback(null, {
      message,
      status: status.OK,
      removedCount,
      remainingDevices: updatedTokens.length,
    });
  } catch (err) {
    logger.error("RemoveFcmToken error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
