import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import {
  validateRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
} from "../services/redis";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const refreshToken = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { refreshToken: token } = call.request;

    const payload = verifyRefreshToken(token);
    if (!payload) {
      return callback(null, {
        message: MESSAGES.INVALID_REFRESH_TOKEN,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    const validation = await validateRefreshToken(payload.userId, token);
    if (!validation.ok) {
      return callback(null, {
        message: MESSAGES.REFRESH_TOKEN_REVOKED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    const newAccessToken = signAccessToken(payload.userId);

    if (validation.currentToken !== token) {
      // Grace-period retry: the token was already rotated. Re-serve the current
      // refresh token without rotating again so the client recovers seamlessly.
      return callback(null, {
        message: MESSAGES.TOKEN_REFRESHED,
        status: status.OK,
        accessToken: newAccessToken,
        refreshToken: validation.currentToken,
      });
    }

    // Normal path: rotate — revoke old token, issue new pair
    const newRefreshToken = signRefreshToken(payload.userId);
    await revokeRefreshToken(payload.userId);
    await storeRefreshToken(payload.userId, newRefreshToken, token);

    return callback(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    logger.error("RefreshToken error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
      refreshToken: "",
    });
  }
};
