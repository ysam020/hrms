import {
  sendUnaryData,
  ServerUnaryCall,
  status,
  Metadata,
} from "@grpc/grpc-js";
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
import { auth } from "@hrms/proto";
import { MESSAGES } from "../constants/messages";

export const refreshToken = async (
  call: ServerUnaryCall<auth.RefreshTokenRequest, auth.RefreshTokenResponse>,
  callback: sendUnaryData<auth.RefreshTokenResponse>,
) => {
  try {
    const { refreshToken: token } = call.request;

    const payload = verifyRefreshToken(token);
    if (!payload) {
      return callback(
        {
          code: status.UNAUTHENTICATED,
          message: MESSAGES.INVALID_REFRESH_TOKEN,
          metadata: new Metadata(),
        },
        null,
      );
    }

    const isValid = await validateRefreshToken(payload.userId, token);
    if (!isValid) {
      return callback(
        {
          code: status.UNAUTHENTICATED,
          message: MESSAGES.REFRESH_TOKEN_REVOKED,
          metadata: new Metadata(),
        },
        null,
      );
    }

    // Rotate: revoke old token, issue new pair
    await revokeRefreshToken(payload.userId);
    const newAccessToken = signAccessToken(payload.userId);
    const newRefreshToken = signRefreshToken(payload.userId);
    await storeRefreshToken(payload.userId, newRefreshToken);

    return callback(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    logger.error("RefreshToken error:", { err });
    return callback(
      {
        code: status.INTERNAL,
        message: MESSAGES.INTERNAL_SERVER_ERROR,
        metadata: new Metadata(),
      },
      null,
    );
  }
};
