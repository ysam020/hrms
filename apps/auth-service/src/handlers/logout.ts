import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { revokeRefreshToken } from "../services/redis";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const logout = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;
    await revokeRefreshToken(userId);
    return callback(null, {
      message: MESSAGES.LOGOUT_SUCCESSFUL,
      status: status.OK,
    });
  } catch (err) {
    logger.error("Logout error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
