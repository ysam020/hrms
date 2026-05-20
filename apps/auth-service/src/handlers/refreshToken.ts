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

    const newAccessToken = signAccessToken({
      userId: payload.userId,
      tenantId: validation.tenantId,
      tenantRole: validation.tenantRole,
      pendingSetup: !validation.tenantId,
      orgSetupComplete: validation.orgSetupComplete ?? true,
      dbName: validation.dbName,
    });

    if (validation.currentToken !== token) {
      // Grace-period retry: re-serve without rotating again.
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
    await storeRefreshToken(
      payload.userId,
      newRefreshToken,
      validation.tenantId,
      validation.tenantRole,
      token,
      validation.dbName,
      validation.orgSetupComplete ?? true,
    );

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
