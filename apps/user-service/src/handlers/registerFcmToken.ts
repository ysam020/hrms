import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const registerFcmToken = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      userId,
      token,
      deviceFingerprint,
      browser,
      os,
      deviceType,
      ipAddress,
    } = call.request;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });

    const existingTokens = (user.fcmTokens as any[]) || [];
    const tokenIndex = existingTokens.findIndex(
      (t: any) => t.deviceFingerprint === deviceFingerprint,
    );
    const now = new Date();

    if (tokenIndex >= 0) {
      existingTokens[tokenIndex] = {
        ...existingTokens[tokenIndex],
        token,
        lastUsed: now,
        isActive: true,
      };
    } else {
      existingTokens.push({
        token,
        deviceFingerprint,
        deviceInfo: { browser, os, deviceType },
        ipAddress,
        createdAt: now,
        lastUsed: now,
        isActive: true,
      });
    }

    // Keep only the 15 most recently used tokens
    if (existingTokens.length > 15) {
      existingTokens.sort(
        (a: any, b: any) =>
          new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
      );
      existingTokens.splice(15);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: existingTokens },
    });

    return callback(null, {
      message: MESSAGES.FCM_TOKEN_REGISTERED,
      status: status.OK,
      activeDevices: existingTokens.length,
    });
  } catch (err) {
    logger.error("RegisterFcmToken error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
