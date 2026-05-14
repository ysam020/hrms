import { prisma } from "@hrms/db";
import {
  updateSalary,
  getUserSalary,
  generateSalarySlip,
} from "../handlers/salary";

jest.mock("../grpc/clients", () => ({
  salaryClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, statusCode: number, data: any) =>
    res.json({ statusCode, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { userId: "user-id-1" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;

describe("updateSalary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ message: "Salary updated" });
  });

  it("calls updateSalaryStructure with correct fields", async () => {
    const res = makeRes();
    await updateSalary(
      makeReq({
        body: {
          userId: "emp-1",
          basicSalary: 50000,
          components: [{ name: "HRA", value: 5000 }],
          effectiveDate: "2024-04-01",
          createdBy: "admin",
        },
      }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateSalaryStructure",
      expect.objectContaining({
        userId: "emp-1",
        basicSalary: 50000,
        components: [{ name: "HRA", value: 5000 }],
        effectiveDate: "2024-04-01",
        createdBy: "admin",
      }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("defaults missing fields to empty/zero values", async () => {
    const res = makeRes();
    await updateSalary(makeReq({ body: {} }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateSalaryStructure",
      expect.objectContaining({
        userId: "",
        basicSalary: 0,
        components: [],
        effectiveDate: "",
        createdBy: "",
      }),
    );
  });

  it("defaults non-array components to empty array", async () => {
    const res = makeRes();
    await updateSalary(makeReq({ body: { components: "not-an-array" } }), res);

    const call = mockGrpcCall.mock.calls[0][2];
    expect(call.components).toEqual([]);
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await updateSalary(makeReq({ body: {} }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getUserSalary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("allows superuser to access any employee payslip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getPayslip",
      expect.objectContaining({ userId: "emp-1", year: 2024, month: 3 }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("allows non-superuser to access their own payslip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "user-id-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("returns FORBIDDEN when non-superuser tries to access another user's payslip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "other-id", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.FORBIDDEN,
      expect.any(Object),
    );
  });

  it("parses year and month as integers", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "03" } }),
      res,
    );

    const call = mockGrpcCall.mock.calls[0][2];
    expect(typeof call.year).toBe("number");
    expect(typeof call.month).toBe("number");
    expect(call.year).toBe(2024);
    expect(call.month).toBe(3);
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));

    const res = makeRes();
    await getUserSalary(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("generateSalarySlip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("allows superuser to generate slip for any employee", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getPayslip",
      expect.objectContaining({ userId: "emp-1" }),
    );
  });

  it("returns FORBIDDEN when non-superuser tries to generate another user's slip", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "other-id", year: "2024", month: "3" } }),
      res,
    );

    expect(mockGrpcCall).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.FORBIDDEN,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR on grpc failure", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));

    const res = makeRes();
    await generateSalarySlip(
      makeReq({ params: { userId: "emp-1", year: "2024", month: "3" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});
