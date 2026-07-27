import { prisma } from "@hrms/db";
import {
  getProfile,
  refreshToken,
  logout,
  webAuthnRegisterOptions,
  getWebAuthnCredentials,
  webAuthnCredentialCheck,
  disableWebAuthn,
  webAuthnRegister,
  webAuthnVerifyRegistration,
  webAuthnLoginOptions,
  webAuthnVerifyLogin,
  webAuthnLogin,
  googleAuthRedirect,
  googleAuthCallback,
  googleCalendarConnect,
  googleCalendarCallback,
  googleCalendarStatus,
} from "../handlers/auth";

jest.mock("../grpc/clients", () => ({
  authClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      aggregateRaw: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
    UN_AUTHORIZED: 401,
  },
  // Real mapping logic (not hand-mocked) — refreshToken/googleAuthCallback
  // depend on its actual UNAUTHENTICATED-vs-everything-else distinction.
  grpcToHttpStatus: jest.requireActual("@hrms/common").grpcToHttpStatus,
}));

jest.mock("@hrms/crypto", () => ({
  aesEncrypt: jest.fn((v: string) => `enc:${v}`),
  aesDecrypt: jest.fn((v: string) => {
    if (v === "bad-token") throw new Error("Decrypt failed");
    return v;
  }),
  safeDecrypt: jest.fn((v: any) => v || ""),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("jsonwebtoken", () => ({
  __esModule: true,
  default: {
    verify: jest.fn(),
    decode: jest.fn().mockReturnValue(null),
    sign: jest.fn().mockReturnValue("signed-state-token"),
  },
}));

jest.mock("../services/loginEventService", () => ({
  recordLoginEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/googleCalendar", () => ({
  getCalendarAuthUrl: jest.fn(
    (state: string) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  ),
  exchangeCalendarCode: jest.fn(),
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { aesDecrypt } from "@hrms/crypto";
import jwt from "jsonwebtoken";
import { status as GrpcStatus } from "@grpc/grpc-js";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockAesDecrypt = aesDecrypt as jest.Mock;
const mockJwtVerify = (jwt as any).verify as jest.Mock;
const mockAggregateRaw = (prisma as any).user.aggregateRaw as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;

const makeRes = () =>
  ({
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
  }) as any;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1", email: "user@test.com" },
    query: {},
    params: {},
    body: {},
    cookies: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "user-agent": "test-agent" },
    ...overrides,
  }) as any;

const profileRow = {
  id: "user-1",
  email: "user@test.com",
  username: "testuser",
  role: ["HR"],
  isSuperUser: false,
  permissions: [],
  employeeStatus: "Active",
  first_name: "Test",
  last_name: "User",
  middle_name: null,
};

describe("authHandlers", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getProfile", () => {
    it("returns NOT_FOUND when aggregateRaw returns empty", async () => {
      mockAggregateRaw.mockResolvedValue([]);
      const res = makeRes();
      await getProfile(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns profile data on success", async () => {
      mockAggregateRaw.mockResolvedValue([profileRow]);
      const res = makeRes();
      await getProfile(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ user: expect.any(Object) }),
        }),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getProfile(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("refreshToken", () => {
    it("returns UN_AUTHORIZED when no refresh_token cookie", async () => {
      const res = makeRes();
      await refreshToken(makeReq({ cookies: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("returns UN_AUTHORIZED when aesDecrypt throws", async () => {
      const res = makeRes();
      await refreshToken(
        makeReq({ cookies: { refresh_token: "bad-token" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("returns UN_AUTHORIZED when grpc reports the refresh token itself is invalid/revoked", async () => {
      mockGrpcCall.mockResolvedValue({
        message: "Token expired",
        status: GrpcStatus.UNAUTHENTICATED,
      });
      const res = makeRes();
      await refreshToken(
        makeReq({ cookies: { refresh_token: "valid-token" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("does not collapse a transient backend failure into UN_AUTHORIZED", async () => {
      // A momentary Redis/DB hiccup on the auth-service side must not look
      // like "session is really gone" to the frontend — only a genuinely
      // invalid/revoked token (UNAUTHENTICATED, tested above) should.
      mockGrpcCall.mockResolvedValue({
        message: "Redis unavailable",
        status: GrpcStatus.INTERNAL,
      });
      const res = makeRes();
      await refreshToken(
        makeReq({ cookies: { refresh_token: "valid-token" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("rotates cookie and returns new accessToken on success", async () => {
      mockGrpcCall.mockResolvedValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
      });
      const res = makeRes();
      await refreshToken(
        makeReq({ cookies: { refresh_token: "valid-token" } }),
        res,
      );
      expect(res.cookie).toHaveBeenCalledWith(
        "refresh_token",
        expect.any(String),
        expect.any(Object),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: { accessToken: "new-access" } }),
      );
    });
  });

  describe("logout", () => {
    it("calls grpcCall logout, clears cookie, and returns SUCCESS", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Logged out" });
      const res = makeRes();
      await logout(makeReq(), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(expect.anything(), "logout", {
        userId: "user-1",
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        "refresh_token",
        expect.any(Object),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on grpc error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await logout(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("webAuthnRegisterOptions", () => {
    it("returns BAD_REQUEST when grpc returns no options", async () => {
      mockGrpcCall.mockResolvedValue({ message: "User not found" });
      const res = makeRes();
      await webAuthnRegisterOptions(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns parsed options on success", async () => {
      mockGrpcCall.mockResolvedValue({
        options: JSON.stringify({ challenge: "abc123" }),
      });
      const res = makeRes();
      await webAuthnRegisterOptions(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ challenge: "abc123" }),
        }),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on grpc error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await webAuthnRegisterOptions(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getWebAuthnCredentials", () => {
    it("returns empty credentials when none stored", async () => {
      mockAggregateRaw.mockResolvedValue([{ webAuthnCredentials: [] }]);
      const res = makeRes();
      await getWebAuthnCredentials(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: { credentials: [] } }),
      );
    });

    it("maps and returns stored credentials", async () => {
      mockAggregateRaw.mockResolvedValue([
        {
          webAuthnCredentials: [
            {
              credentialID: "cred-1",
              transports: ["usb"],
              createdAt: new Date(),
              lastUsed: null,
              deviceInfo: null,
            },
          ],
        },
      ]);
      const res = makeRes();
      await getWebAuthnCredentials(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.credentials).toHaveLength(1);
      expect(call[2].data.credentials[0].credentialID).toBe("cred-1");
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getWebAuthnCredentials(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("webAuthnCredentialCheck", () => {
    it("returns BAD_REQUEST when username missing", async () => {
      const res = makeRes();
      await webAuthnCredentialCheck(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.objectContaining({ hasCredentials: false }),
      );
    });

    it("returns hasCredentials=true when user has credentials", async () => {
      mockAggregateRaw.mockResolvedValue([
        { webAuthnCredentials: [{ credentialID: "cred-1" }] },
      ]);
      const res = makeRes();
      await webAuthnCredentialCheck(
        makeReq({ body: { username: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ hasCredentials: true }),
      );
    });

    it("returns hasCredentials=false when user has no credentials", async () => {
      mockAggregateRaw.mockResolvedValue([{ webAuthnCredentials: [] }]);
      const res = makeRes();
      await webAuthnCredentialCheck(
        makeReq({ body: { username: "alice" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ hasCredentials: false }),
      );
    });
  });

  describe("disableWebAuthn", () => {
    it("returns BAD_REQUEST when neither credentialId nor disableAll provided", async () => {
      mockAggregateRaw.mockResolvedValue([{ webAuthnCredentials: [] }]);
      const res = makeRes();
      await disableWebAuthn(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("clears all credentials when disableAll=true", async () => {
      mockAggregateRaw.mockResolvedValue([
        {
          webAuthnCredentials: [
            { credentialID: "cred-1" },
            { credentialID: "cred-2" },
          ],
        },
      ]);
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await disableWebAuthn(makeReq({ body: { disableAll: true } }), res);
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { webAuthnCredentials: [] } }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when credentialId not found", async () => {
      mockAggregateRaw.mockResolvedValue([
        { webAuthnCredentials: [{ credentialID: "cred-1" }] },
      ]);
      const res = makeRes();
      await disableWebAuthn(
        makeReq({ body: { credentialId: "cred-99" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("removes specific credential by credentialId", async () => {
      mockAggregateRaw.mockResolvedValue([
        {
          webAuthnCredentials: [
            { credentialID: "cred-1" },
            { credentialID: "cred-2" },
          ],
        },
      ]);
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await disableWebAuthn(makeReq({ body: { credentialId: "cred-1" } }), res);
      const updateArg = mockUserUpdate.mock.calls[0][0];
      expect(updateArg.data.webAuthnCredentials).toHaveLength(1);
      expect(updateArg.data.webAuthnCredentials[0].credentialID).toBe("cred-2");
    });
  });

  describe("webAuthnRegister", () => {
    it("calls grpcCall webAuthnRegistrationOptions and returns response", async () => {
      mockGrpcCall.mockResolvedValue({
        options: JSON.stringify({ challenge: "xyz" }),
      });
      const res = makeRes();
      await webAuthnRegister(makeReq(), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "webAuthnRegistrationOptions",
        expect.objectContaining({ userId: "user-1" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("webAuthnVerifyRegistration", () => {
    it("calls grpcCall webAuthnRegistrationVerify and returns response", async () => {
      mockGrpcCall.mockResolvedValue({ status: 0 });
      const res = makeRes();
      await webAuthnVerifyRegistration(
        makeReq({
          body: {
            credential: { id: "cred-1", deviceInfo: { name: "iPhone" } },
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "webAuthnRegistrationVerify",
        expect.objectContaining({
          userId: "user-1",
          credential: expect.any(String),
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("webAuthnLoginOptions", () => {
    it("returns success=false with message when grpc returns no options", async () => {
      mockGrpcCall.mockResolvedValue({ message: "No credentials registered" });
      const res = makeRes();
      await webAuthnLoginOptions(makeReq({ body: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ success: false }),
      );
    });

    it("returns parsed options when grpc returns options", async () => {
      mockGrpcCall.mockResolvedValue({
        options: JSON.stringify({ challenge: "test-challenge" }),
      });
      const res = makeRes();
      await webAuthnLoginOptions(makeReq({ body: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ challenge: "test-challenge" }),
        }),
      );
    });
  });

  describe("webAuthnVerifyLogin", () => {
    it("returns success=false with message when no accessToken", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Verification failed" });
      const res = makeRes();
      await webAuthnVerifyLogin(
        makeReq({ body: { username: "alice", credential: {} } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ success: false }),
      );
    });

    it("sets refresh cookie and returns tempToken on success", async () => {
      mockGrpcCall.mockResolvedValue({
        accessToken: "temp-access",
        refreshToken: "new-refresh",
      });
      const res = makeRes();
      await webAuthnVerifyLogin(
        makeReq({ body: { username: "alice", credential: {} } }),
        res,
      );
      expect(res.cookie).toHaveBeenCalledWith(
        "refresh_token",
        expect.any(String),
        expect.any(Object),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: { tempToken: "temp-access", verified: true },
        }),
      );
    });
  });

  describe("webAuthnLogin", () => {
    it("returns UN_AUTHORIZED when tempToken missing", async () => {
      const res = makeRes();
      await webAuthnLogin(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("returns UN_AUTHORIZED when jwt.verify throws", async () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error("Invalid token");
      });
      const res = makeRes();
      await webAuthnLogin(makeReq({ body: { tempToken: "invalid-jwt" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("returns accessToken and profile on valid token", async () => {
      mockJwtVerify.mockReturnValue({ userId: "user-1" });
      mockAggregateRaw.mockResolvedValue([profileRow]);
      const res = makeRes();
      await webAuthnLogin(makeReq({ body: { tempToken: "valid-jwt" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            accessToken: "valid-jwt",
            user: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe("googleAuthRedirect", () => {
    it("redirects to Google OAuth URL", () => {
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      process.env.GOOGLE_CALLBACK_URL = "https://api.example.com/callback";
      const res = makeRes();
      googleAuthRedirect(makeReq(), res);
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining("accounts.google.com"),
      );
    });
  });

  describe("googleAuthCallback", () => {
    it("redirects to login with error when error param present", async () => {
      const res = makeRes();
      await googleAuthCallback(
        makeReq({ query: { error: "access_denied" } }),
        res,
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining("error="),
      );
    });

    it("redirects to login with error when code missing", async () => {
      const res = makeRes();
      await googleAuthCallback(makeReq({ query: {} }), res);
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining("error="),
      );
    });

    it("redirects to login with error when grpc returns no accessToken", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Auth failed" });
      const res = makeRes();
      await googleAuthCallback(makeReq({ query: { code: "auth-code" } }), res);
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining("error="),
      );
    });

    it("sets cookie and redirects to home on successful auth", async () => {
      mockGrpcCall.mockResolvedValue({
        accessToken: "acc-token",
        refreshToken: "ref-token",
      });
      const res = makeRes();
      await googleAuthCallback(makeReq({ query: { code: "auth-code" } }), res);
      expect(res.cookie).toHaveBeenCalledWith(
        "refresh_token",
        expect.any(String),
        expect.any(Object),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining("oauth_success=1"),
      );
    });

    it("redirects to login with error on grpc throw", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await googleAuthCallback(makeReq({ query: { code: "auth-code" } }), res);
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining("error="),
      );
    });
  });

  describe("googleCalendarConnect", () => {
    it("returns UN_AUTHORIZED when there's no authenticated user", async () => {
      const res = makeRes();
      await googleCalendarConnect(makeReq({ user: undefined }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("signs a short-lived state token and returns the Google authorize URL", async () => {
      process.env.ACCESS_JWT_TOKEN = "test-jwt-secret";
      const mockJwtSign = (jwt as any).sign as jest.Mock;
      const { getCalendarAuthUrl } = jest.requireMock(
        "../services/googleCalendar",
      ) as any;
      const res = makeRes();
      await googleCalendarConnect(makeReq({ user: { userId: "user-1" } }), res);

      expect(mockJwtSign).toHaveBeenCalledWith(
        { userId: "user-1" },
        "test-jwt-secret",
        expect.objectContaining({ algorithm: "HS256", expiresIn: "10m" }),
      );
      expect(getCalendarAuthUrl).toHaveBeenCalledWith("signed-state-token");
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: {
            url: "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state-token",
          },
        }),
      );
    });
  });

  describe("googleCalendarStatus", () => {
    it("returns UN_AUTHORIZED when there's no authenticated user", async () => {
      const res = makeRes();
      await googleCalendarStatus(makeReq({ user: undefined }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.UN_AUTHORIZED,
        expect.any(Object),
      );
    });

    it("reports connected: true when the user has a stored refresh token", async () => {
      mockUserFindUnique.mockResolvedValue({
        googleCalendarRefreshToken: "encrypted-token",
      });
      const res = makeRes();
      await googleCalendarStatus(makeReq({ user: { userId: "user-1" } }), res);
      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
        select: { googleCalendarRefreshToken: true },
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: { connected: true } }),
      );
    });

    it("reports connected: false when there's no stored refresh token", async () => {
      mockUserFindUnique.mockResolvedValue({
        googleCalendarRefreshToken: null,
      });
      const res = makeRes();
      await googleCalendarStatus(makeReq({ user: { userId: "user-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({ data: { connected: false } }),
      );
    });
  });

  describe("googleCalendarCallback", () => {
    beforeEach(() => {
      process.env.CLIENT_URL = "https://app.praesto.cloud";
    });

    it("posts an error message and closes the popup when Google reports an error", async () => {
      const res = makeRes();
      await googleCalendarCallback(
        makeReq({ query: { error: "access_denied" } }),
        res,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Opener-Policy",
        "unsafe-none",
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("google-calendar-error"),
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("window.close()"),
      );
    });

    it("posts an error message when code or state is missing", async () => {
      const res = makeRes();
      await googleCalendarCallback(makeReq({ query: {} }), res);
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("google-calendar-error"),
      );
    });

    it("posts an error message when the state JWT fails verification", async () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error("invalid signature");
      });
      const res = makeRes();
      await googleCalendarCallback(
        makeReq({ query: { code: "auth-code", state: "bad-state" } }),
        res,
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("google-calendar-error"),
      );
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("exchanges the code, stores the encrypted refresh token, and posts success", async () => {
      const { exchangeCalendarCode } = jest.requireMock(
        "../services/googleCalendar",
      ) as any;
      mockJwtVerify.mockReturnValue({ userId: "user-1" });
      exchangeCalendarCode.mockResolvedValue("refresh-token-abc");
      mockUserUpdate.mockResolvedValue({});
      const res = makeRes();
      await googleCalendarCallback(
        makeReq({ query: { code: "auth-code", state: "good-state" } }),
        res,
      );

      expect(exchangeCalendarCode).toHaveBeenCalledWith("auth-code");
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { googleCalendarRefreshToken: "enc:refresh-token-abc" },
      });
      expect(res.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Opener-Policy",
        "unsafe-none",
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("google-calendar-connected"),
      );
      // postMessage's targetOrigin must be the frontend origin, not "*".
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("https://app.praesto.cloud"),
      );
    });

    it("posts an error message when the token exchange throws", async () => {
      const { exchangeCalendarCode } = jest.requireMock(
        "../services/googleCalendar",
      ) as any;
      mockJwtVerify.mockReturnValue({ userId: "user-1" });
      exchangeCalendarCode.mockRejectedValue(
        new Error("token exchange failed"),
      );
      const res = makeRes();
      await googleCalendarCallback(
        makeReq({ query: { code: "auth-code", state: "good-state" } }),
        res,
      );
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("google-calendar-error"),
      );
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });
});
