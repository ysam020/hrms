import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { authClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS, grpcToHttpStatus } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { aesEncrypt, aesDecrypt, safeDecrypt } from "@hrms/crypto";
import { recordLoginEvent } from "../services/loginEventService";
import { getActiveSettings } from "./tenantSettings";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — matches REFRESH_TOKEN_EXPIRE default
  path: "/api/v1/refresh-token",
};

const jsRedirect = (res: Response, url: string) => {
  // Use a standard HTTP redirect — inline <script> is blocked by CSP script-src 'self'
  return res.redirect(302, url);
};

export async function fetchFullProfile(userId: string) {
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
          personalEmail: 1,
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
          face_descriptor: 1,
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
    personalEmail: u.personalEmail || "",
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
    face_descriptor:
      Array.isArray(u.face_descriptor) && u.face_descriptor.length === 128
        ? u.face_descriptor
        : null,
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

    let tenantName: string | null = null;
    let tenantSlug: string | null = null;
    let wfhEnabled = true;
    if (user?.tenantId) {
      const [tenant, activeSettings] = await Promise.all([
        prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true, slug: true },
        }),
        getActiveSettings(user.tenantId),
      ]);
      tenantName = tenant?.name ?? null;
      tenantSlug = tenant?.slug ?? null;
      wfhEnabled = activeSettings?.wfhEnabled ?? true;
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        user: {
          ...profile,
          tenantName,
          tenantSlug,
          tenantRole: user?.tenantRole ?? null,
          wfhEnabled,
        },
      },
      message: "Profile fetched",
    });
  } catch (error: unknown) {
    logger.error("GET /profile error:", { error });
    return handleError(res, error);
  }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    // Mobile clients have no cookie jar shared with the OAuth browser session,
    // so they carry their SecureStore-persisted refresh token in the body
    // instead of relying on the httpOnly cookie the web app uses.
    const bodyToken: string | undefined = req.body?.refreshToken;
    const rawCookie = req.cookies?.refresh_token;

    let token: string;
    if (bodyToken) {
      token = bodyToken;
    } else if (rawCookie) {
      try {
        token = aesDecrypt(rawCookie);
      } catch {
        return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
          message: "Invalid refresh token",
        });
      }
    } else {
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "No refresh token provided",
      });
    }

    const response = await grpcCall<any, any>(authClient, "refreshToken", {
      refreshToken: token,
    });
    if (!response.accessToken) {
      // response.status is auth-service's own grpc.status enum value carried
      // in the response payload — the RPC itself succeeded at the transport
      // level even though the requested operation failed, so grpcCall's own
      // error-code handling never sees this. UNAUTHENTICATED (a genuinely
      // invalid/revoked token) must map to 401 so the frontend knows to log
      // out; anything else (e.g. INTERNAL from a transient Redis hiccup) has
      // to surface as something other than 401 — the frontend specifically
      // treats a 401 here as "session is really gone," and collapsing every
      // failure reason into that code is what turned momentary backend
      // blips into full logouts.
      return apiResponse(res, grpcToHttpStatus(response.status), {
        message: response.message,
      });
    }
    // Rotate the refresh token cookie (web) — harmless no-op for mobile callers.
    if (response.refreshToken) {
      res.cookie(
        "refresh_token",
        aesEncrypt(response.refreshToken),
        REFRESH_COOKIE_OPTIONS,
      );
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      // refreshToken (plain) is only meaningful to mobile clients, which must
      // rotate their SecureStore copy on every use; the web client ignores it.
      data: {
        accessToken: response.accessToken,
        refreshToken: bodyToken ? response.refreshToken : undefined,
      },
      message: response.message,
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function logout(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall<any, any>(authClient, "logout", {
      userId: user!.userId,
    });
    res.clearCookie("refresh_token", REFRESH_COOKIE_OPTIONS);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: response.message,
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function webAuthnRegisterOptions(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall<any, any>(
      authClient,
      "webAuthnRegistrationOptions",
      {
        userId: user!.userId,
        email: user!.email,
      },
    );
    if (!response.options)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: response.message,
      });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: JSON.parse(response.options),
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function getWebAuthnCredentials(req: Request, res: Response) {
  const { user } = req as AuthRequest;
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
  } catch (error: unknown) {
    logger.error("GET /webauthn-credentials error:", { error });
    return handleError(res, error);
  }
}

