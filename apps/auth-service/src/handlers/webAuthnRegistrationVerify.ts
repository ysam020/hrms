import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { getRedisClient } from "../services/redis";
import { MESSAGES } from "../constants/messages";

function toBase64url(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return Buffer.from(value).toString("base64url");
  if (value instanceof Uint8Array)
    return Buffer.from(value).toString("base64url");
  if (value instanceof ArrayBuffer)
    return Buffer.from(new Uint8Array(value)).toString("base64url");
  return undefined;
}

export const webAuthnRegistrationVerify = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      userId,
      credential: credentialJson,
      deviceInfo: deviceInfoJson,
    } = call.request;
    const raw = JSON.parse(credentialJson);
    const deviceInfo = deviceInfoJson ? JSON.parse(deviceInfoJson) : undefined;

    const redis = getRedisClient();
    const expectedChallenge = await redis.get(`webauthn:challenge:${userId}`);

    if (!expectedChallenge) {
      return callback(null, {
        message: MESSAGES.CHALLENGE_EXPIRED,
        status: status.FAILED_PRECONDITION,
        accessToken: "",
      });
    }

    // Normalize byte arrays → base64url strings (simplewebauthn v10 expects RegistrationResponseJSON)
    const credentialForVerification = {
      id: raw.id,
      rawId: toBase64url(raw.rawId) ?? raw.id,
      type: raw.type as "public-key",
      response: {
        clientDataJSON: toBase64url(raw.response?.clientDataJSON)!,
        attestationObject: toBase64url(raw.response?.attestationObject)!,
        transports: raw.response?.transports,
      },
      clientExtensionResults: raw.clientExtensionResults || {},
    };

    // ORIGIN may be a comma-separated list (e.g. apex + www), same convention
    // as CLIENT_URL in server.ts's CORS config — @simplewebauthn accepts
    // either a single origin or an array of allowed origins here.
    const expectedOrigin = (process.env.ORIGIN || "https://localhost:5173")
      .split(",")
      .map((o) => o.trim());

    const verification = await verifyRegistrationResponse({
      response: credentialForVerification,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: process.env.RP_ID || "localhost",
    });

    if (!verification.verified || !verification.registrationInfo) {
      return callback(null, {
        message: MESSAGES.VERIFICATION_FAILED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
      });
    }

    const { credentialID, credentialPublicKey, counter } =
      verification.registrationInfo;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const existingCreds = (user?.webAuthnCredentials as any[]) || [];

    existingCreds.push({
      credentialID:
        typeof credentialID === "string"
          ? credentialID
          : Buffer.from(credentialID as any).toString("base64url"),
      publicKey: Buffer.from(credentialPublicKey as any).toString("base64"),
      counter,
      transports: raw.response?.transports || [],
      deviceInfo: deviceInfo || null,
      createdAt: new Date(),
      lastUsed: new Date(),
    });

    await prisma.user.update({
      where: { id: userId },
      data: { webAuthnCredentials: existingCreds },
    });

    await redis.del(`webauthn:challenge:${userId}`);

    return callback(null, {
      message: MESSAGES.WEBAUTHN_CREDENTIAL_REGISTERED,
      status: status.OK,
      accessToken: "",
    });
  } catch (err) {
    logger.error("WebAuthnRegistrationVerify error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
    });
  }
};
