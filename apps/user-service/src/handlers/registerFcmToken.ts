import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
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

    // Defense in depth — api-gateway's saveFcmToken already rejects an
    // empty token/deviceFingerprint before this ever gets called, but this
    // is the layer that actually writes to the DB and shouldn't trust that
    // every caller validated first. An empty token can't receive pushes;
    // an empty deviceFingerprint would collide with any other request that
    // also lacks one, since the dedup below is keyed on it.
    if (!token || !deviceFingerprint) {
      return callback(null, {
        message: MESSAGES.FCM_TOKEN_AND_FINGERPRINT_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

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
