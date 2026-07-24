import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
} from "../services/jwt";
import { rotateRefreshToken } from "../services/redis";
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

    // The candidate token is generated up front and handed to
    // rotateRefreshToken(), which atomically decides whether this request
    // is the one that actually gets to rotate (see refreshTokenStore.ts) —
    // a concurrent refresh (another tab, a retried request) presenting the
    // same token can't race this into two independently-stored tokens with
    // one left orphaned. If this call loses that race, the candidate below
    // is simply discarded and the winner's token is returned instead.
    const candidateRefreshToken = signRefreshToken(payload.userId);
    const rotation = await rotateRefreshToken(
      payload.userId,
      token,
      candidateRefreshToken,
    );
    if (!rotation.ok) {
      return callback(null, {
        message: MESSAGES.REFRESH_TOKEN_REVOKED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
      });
    }

    const newAccessToken = signAccessToken({
      userId: payload.userId,
      tenantId: rotation.tenantId,
      tenantRole: rotation.tenantRole,
      pendingSetup: !rotation.tenantId,
      orgSetupComplete: rotation.orgSetupComplete ?? true,
      dbName: rotation.dbName,
    });

    return callback(null, {
      message: MESSAGES.TOKEN_REFRESHED,
      status: status.OK,
      accessToken: newAccessToken,
      refreshToken: rotation.currentToken,
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
