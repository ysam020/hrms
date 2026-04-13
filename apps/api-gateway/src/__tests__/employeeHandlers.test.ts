import { prisma } from "@hrms/db";
import {
  editEmployeeDetails,
  getEmployeeDetails,
  employeeInsights,
  completeKyc,
  editKyc,
  kycApproval,
  viewAllKycs,
  getKycInsights,
} from "../handlers/employee";

jest.mock("../grpc/clients", () => {
  const fn = jest.fn();
  return { employeeClient: {}, grpcCall: fn, employeeCall: fn };
});

jest.mock("@hrms/db", () => ({
  prisma: {
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      aggregateRaw: jest.fn(),
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
  },
  errorMessage: { GENERAL: { INTERNAL_ERROR: "Internal server error" } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserCount = (prisma as any).user.count as jest.Mock;
const mockUserGroupBy = (prisma as any).user.groupBy as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserAggregateRaw = (prisma as any).user.aggregateRaw as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    user: { userId: "user-1" },
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("employeeHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cacheManager.get as jest.Mock).mockResolvedValue(null);
    (cacheManager.set as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
    (cacheManager.delete as jest.Mock).mockResolvedValue(undefined);
  });

  describe("editEmployeeDetails", () => {
    it("calls grpcCall updateEmployee with userId and body fields", async () => {
      mockGrpcCall.mockResolvedValue({ message: "Updated" });
      const res = makeRes();
      await editEmployeeDetails(
        makeReq({ body: { firstName: "John", lastName: "Doe" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "updateEmployee",
        expect.objectContaining({
          id: "user-1",
          firstName: "John",
          lastName: "Doe",
        }),
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
      await editEmployeeDetails(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getEmployeeDetails", () => {
    it("calls grpcCall getEmployee with resolved id from params", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "employee-id-1" });
      mockGrpcCall.mockResolvedValue({ data: {} });
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "getEmployee",
        expect.objectContaining({ id: "employee-id-1" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when username does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "ghost" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "employee-id-1" });
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await getEmployeeDetails(makeReq({ params: { username: "alice" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("employeeInsights", () => {
    it("returns overview counts and departmentBreakdown", async () => {
      mockUserCount
        .mockResolvedValueOnce(10) // Active
        .mockResolvedValueOnce(2) // Resigned
        .mockResolvedValueOnce(1) // Terminated
        .mockResolvedValueOnce(0) // Absconded
        .mockResolvedValueOnce(13); // Total
      mockUserGroupBy.mockResolvedValue([
        { department: "Engineering", _count: { id: 5 } },
        { department: "HR", _count: { id: 3 } },
      ]);
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({
              activeEmployees: 10,
              resignedEmployees: 2,
              terminatedEmployees: 1,
              abscondedEmployees: 0,
              totalEmployees: 13,
            }),
            departmentBreakdown: expect.arrayContaining([
              expect.objectContaining({ department: "Engineering", count: 5 }),
            ]),
          }),
        }),
      );
    });

    it("filters out null departments", async () => {
      mockUserCount.mockResolvedValue(0);
      mockUserGroupBy.mockResolvedValue([
        { department: null, _count: { id: 3 } },
        { department: "HR", _count: { id: 2 } },
      ]);
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      const breakdown = call[2].data.departmentBreakdown;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].department).toBe("HR");
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserCount.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await employeeInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("completeKyc", () => {
    it("calls grpcCall submitKyc with userId and KYC fields", async () => {
      mockGrpcCall.mockResolvedValue({ message: "KYC submitted" });
      const res = makeRes();
      await completeKyc(
        makeReq({
          body: { aadharNo: "1234", panNo: "ABCDE1234F", bankName: "HDFC" },
        }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "submitKyc",
        expect.objectContaining({
          userId: "user-1",
          aadharNo: "1234",
          panNo: "ABCDE1234F",
        }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
      const res = makeRes();
      await completeKyc(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("editKyc", () => {
    it("calls grpcCall submitKyc with user fields (same as completeKyc)", async () => {
      mockGrpcCall.mockResolvedValue({ message: "KYC updated" });
      const res = makeRes();
      await editKyc(
        makeReq({ body: { bankName: "HDFC", ifscCode: "HDFC0001" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith(
        "submitKyc",
        expect.objectContaining({ userId: "user-1", bankName: "HDFC" }),
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });
  });

  describe("kycApproval", () => {
    it("returns BAD_REQUEST when username missing", async () => {
      const res = makeRes();
      await kycApproval(makeReq({ body: { kyc_approval: "Approved" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns BAD_REQUEST when kyc_approval missing", async () => {
      const res = makeRes();
      await kycApproval(makeReq({ body: { username: "john" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.BAD_REQUEST,
        expect.any(Object),
      );
    });

    it("returns NOT_FOUND when user does not exist", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const res = makeRes();
      await kycApproval(
        makeReq({ body: { username: "john", kyc_approval: "Approved" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.NOT_FOUND,
        expect.any(Object),
      );
    });

    it("calls approveKyc when kyc_approval is Approved", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      mockGrpcCall.mockResolvedValue({ message: "Approved" });
      const res = makeRes();
      await kycApproval(
        makeReq({ body: { username: "john", kyc_approval: "Approved" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith("approveKyc", {
        employeeId: "u1",
      });
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.any(Object),
      );
    });

    it("calls rejectKyc when kyc_approval is Rejected", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "u1" });
      mockGrpcCall.mockResolvedValue({ message: "Rejected" });
      const res = makeRes();
      await kycApproval(
        makeReq({ body: { username: "john", kyc_approval: "Rejected" } }),
        res,
      );
      expect(mockGrpcCall).toHaveBeenCalledWith("rejectKyc", {
        employeeId: "u1",
      });
    });

    it("returns INTERNAL_SERVER_ERROR on error", async () => {
      mockUserFindUnique.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await kycApproval(
        makeReq({ body: { username: "john", kyc_approval: "Approved" } }),
        res,
      );
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("viewAllKycs", () => {
    it("returns paginated KYC list", async () => {
      mockUserAggregateRaw
        .mockResolvedValueOnce([{ username: "john", kyc_approval: "Approved" }])
        .mockResolvedValueOnce([{ total: 1 }]);
      const res = makeRes();
      await viewAllKycs(makeReq({ query: { page: "1", limit: "10" } }), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            pagination: expect.objectContaining({
              totalCount: 1,
              totalPages: 1,
            }),
          }),
        }),
      );
    });

    it("returns totalCount 0 when count pipeline returns empty array", async () => {
      mockUserAggregateRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const res = makeRes();
      await viewAllKycs(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.pagination.totalCount).toBe(0);
    });

    it("caps limit at 100", async () => {
      mockUserAggregateRaw.mockResolvedValue([]);
      const res = makeRes();
      await viewAllKycs(makeReq({ query: { limit: "500" } }), res);
      // Second aggregateRaw call is for count; first is for rows
      const pipeline = mockUserAggregateRaw.mock.calls[0][0].pipeline;
      const limitStage = pipeline.find((s: any) => s.$limit !== undefined);
      expect(limitStage.$limit).toBe(100);
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await viewAllKycs(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });

  describe("getKycInsights", () => {
    it("returns KYC stats with completionRate", async () => {
      mockUserAggregateRaw.mockResolvedValue([
        { approved: 8, pending: 2, rejected: 1, total: 11 },
      ]);
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.SUCCESS,
        expect.objectContaining({
          data: expect.objectContaining({
            overview: expect.objectContaining({
              approvedKyc: 8,
              pendingKyc: 2,
              rejectedKyc: 1,
              totalEmployees: 11,
              completionRate: expect.any(Number),
            }),
          }),
        }),
      );
    });

    it("returns zero stats when no rows returned", async () => {
      mockUserAggregateRaw.mockResolvedValue([]);
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      const call = mockApiResponse.mock.calls[0];
      expect(call[2].data.overview.approvedKyc).toBe(0);
      expect(call[2].data.overview.completionRate).toBe(0);
    });

    it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
      mockUserAggregateRaw.mockRejectedValue(new Error("DB error"));
      const res = makeRes();
      await getKycInsights(makeReq(), res);
      expect(mockApiResponse).toHaveBeenCalledWith(
        res,
        RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
        expect.any(Object),
      );
    });
  });
});
