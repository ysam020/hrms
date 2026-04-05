import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { signAccessToken, signRefreshToken } from "../services/jwt";
import { storeRefreshToken } from "../services/redis";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const BLOCKED_STATUSES = ["Terminated", "Absconded", "Resigned"];

async function generateUniqueUsername(email: string): Promise<string> {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/, "");

  let username = base;
  let counter = 1;
  while (
    await prisma.user.findFirst({ where: { username }, select: { id: true } })
  ) {
    username = `${base}${counter}`;
    counter++;
  }
  return username;
}

export const googleOAuthCallback = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { code } = call.request;

    if (!code) {
      return callback(null, {
        message: MESSAGES.AUTHORIZATION_CODE_REQUIRED,
        status: status.INVALID_ARGUMENT,
        accessToken: "",
        refreshToken: "",
        data: null,
      });
    }

    // Exchange code for Google access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      logger.error("Google token exchange failed:", { err });
      return callback(null, {
        message: MESSAGES.FAILED_TO_EXCHANGE_CODE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: null,
      });
    }

    const tokenData = (await tokenRes.json()) as any;

    // Get user profile from Google
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    if (!profileRes.ok) {
      return callback(null, {
        message: MESSAGES.FAILED_TO_GET_PROFILE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: null,
      });
    }

    const profile = (await profileRes.json()) as any;
    const email: string = profile.email;

    if (!email) {
      return callback(null, {
        message: MESSAGES.NO_EMAIL_FROM_GOOGLE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: null,
      });
    }

    // Find or create user
    let user = await prisma.user.findFirst({ where: { email } });

    if (user) {
      if (BLOCKED_STATUSES.includes(user.employeeStatus)) {
        const reasons: Record<string, string> = {
          Terminated: "Your account has been terminated.",
          Absconded: "Your account has been marked as absconded.",
          Resigned: "Your account access has been revoked.",
        };
        return callback(null, {
          message: reasons[user.employeeStatus] || MESSAGES.ACCESS_DENIED,
          status: status.PERMISSION_DENIED,
          accessToken: "",
          refreshToken: "",
          data: null,
        });
      }
    } else {
      // Auto-register new user
      const username = await generateUniqueUsername(email);
      const nameParts = (profile.name || "").split(" ");
      const firstName = (nameParts[0] || "").toUpperCase();
      const lastName = nameParts.slice(1).join(" ").toUpperCase();
      const isFirstUser = (await prisma.user.count()) === 0;

      user = await prisma.user.create({
        data: {
          username,
          email,
          first_name: firstName,
          last_name: lastName,
          employee_photo: profile.picture || null,
          employeeStatus: "Active",
          isSuperUser: isFirstUser,
        },
      });
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);

    return callback(null, {
      message: MESSAGES.LOGIN_SUCCESSFUL,
      status: status.OK,
      accessToken,
      refreshToken,
      data: {
        id: user.id,
        email: user.email || "",
        username: user.username,
        role: user.role,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
      },
    });
  } catch (err) {
    logger.error("GoogleOAuthCallback error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
      refreshToken: "",
      data: null,
    });
  }
};
