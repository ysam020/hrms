import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { prisma } from "@hrms/db";
import { signAccessToken, signRefreshToken } from "../services/jwt";
import { storeRefreshToken, getRedisClient } from "../services/redis";
import { logger } from "@hrms/logger";
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

export const webAuthnAuthenticationVerify = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, username, credential } = call.request;
    const raw = JSON.parse(credential);

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findFirst({ where: { username } });
    if (!user || !user.webAuthnCredentials) {
      return callback(null, {
        message: MESSAGES.NO_CREDENTIALS_FOUND,
        status: status.NOT_FOUND,
        accessToken: "",
      });
    }

    const redis = getRedisClient();
    const expectedChallenge = await redis.get(
      `webauthn:auth:challenge:${user.email}`,
    );
    if (!expectedChallenge) {
      return callback(null, {
        message: MESSAGES.CHALLENGE_EXPIRED,
        status: status.FAILED_PRECONDITION,
        accessToken: "",
      });
    }

    const storedCred = (user.webAuthnCredentials as any[]).find(
      (c: any) => c.credentialID === raw.id,
    );
    if (!storedCred) {
      return callback(null, {
        message: MESSAGES.NO_CREDENTIALS_FOUND,
        status: status.NOT_FOUND,
        accessToken: "",
      });
    }

    // Normalize byte arrays → base64url (simplewebauthn v10 expects AuthenticationResponseJSON)
    const credentialForVerification = {
      id: raw.id,
      rawId: toBase64url(raw.rawId) ?? raw.id, // rawId is same as id when absent
      type: raw.type as "public-key",
      response: {
        clientDataJSON: toBase64url(raw.response?.clientDataJSON)!,
        authenticatorData: toBase64url(raw.response?.authenticatorData)!,
        signature: toBase64url(raw.response?.signature)!,
        userHandle: toBase64url(raw.response?.userHandle),
      },
      clientExtensionResults: raw.clientExtensionResults || {},
    };

    const verification = await verifyAuthenticationResponse({
      response: credentialForVerification,
      expectedChallenge,
      expectedOrigin: process.env.ORIGIN || "https://localhost:5173",
      expectedRPID: process.env.RP_ID || "localhost",
      authenticator: {
        credentialID: storedCred.credentialID,
        credentialPublicKey: new Uint8Array(
          Buffer.from(storedCred.publicKey, "base64"),
        ),
        counter: storedCred.counter,
        transports: storedCred.transports,
      },
    });

    if (!verification.verified) {
      return callback(null, {
        message: MESSAGES.AUTHENTICATION_FAILED,
        status: status.UNAUTHENTICATED,
        accessToken: "",
      });
    }

    // Update counter and lastUsed
    const updatedCreds = (user.webAuthnCredentials as any[]).map((c: any) =>
      c.credentialID === raw.id
        ? {
            ...c,
            counter: verification.authenticationInfo.newCounter,
            lastUsed: new Date(),
          }
        : c,
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { webAuthnCredentials: updatedCreds },
    });

    // Resolve tenant membership for token
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId: user.id },
    });
    const tenantRecord = membership
      ? await prisma.tenant.findUnique({
          where: { id: membership.tenantId },
          select: { dbName: true },
        })
      : null;
    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: membership?.tenantId ?? null,
      tenantRole: membership?.role ?? null,
      pendingSetup: !membership,
      orgSetupComplete: true,
      dbName: tenantRecord?.dbName ?? null,
    });
    const refreshToken = signRefreshToken(user.id);
    await storeRefreshToken(
      user.id,
      refreshToken,
      membership?.tenantId ?? null,
      membership?.role ?? null,
      undefined,
      tenantRecord?.dbName ?? null,
    );
    await redis.del(`webauthn:auth:challenge:${user.email}`);

    return callback(null, {
      message: MESSAGES.AUTHENTICATION_SUCCESSFUL,
      status: status.OK,
      accessToken,
      refreshToken: refreshToken,
    });
  } catch (err) {
    logger.error("WebAuthnAuthenticationVerify error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
    });
  }
};
