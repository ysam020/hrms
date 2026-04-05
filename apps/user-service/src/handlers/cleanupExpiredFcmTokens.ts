import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

export const cleanupExpiredFcmTokens = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: { fcmTokens: { not: null } },
      select: { id: true, fcmTokens: true },
    });

    let cleaned = 0;
    for (const user of users) {
      const tokens = (user.fcmTokens as any[]) || [];
      const activeTokens = tokens.filter((t: any) => {
        const lastUsed = new Date(t.lastUsed);
        return lastUsed > thirtyDaysAgo && t.isActive;
      });

      if (activeTokens.length !== tokens.length) {
        await prisma.user.update({
          where: { id: user.id },
          data: { fcmTokens: activeTokens },
        });
        cleaned += tokens.length - activeTokens.length;
      }
    }

    logger.info(`Cleaned up ${cleaned} expired FCM tokens`);
    return callback(null, {
      message: `Cleaned ${cleaned} expired tokens`,
      status: status.OK,
      cleaned,
    });
  } catch (err) {
    logger.error("CleanupExpiredFcmTokens error:", { err });
    return callback(null, {
      message: "Internal error",
      status: status.INTERNAL,
      cleaned: 0,
    });
  }
};