export async function webAuthnCredentialCheck(req: Request, res: Response) {
  try {
    const { username } = req.body;
    if (!username)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        hasCredentials: false,
        message: "username required",
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
  } catch (error: unknown) {
    logger.error("POST /webauthn-credential-check error:", { error });
    return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
      hasCredentials: false,
      message: "Internal Server Error",
    });
  }
}

export async function disableWebAuthn(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { credentialId, disableAll } = req.body;
    const userId = user!.userId;

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
  } catch (error: unknown) {
    logger.error("DELETE /disable-webauthn error:", { error });
    return handleError(res, error);
  }
}

export async function webAuthnRegister(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall<any, any>(
      authClient,
      "webAuthnRegistrationOptions",
      {
        userId: user!.userId,
        email: user!.email,
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function webAuthnVerifyRegistration(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const response = await grpcCall<any, any>(
      authClient,
      "webAuthnRegistrationVerify",
      {
        userId: user!.userId,
        credential: JSON.stringify(req.body.credential),
        deviceInfo: JSON.stringify(req.body.credential?.deviceInfo || {}),
      },
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function webAuthnLoginOptions(req: Request, res: Response) {
  try {
    const response = await grpcCall<any, any>(
      authClient,
      "webAuthnAuthenticationOptions",
      {
        username: req.body.username,
      },
    );
    if (!response.options) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        success: false,
        message: response.message,
      });
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: JSON.parse(response.options),
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

export async function webAuthnVerifyLogin(req: Request, res: Response) {
  try {
    const response = await grpcCall<any, any>(
      authClient,
      "webAuthnAuthenticationVerify",
      {
        username: req.body.username,
        credential: JSON.stringify(req.body.credential),
      },
    );
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

    let payload: { userId?: string } | null = null;
    try {
      payload = jwt.verify(
        response.accessToken,
        process.env.ACCESS_JWT_TOKEN!,
        {
          algorithms: ["HS256"],
        },
      ) as { userId?: string };
    } catch {}
    if (payload?.userId) {
      recordLoginEvent({
        userId: payload.userId,
        ip: req.ip || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        loginMethod: "WEBAUTHN",
      }).catch((err) => logger.error("Failed to record login event", { err }));
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { tempToken: response.accessToken, verified: true },
    });
  } catch (error: unknown) {
    return handleError(res, error);
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
    let payload: any;
    try {
      payload = jwt.default.verify(tempToken, process.env.ACCESS_JWT_TOKEN!, {
        algorithms: ["HS256"],
      });
    } catch {
      // The token itself is genuinely invalid/expired — a real rejection.
      return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
        message: "Authentication failed",
      });
    }
    // A verified, valid tempToken reaching here means only the profile fetch
    // (a DB call) can still fail — that's a transient infra issue, not a
    // rejection, so it must not collapse into the same 401 as an invalid
    // token above (a DB hiccup right after a legitimate WebAuthn login
    // shouldn't look like "authentication failed" to the client).
    const profile = await fetchFullProfile(payload.userId);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { accessToken: tempToken, user: profile },
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// Only these schemes may receive tokens via the mobile deep-link redirect —
// exp:// covers Expo Go / dev-client (Linking.createURL() there produces an
// exp://<lan-ip>/--/... URL, not our custom scheme), hrms:// covers
// standalone/production builds. Anything else is a potential open-redirect
// (a crafted ".../auth/google?platform=mobile&redirect_uri=https://evil.com"
// link would otherwise hand a real user's tokens to an attacker's domain).
const MOBILE_REDIRECT_SCHEME_RE = /^exps?:\/\/|^hrms:\/\//i;
const DEFAULT_MOBILE_REDIRECT = "hrms://auth-callback";

export function googleAuthRedirect(req: Request, res: Response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;
  const scope = "profile email";

  // The mobile app opens this endpoint in an in-app browser and has no
  // cookie jar shared with the callback — it passes its own deep-link
  // redirect URI through `state` (Google echoes state back verbatim) so
  // googleAuthCallback knows to hand tokens back via Linking instead of
  // the web app's httpOnly cookie + query-string redirect.
  let state = "";
  if (req.query.platform === "mobile") {
    const requested = String(req.query.redirect_uri || "");
    const target = MOBILE_REDIRECT_SCHEME_RE.test(requested)
      ? requested
      : DEFAULT_MOBILE_REDIRECT;
    state = `mobile:${encodeURIComponent(target)}`;
  }

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId!)}` +
    `&redirect_uri=${encodeURIComponent(callbackUrl!)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    (state ? `&state=${encodeURIComponent(state)}` : "");
  res.redirect(url);
}

export async function googleAuthCallback(req: Request, res: Response) {
  const rawClientUrl = process.env.CLIENT_URL || "https://localhost:5173";
  const clientUrl = rawClientUrl.split(",")[0].trim();
  const { code, error, state } = req.query;
  const rawState = typeof state === "string" ? state : "";
  const isMobile = rawState.startsWith("mobile:");
  // `state` is attacker-influenceable (anyone can hit Google's authorize URL
  // directly with their own state), so re-validate the scheme here too —
  // see MOBILE_REDIRECT_SCHEME_RE comment above.
  const requestedMobileRedirect = isMobile
    ? decodeURIComponent(rawState.slice("mobile:".length))
    : "";
  const mobileScheme = MOBILE_REDIRECT_SCHEME_RE.test(requestedMobileRedirect)
    ? requestedMobileRedirect
    : DEFAULT_MOBILE_REDIRECT;

  if (error || !code) {
    const message = String(error || "Authentication cancelled");
    return jsRedirect(
      res,
      isMobile
        ? `${mobileScheme}?error=${encodeURIComponent(message)}`
        : `${clientUrl}/login?error=${encodeURIComponent(message)}`,
    );
  }

  try {
    const response = await grpcCall<any, any>(
      authClient,
      "googleOAuthCallback",
      {
        code: String(code),
      },
    );

    if (!response.accessToken) {
      // Same distinction as the refreshToken handler above: response.status
      // is auth-service's own status for *why* this failed, separate from
      // grpcCall's transport-level error handling. A transient backend blip
      // (DB/Redis hiccup — grpcToHttpStatus(response.status) would be 5xx)
      // shouldn't tell the user their Google sign-in itself was rejected.
      const isTransient = grpcToHttpStatus(response.status) >= 500;
      const message = encodeURIComponent(
        isTransient
          ? "Something went wrong — please try signing in again."
          : "Authentication failed",
      );
      return jsRedirect(
        res,
        isMobile
          ? `${mobileScheme}?error=${message}`
          : `${clientUrl}/login?error=${message}`,
      );
    }

    // Mobile has no shared cookie jar with this in-app browser session, so it
    // receives the refresh token directly in the deep link below instead and
    // persists it itself (SecureStore). Setting the cookie here too is a
    // harmless no-op for mobile callers.
    if (response.refreshToken) {
      res.cookie(
        "refresh_token",
        aesEncrypt(response.refreshToken),
        REFRESH_COOKIE_OPTIONS,
      );
    }

    let payload: { userId?: string } | null = null;
    try {
      payload = jwt.verify(
        response.accessToken,
        process.env.ACCESS_JWT_TOKEN!,
        {
          algorithms: ["HS256"],
        },
      ) as { userId?: string };
    } catch {}
    if (payload?.userId) {
      recordLoginEvent({
        userId: payload.userId,
        ip: req.ip || req.socket.remoteAddress || "",
        userAgent: req.headers["user-agent"] || "",
        loginMethod: "GOOGLE_OAUTH",
      }).catch((err) => logger.error("Failed to record login event", { err }));
    }

    const redirectParams = new URLSearchParams({
      oauth_success: "1",
      access_token: response.accessToken,
    });
    if (isMobile && response.refreshToken) {
      redirectParams.set("refresh_token", response.refreshToken);
    }
    if (response.needsTenantSetup) redirectParams.set("tenant_setup", "1");
    if (response.tenants?.length > 0) {
      redirectParams.set("tenant_picker", "1");
      redirectParams.set(
        "tenants",
        Buffer.from(JSON.stringify(response.tenants)).toString("base64"),
      );
    }
    return jsRedirect(
      res,
      isMobile
        ? `${mobileScheme}?${redirectParams.toString()}`
        : `${clientUrl}/?${redirectParams.toString()}`,
    );
  } catch (error: unknown) {
    logger.error("[OAuth callback error]", {
      message: error instanceof Error ? error.message : error,
    });
    const message = encodeURIComponent("Login failed");
    return jsRedirect(
      res,
      isMobile
        ? `${mobileScheme}?error=${message}`
        : `${clientUrl}/login?error=${message}`,
    );
  }
}

// ─── Google Calendar connect (for interview scheduling) ───────────────────────
// Separate consent flow from the login OAuth above — see the comment on
// getCalendarAuthUrl() in services/googleCalendar.ts for why. This handler
// is called via XHR (protected by `authenticate`, so it has the caller's
// identity), unlike the login redirect which is a plain top-level navigation
// with no session yet — it returns the authorize URL as JSON and lets the
// frontend open it in a popup window itself, rather than the backend
// redirecting the XHR request (which browsers don't follow the way a page
// navigation does).
//
// The callback below runs inside that popup (Google redirects the popup
// there directly) with no Authorization header or session cookie available
// — the connecting user's ID is threaded through via a short-lived signed
// `state` param instead (mirroring the existing mobile-redirect `state`
// pattern above), not trusted unverified since `state` is otherwise
// attacker-influenceable. Rather than redirecting the popup to a client
// page, it posts the result back to window.opener and closes itself, so the
// page that triggered the connect (e.g. an in-progress Schedule Interview
// form) never navigates away and loses its state.
export async function googleCalendarConnect(req: AuthRequest, res: Response) {
  if (!req.user?.userId) {
    return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
      message: "Unauthorized",
    });
  }
  const state = jwt.sign(
    { userId: req.user.userId },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: "10m" },
  );
  const { getCalendarAuthUrl } = await import("../services/googleCalendar");
  return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
    data: { url: getCalendarAuthUrl(state) },
  });
}

