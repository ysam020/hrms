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
} from "../handlers/auth";

jest.mock("../grpc/clients", () => {
  const fn = jest.fn();
  return { authClient: {}, grpcCall: fn, authCall: fn };
});

jest.mock("@hrms/db", () => ({
  prisma: {
    user: {
      aggregateRaw: jest.fn(),
      update: jest.fn(),
    },
  },
}));

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
  errorMessage: { GENERAL: { INTERNAL_ERROR: "Internal server error" } },
  safeDecrypt: jest.fn((v: any) => v || ""),
  grpcToHttpStatus: jest.fn(() => 500),
}));

jest.mock("@hrms/crypto", () => ({
  aesEncrypt: jest.fn((v: string) => `enc:${v}`),
  aesDecrypt: jest.fn((v: string) => {
    if (v === "bad-token") throw new Error("Decrypt failed");
    return v;
  }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("jsonwebtoken", () => ({
  __esModule: true,
  default: {
    verify: jest.fn(),
  },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { aesDecrypt } from "@hrms/crypto";
import jwt from "jsonwebtoken";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockAesDecrypt = aesDecrypt as jest.Mock;
const mockJwtVerify = (jwt as any).verify as jest.Mock;
const mockAggregateRaw = (prisma as any).user.aggregateRaw as jest.Mock;
const mockUserUpdate = (prisma as any).user.update as jest.Mock;

const makeRes = () =>
  ({
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  }) as any;

const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "aabbccddeeff001122334455", email: "user@test.com" },
    query: {},
    params: {},
    body: {},
    cookies: {},
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

    it("returns UN_AUTHORIZED when grpc returns no accessToken", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Token expired" });
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
      expect(mockGrpcCall).toHaveBeenCalledWith("logout", {
        userId: "aabbccddeeff001122334455",
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
        "webAuthnRegistrationOptions",
        expect.objectContaining({ userId: "aabbccddeeff001122334455" }),
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
        "webAuthnRegistrationVerify",
        expect.objectContaining({
          userId: "aabbccddeeff001122334455",
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
});
