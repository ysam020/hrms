import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const webAuthnRegistrationOptions = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, email } = call.request;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return callback(null, {
        message: MESSAGES.USER_NOT_FOUND,
        status: status.NOT_FOUND,
        options: "",
      });
    }

    const options = await generateRegistrationOptions({
      rpName: "HRMS",
      rpID: process.env.RP_ID || "localhost",
      userID: Buffer.from(userId),
      userName: email || user.email,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    // Store challenge in Redis
    const { getRedisClient } = await import("../services/redis");
    const redis = getRedisClient();
    await redis.setex(`webauthn:challenge:${userId}`, 60, options.challenge);

    return callback(null, {
      message: MESSAGES.REGISTRATION_OPTIONS_GENERATED,
      status: status.OK,
      options: JSON.stringify(options),
    });
  } catch (err) {
    logger.error("WebAuthnRegistrationOptions error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      options: "",
    });
  }
};
