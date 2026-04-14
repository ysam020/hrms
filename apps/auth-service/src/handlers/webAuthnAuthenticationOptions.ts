import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@hrms/db";
import { getRedisClient } from "../services/redis";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const webAuthnAuthenticationOptions = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { username } = call.request;

    const user = await prisma.user.findFirst({ where: { username } });
    if (!user || !user.webAuthnCredentials) {
      return callback(null, {
        message: MESSAGES.NO_CREDENTIALS_FOUND,
        status: status.NOT_FOUND,
        options: "",
      });
    }

    const credentials = (user.webAuthnCredentials as any[]).map((c: any) => ({
      id: c.credentialID,
      type: "public-key" as const,
    }));

    const options = await generateAuthenticationOptions({
      rpID: process.env.RP_ID || "localhost",
      userVerification: "preferred",
      allowCredentials: credentials,
    });

    const redis = getRedisClient();
    await redis.setex(
      `webauthn:auth:challenge:${user.email}`,
      60,
      options.challenge,
    );

    return callback(null, {
      message: MESSAGES.AUTHENTICATION_OPTIONS_GENERATED,
      status: status.OK,
      options: JSON.stringify(options),
    });
  } catch (err) {
    logger.error("WebAuthnAuthenticationOptions error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      options: "",
    });
  }
};
