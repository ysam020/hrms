import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const deleteUser = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    await prisma.user.delete({ where: { id: userId } });

    await Promise.all([
      cacheManager.invalidatePattern("users:*"),
      cacheManager.delete(`user:${userId}`),
    ]);
    return callback(null, {
      message: MESSAGES.USER_DELETED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteUser error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
