import { Request, Response } from "express";
import { authCall } from "../grpc/clients";
import {
  apiResponse,
  RESPONSE_STATUS,
  errorMessage,
  safeDecrypt,
  grpcToHttpStatus,
} from "@hrms/common";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { aesEncrypt, aesDecrypt } from "@hrms/crypto";

/** Returns true only for a 24-character lowercase hex string (MongoDB ObjectId). */
function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/api/v1/refresh-token",
};

const jsRedirect = (res: Response, url: string) => {
  // Use a standard HTTP redirect — inline <script> is blocked by CSP script-src 'self'
  return res.redirect(302, url);
};

async function fetchFullProfile(userId: string) {
  if (!isValidObjectId(userId)) return null;
  const rows = (await prisma.user.aggregateRaw({
    pipeline: [
      { $match: { $expr: { $eq: ["$_id", { $toObjectId: userId }] } } },
      {
        $project: {
          _id: 0,
          id: { $toString: "$_id" },
          email: 1,
          username: 1,
          role: 1,
          isSuperUser: 1,
          permissions: 1,
          employeeStatus: 1,
          first_name: 1,
          last_name: 1,
          middle_name: 1,
          dob: 1,
          blood_group: 1,
          mobile: 1,
          official_email: 1,
          designation: 1,
          department: 1,
          joining_date: 1,
          employee_photo: 1,
          communication_address_line_1: 1,
          communication_address_line_2: 1,
          communication_address_city: 1,
          communication_address_state: 1,
          communication_address_pincode: 1,
          permanent_address_line_1: 1,
          permanent_address_line_2: 1,
          permanent_address_city: 1,
          permanent_address_state: 1,
          permanent_address_pincode: 1,
          bank_account_no: 1,
          bank_name: 1,
          ifsc_code: 1,
          aadhar_no: 1,
          aadhar_photo_front: 1,
          aadhar_photo_back: 1,
          pan_no: 1,
          pan_photo: 1,
          pf_no: 1,
          uan_no: 1,
          esic_no: 1,
          fcmTokens: 1,
          events: 1,
        },
      },
    ],
  })) as unknown as any[];

  if (!rows || rows.length === 0) return null;

  const u = rows[0];
  const firstName = u.first_name || "";
  const lastName = u.last_name || "";
  const fullName =
    [firstName, u.middle_name, lastName].filter(Boolean).join(" ") ||
    u.username;

  return {
    id: u.id,
    email: u.email || "",
    username: u.username || "",
    role: u.role || [],
    isSuperUser: u.isSuperUser || false,
    permissions: u.permissions || [],
    employeeStatus: u.employeeStatus || "Active",
    firstName,
    lastName,
    fullName,
    dob: u.dob || "",
    blood_group: u.blood_group || "",
    mobile: safeDecrypt(u.mobile),
    official_email: u.official_email || "",
    designation: u.designation || "",
    department: u.department || "",
    joining_date: u.joining_date || "",
    employee_photo: u.employee_photo || "",
    communication_address_line_1: safeDecrypt(u.communication_address_line_1),
    communication_address_line_2: safeDecrypt(u.communication_address_line_2),
    communication_address_city: safeDecrypt(u.communication_address_city),
    communication_address_state: safeDecrypt(u.communication_address_state),
    communication_address_pincode: safeDecrypt(u.communication_address_pincode),
    permanent_address_line_1: safeDecrypt(u.permanent_address_line_1),
    permanent_address_line_2: safeDecrypt(u.permanent_address_line_2),
    permanent_address_city: safeDecrypt(u.permanent_address_city),
    permanent_address_state: safeDecrypt(u.permanent_address_state),
    permanent_address_pincode: safeDecrypt(u.permanent_address_pincode),
    bank_account_no: safeDecrypt(u.bank_account_no),
    bank_name: u.bank_name || "",
    ifsc_code: u.ifsc_code || "",
    aadhar_no: safeDecrypt(u.aadhar_no),
    aadhar_photo_front: safeDecrypt(u.aadhar_photo_front),
    aadhar_photo_back: safeDecrypt(u.aadhar_photo_back),
    pan_no: safeDecrypt(u.pan_no),
    pan_photo: safeDecrypt(u.pan_photo),
    pf_no: safeDecrypt(u.pf_no),
    uan_no: safeDecrypt(u.uan_no),
    esic_no: safeDecrypt(u.esic_no),
    fcmTokens: Array.isArray(u.fcmTokens) ? u.fcmTokens : [],
    events: Array.isArray(u.events) ? u.events : [],
  };
}

