import { prisma } from "@hrms/db";
import {
  getAllUsers,
  getUserData,
  saveFcmToken,
  disablePushNotifications,
} from "../handlers/user";

jest.mock("../grpc/clients", () => ({
  userClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  hasPrivilegedRole: (
    role: string | null | undefined,
    allowed: readonly string[] = ["owner", "admin"],
  ) => !!role && allowed.includes(role),
  HR_ROLES: ["owner", "admin", "hr"],
  PRIVILEGED_ROLES: ["owner", "admin"],
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  camelToSnake: jest.fn((obj: any) => obj),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    INTERNAL_SERVER_ERROR: 500,
    BAD_REQUEST: 400,
  },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockUserFindFirst = (prisma as any).user.findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1", tenantRole: "employee" },
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
    mockTenantFindUnique.mockResolvedValue({ workState: null });
    mockUserFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
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
        expect.anything(),
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
        expect.anything(),
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
        expect.anything(),
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

    it("transforms user data with camelToSnake and parses role when response.data is present", async () => {
      const userData = {
        id: "u1",
        role: "HR,Manager",
        isSuperUser: true,
        employeeStatus: "Active",
        dateOfTermination: null,
        reasonForTermination: null,
        dateOfAbscond: null,
      };
      mockGrpcCall.mockResolvedValue({
        data: userData,
        message: "User fetched",
        status: 0,
      });
      const res = makeRes();
      await getUserData(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            role: ["HR", "Manager"],
            isSuperUser: true,
            employeeStatus: "Active",
          }),
        }),
      );
    });

    it("sets role to empty array when role field is empty", async () => {
      mockGrpcCall.mockResolvedValue({
        data: { id: "u2", role: "", isSuperUser: false },
        message: "OK",
        status: 0,
      });
      const res = makeRes();
      await getUserData(makeReq({ params: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({ role: [] }),
        }),
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

    // Regression coverage for a real bug: this endpoint used to leak salary
    // data unconditionally (never stripped for anyone) and gated
    // aadhar/bank/pan on a broken "isSuperUser only" + "userId === username"
    // self-check that could never be true (userId is a database id, the
    // route param is a username) — any authenticated employee could read
    // any other employee's full salary breakdown by visiting this endpoint.
    describe("PII/compensation data exposure", () => {
      const targetUser = { id: "target-1", role: "", isSuperUser: false };
      const salaryRow = {
        salary: 90000,
        salaryBasicPay: 45000,
        salaryHra: 20000,
        salaryConveyance: 5000,
        salaryPf: 5000,
        salaryEsi: 1000,
        salaryPt: 200,
        salaryComponentBreakdown: [],
      };

      beforeEach(() => {
        mockGrpcCall.mockResolvedValue({
          data: {
            ...targetUser,
            aadhar_no: "1234-5678-9012",
            bank_account_no: "ACC123",
            pan_no: "ABCDE1234F",
          },
          message: "OK",
          status: 0,
        });
        mockUserFindFirst.mockResolvedValue(salaryRow);
      });

      it("strips aadhar/bank/pan/salary for a non-owner, non-privileged caller", async () => {
        const res = makeRes();
        await getUserData(
          makeReq({
            user: { userId: "caller-1", tenantRole: "employee" },
            params: { username: "target" },
          }),
          res,
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.aadhar_no).toBeUndefined();
        expect(payload.data.bank_account_no).toBeUndefined();
        expect(payload.data.pan_no).toBeUndefined();
        expect(payload.data.salary).toBeUndefined();
        expect(payload.data.salaryStructure).toBeUndefined();
      });

      it("keeps full data when the caller is viewing their own record", async () => {
        const res = makeRes();
        await getUserData(
          makeReq({
            user: { userId: "target-1", tenantRole: "employee" },
            params: { username: "target" },
          }),
          res,
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.aadhar_no).toBe("1234-5678-9012");
        expect(payload.data.salary).toBe(90000);
      });

      it.each(["owner", "admin", "hr"])(
        "keeps full data for another employee when caller's tenant role is '%s'",
        async (tenantRole) => {
          const res = makeRes();
          await getUserData(
            makeReq({
              user: { userId: "caller-1", tenantRole },
              params: { username: "target" },
            }),
            res,
          );
          const [, , payload] = mockApiResponse.mock.calls[0];
          expect(payload.data.bank_account_no).toBe("ACC123");
          expect(payload.data.salary).toBe(90000);
        },
      );

      it("keeps full data for another employee when the caller is a superuser", async () => {
        mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
        const res = makeRes();
        await getUserData(
          makeReq({
            user: { userId: "caller-1", tenantRole: "employee" },
            params: { username: "target" },
          }),
          res,
        );
        const [, , payload] = mockApiResponse.mock.calls[0];
        expect(payload.data.pan_no).toBe("ABCDE1234F");
        expect(payload.data.salary).toBe(90000);
      });
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
        expect.anything(),
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
      await saveFcmToken(
        makeReq({ body: { fcmToken: "tok-123", deviceFingerprint: "fp-1" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST without calling registerFcmToken when fcmToken is missing", async () => {
      const res = makeRes();
      await saveFcmToken(makeReq({ body: { deviceFingerprint: "fp-1" } }), res);
      expect(mockGrpcCall).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST without calling registerFcmToken when deviceFingerprint is missing", async () => {
      const res = makeRes();
      await saveFcmToken(makeReq({ body: { fcmToken: "tok-123" } }), res);
      expect(mockGrpcCall).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when the body is empty", async () => {
      const res = makeRes();
      await saveFcmToken(makeReq({ body: {} }), res);
      expect(mockGrpcCall).not.toHaveBeenCalled();
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
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
        expect.anything(),
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
        expect.anything(),
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
