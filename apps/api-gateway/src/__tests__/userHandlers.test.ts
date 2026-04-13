import { prisma } from "@hrms/db";
import {
  getAllUsers,
  getUserData,
  saveFcmToken,
  disablePushNotifications,
} from "../handlers/user";

jest.mock("../grpc/clients", () => {
  const fn = jest.fn();
  return { userClient: {}, grpcCall: fn, userCall: fn };
});

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  camelToSnake: jest.fn((obj: any) => obj),
  RESPONSE_STATUS: { SUCCESS: 200, INTERNAL_SERVER_ERROR: 500 },
  errorMessage: { GENERAL: { INTERNAL_ERROR: "Internal server error" } },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ip: "127.0.0.1",
    ...overrides,
  }) as any;

describe("userHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: null, message: "OK", status: 0 });
  });

  describe("getAllUsers", () => {
    it("calls listUsers with pagination and filters", async () => {
      const res = makeRes();
      await getAllUsers(
        makeReq({
          query: { page: "2", limit: "20", search: "john", role: "HR" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "listUsers",
        expect.objectContaining({
          page: 2,
          limit: 20,
          search: "john",
          role: "HR",
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("caps limit at 200", async () => {
      await getAllUsers(makeReq({ query: { limit: "999" } }), makeRes());
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "listUsers",
        expect.objectContaining({ limit: 200 }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await getAllUsers(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getUserData", () => {
    it("calls getUser with username from params", async () => {
      const res = makeRes();
      await getUserData(makeReq({ params: { username: "john" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "getUser",
        expect.objectContaining({ userId: "john" }),
      );
    });

    it("returns response directly when no data field", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Not found" });
      const res = makeRes();
      await getUserData(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await getUserData(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("saveFcmToken", () => {
    it("calls registerFcmToken with user's userId and token info", async () => {
      const res = makeRes();
      await saveFcmToken(
        makeReq({
          body: {
            fcmToken: "tok-123",
            deviceFingerprint: "fp-1",
            deviceInfo: {
              browser: "Chrome",
              os: "MacOS",
              deviceType: "desktop",
            },
          },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "registerFcmToken",
        expect.objectContaining({
          userId: "user-1",
          token: "tok-123",
          deviceFingerprint: "fp-1",
          browser: "Chrome",
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await saveFcmToken(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("disablePushNotifications", () => {
    it("calls removeFcmToken with disableAll flag", async () => {
      const res = makeRes();
      await disablePushNotifications(
        makeReq({ body: { disableAll: true } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "removeFcmToken",
        expect.objectContaining({ userId: "user-1", disableAll: true }),
      );
    });

    it("calls removeFcmToken with deviceFingerprint", async () => {
      await disablePushNotifications(
        makeReq({ body: { deviceFingerprint: "fp-1" } }),
        makeRes(),
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "removeFcmToken",
        expect.objectContaining({ deviceFingerprint: "fp-1" }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await disablePushNotifications(makeReq({ body: {} }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