export async function getProfile(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const profile = await fetchFullProfile(user!.userId);
    if (!profile)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { user: profile },
      message: "Profile fetched",
    });
  } catch (error: any) {
    logger.error("GET /profile error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    const rawCookie = req.cookies?.refresh_token;
    if (!rawCookie) {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "No refresh token provided",
      });
    }
    let token: string;
    try {
      token = aesDecrypt(rawCookie);
    } catch {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Invalid refresh token",
      });
    }
    const response = (await authCall("refreshToken", {
      refreshToken: token,
    })) as any;
    if (!response.accessToken) {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: response.message || "Authentication failed",
      });
    }
    // Rotate the refresh token cookie
    if (response.refreshToken) {
      res.cookie(
        "refresh_token",
        aesEncrypt(response.refreshToken),
        REFRESH_COOKIE_OPTIONS,
      );
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { accessToken: response.accessToken },
      message: response.message,
    });
  } catch (error: any) {
    // authCall now throws proper gRPC errors (UNAUTHENTICATED, INTERNAL, etc.)
    // grpcToHttpStatus maps them to correct HTTP codes (401, 503, etc.)
    const httpStatus =
      error?.code !== undefined
        ? grpcToHttpStatus(error.code)
        : RESPONSE_STATUS.INTERNAL_SERVER_ERROR;
    return apiResponse(res, httpStatus, {
      message: error?.message || errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function logout(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await authCall("logout", {
      userId: user!.userId,
    });
    res.clearCookie("refresh_token", REFRESH_COOKIE_OPTIONS);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: response.message,
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnRegisterOptions(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await authCall("webAuthnRegistrationOptions", {
      userId: user!.userId,
      email: user!.email,
    });
    if (!(response as any).options)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: (response as any).message,
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: JSON.parse((response as any).options),
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function getWebAuthnCredentials(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  if (!isValidObjectId(user!.userId)) {
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Invalid user ID",
    });
  }
  try {
    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", { $toObjectId: user!.userId }] } } },
        { $project: { _id: 0, webAuthnCredentials: 1 } },
      ],
    })) as unknown as any[];

    const credentials = (rows[0]?.webAuthnCredentials || []).map((c: any) => ({
      credentialID: c.credentialID,
      transports: c.transports || [],
      createdAt: c.createdAt,
      lastUsed: c.lastUsed,
      deviceInfo: c.deviceInfo || null,
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: { credentials } });
  } catch (error: any) {
    logger.error("GET /webauthn-credentials error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnCredentialCheck(req: Request, res: Response) {
  try {
    const { username } = req.body;
    if (!username || typeof username !== "string")
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        hasCredentials: false,
        message: "username required",
      });
    // Reject oversized or structurally invalid usernames before hitting the DB
    if (username.length > 100 || !/^[\w.\-@]+$/.test(username))
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        hasCredentials: false,
        message: "invalid username format",
      });

    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
        { $match: { username } },
        { $project: { _id: 0, webAuthnCredentials: 1 } },
      ],
    })) as unknown as any[];

    const creds = rows[0]?.webAuthnCredentials;
    const hasCredentials = Array.isArray(creds) && creds.length > 0;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { hasCredentials });
  } catch (error: any) {
    logger.error("POST /webauthn-credential-check error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      hasCredentials: false,
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function disableWebAuthn(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { credentialId, disableAll } = req.body;
    const userId = user!.userId;

    if (!isValidObjectId(userId)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid user ID",
      });
    }

    const rows = (await prisma.user.aggregateRaw({
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", { $toObjectId: userId }] } } },
        { $project: { _id: 0, webAuthnCredentials: 1 } },
      ],
    })) as unknown as any[];

    const existing: any[] = rows[0]?.webAuthnCredentials || [];

    let updated: any[];
    if (disableAll) {
      updated = [];
    } else if (credentialId) {
      updated = existing.filter((c: any) => c.credentialID !== credentialId);
      if (updated.length === existing.length) {
        return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
          message: "Credential not found",
        });
      }
    } else {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "credentialId or disableAll required",
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { webAuthnCredentials: updated },
    });

    const message = disableAll
      ? `Disabled all ${existing.length} WebAuthn credential(s)`
      : "WebAuthn credential removed";
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { message });
  } catch (error: any) {
    logger.error("DELETE /disable-webauthn error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnRegister(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await authCall("webAuthnRegistrationOptions", {
      userId: user!.userId,
      email: user!.email,
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnVerifyRegistration(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await authCall("webAuthnRegistrationVerify", {
      userId: user!.userId,
      credential: JSON.stringify(req.body.credential),
      deviceInfo: JSON.stringify(req.body.credential?.deviceInfo || {}),
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnLoginOptions(req: Request, res: Response) {
  try {
    const response = await authCall("webAuthnAuthenticationOptions", {
      username: req.body.username,
    });
    if (!(response as any).options) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        success: false,
        message: (response as any).message,
      });
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: JSON.parse((response as any).options),
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnVerifyLogin(req: Request, res: Response) {
  try {
    const response = (await authCall("webAuthnAuthenticationVerify", {
      username: req.body.username,
      credential: JSON.stringify(req.body.credential),
    })) as any;
    if (!response.accessToken) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        success: false,
        message: response.message,
      });
    }
    // Set the refresh token cookie so the session survives page reloads
    if (response.refreshToken) {
      res.cookie(
        "refresh_token",
        aesEncrypt(response.refreshToken),
        REFRESH_COOKIE_OPTIONS,
      );
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { tempToken: response.accessToken, verified: true },
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      message: errorMessage.GENERAL.INTERNAL_ERROR,
    });
  }
}

export async function webAuthnLogin(req: Request, res: Response) {
  try {
    const { tempToken } = req.body;
    if (!tempToken) {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Authentication session expired",
      });
    }
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(
      tempToken,
      process.env.ACCESS_JWT_TOKEN!,
      { algorithms: ["HS256"] },
    ) as any;
    const profile = await fetchFullProfile(payload.userId);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { accessToken: tempToken, user: profile },
    });
  } catch (error: any) {
    return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
      message: "Authentication failed",
    });
  }
}

