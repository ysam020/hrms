import {
  getNotifications,
  clearNotification,
  clearAllNotifications,
} from "../handlers/notification";

jest.mock("../grpc/clients", () => ({
  notificationClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: { SUCCESS: 200, INTERNAL_SERVER_ERROR: 500 },
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
    ...overrides,
  }) as any;

describe("notificationHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: [] });
  });

  describe("getNotifications", () => {
    it("calls getNotifications with userId and default pagination", async () => {
      const res = makeRes();
      await getNotifications(makeReq({ query: {} }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "getNotifications",
        expect.objectContaining({ userId: "user-1", page: 1, limit: 50 }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("caps limit at 100", async () => {
      await getNotifications(makeReq({ query: { limit: "999" } }), makeRes());
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "getNotifications",
        expect.objectContaining({ limit: 100 }),
      );
    });

    it("passes unreadOnly flag when set", async () => {
      await getNotifications(
        makeReq({ query: { unreadOnly: "true" } }),
        makeRes(),
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "getNotifications",
        expect.objectContaining({ unreadOnly: true }),
      );
    });

    it("returns INTERNAL on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await getNotifications(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("clearNotification", () => {
    it("calls markAsRead with userId and notificationId from params", async () => {
      const res = makeRes();
      await clearNotification(makeReq({ params: { _id: "notif-1" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "markAsRead",
        expect.objectContaining({
          userId: "user-1",
          notificationIds: ["notif-1"],
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
      await clearNotification(makeReq({ params: { _id: "notif-1" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("clearAllNotifications", () => {
    it("calls markAllAsRead with userId", async () => {
      const res = makeRes();
      await clearAllNotifications(makeReq(), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "markAllAsRead",
        expect.objectContaining({ userId: "user-1", notificationIds: [] }),
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
      await clearAllNotifications(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