// Polled by the frontend (useConnectGoogleCalendar.ts) once it detects the
// connect popup has closed — the reliable way to learn whether the connect
// flow actually succeeded, since the popup itself can't reliably report
// back (see the comment on popupResultPage below).
export async function googleCalendarStatus(req: AuthRequest, res: Response) {
  if (!req.user?.userId) {
    return apiResponse(res, RESPONSE_STATUS.UN_AUTHORIZED, {
      message: "Unauthorized",
    });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { googleCalendarRefreshToken: true },
  });
  return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
    data: { connected: !!user?.googleCalendarRefreshToken },
  });
}

// Best-effort only — window.opener is NOT a reliable channel here.
// accounts.google.com sets its own Cross-Origin-Opener-Policy header, which
// permanently severs this popup's window.opener the moment it navigates
// there, before it ever reaches this page — a well-known issue with "connect
// via Google" popup flows, not fixable from our side (our own COOP override
// below only helps in the minority of cases where the browser/flow didn't
// already sever it). The actual reliable signal is GET
// /auth/google-calendar/status, which useConnectGoogleCalendar.ts polls for
// once it detects the popup has closed — see that hook for the real
// completion-detection logic. This page's job is just: best-effort notify,
// then leave a clear message + manual close button — no auto window.close(),
// since browsers (Brave especially) routinely block script-initiated tab
// closes anyway, and a silently-failed auto-close just leaves the user
// staring at a tab that already tried and gave up.
function popupResultPage(
  res: Response,
  clientUrl: string,
  payload: { type: string; message?: string },
) {
  const success = payload.type === "google-calendar-connected";
  const displayMessage = success
    ? "Google Calendar connected."
    : payload.message || "Connection failed. Please try again.";

  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Content-Type", "text/html");
  return res.send(`<!DOCTYPE html>
<html><body>
<p id="msg">${displayMessage}</p>
<button id="close-btn" onclick="window.close()">Close this tab</button>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(clientUrl)});
    }
  } catch (e) {}
</script>
</body></html>`);
}

export async function googleCalendarCallback(req: Request, res: Response) {
  const rawClientUrl = process.env.CLIENT_URL || "https://localhost:5173";
  const clientUrl = rawClientUrl.split(",")[0].trim();
  const { code, state, error } = req.query;

  if (error || typeof code !== "string" || typeof state !== "string") {
    return popupResultPage(res, clientUrl, {
      type: "google-calendar-error",
      message: "Google Calendar connection was cancelled or failed.",
    });
  }

  try {
    const payload = jwt.verify(state, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as { userId?: string };
    if (!payload.userId) throw new Error("state missing userId");

    const { exchangeCalendarCode } = await import("../services/googleCalendar");
    const refreshToken = await exchangeCalendarCode(code);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { googleCalendarRefreshToken: aesEncrypt(refreshToken) },
    });

    return popupResultPage(res, clientUrl, {
      type: "google-calendar-connected",
    });
  } catch (err) {
    logger.error("[Google Calendar callback error]", {
      message: err instanceof Error ? err.message : err,
    });
    return popupResultPage(res, clientUrl, {
      type: "google-calendar-error",
      message: "Google Calendar connection failed. Please try again.",
    });
  }
}