export function googleAuthRedirect(_req: Request, res: Response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
  const scope = "profile email";
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId!)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl!)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline`;
  res.redirect(url);
}

export async function googleAuthCallback(req: Request, res: Response) {
  const rawClientUrl = process.env.CLIENT_URL || "https://localhost:5173";
  const clientUrl = rawClientUrl.split(",")[0].trim();
  const { code, error } = req.query;

  if (error || !code) {
    return jsRedirect(
      res,
      `${clientUrl}/login?error=${encodeURIComponent(String(error || "Authentication cancelled"))}`,
    );
  }

  try {
    const response = (await authCall("googleOAuthCallback", {
      code: String(code),
    })) as any;

    if (!response.accessToken) {
      return jsRedirect(
        res,
        `${clientUrl}/login?error=${encodeURIComponent("Authentication failed")}`,
      );
    }

    if (response.refreshToken) {
      res.cookie(
        "refresh_token",
        aesEncrypt(response.refreshToken),
        REFRESH_COOKIE_OPTIONS,
      );
    }

    return jsRedirect(res, `${clientUrl}/?oauth_success=1`);
  } catch (err: any) {
    logger.error("[OAuth callback error]", { message: err?.message || err });
    return jsRedirect(
      res,
      `${clientUrl}/login?error=${encodeURIComponent("Login failed")}`,
    );
  }
}
