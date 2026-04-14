import {
  getDashboardStats,
  getHeadcount,
  getAttendanceAnalytics,
  getLeaveAnalytics,
  getRecruitmentAnalytics,
  getSalaryAnalytics,
  getTurnoverAnalytics,
  getPerformanceAnalytics,
} from "../handlers/analytics";

jest.mock("../grpc/clients", () => ({
  analyticsClient: {},
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
    query: {},
    params: {},
    body: {},
    ...overrides,
  }) as any;

describe("analytics handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("getDashboardStats calls GetDashboardStats with period and department", async () => {
    const res = makeRes();
    await getDashboardStats(
      makeReq({ query: { period: "week", department: "Engineering" } }),
      res,
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetDashboardStats",
      expect.objectContaining({ period: "week", department: "Engineering" }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("getDashboardStats defaults period to 'month'", async () => {
    await getDashboardStats(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetDashboardStats",
      expect.objectContaining({ period: "month" }),
    );
  });

  it("getDashboardStats returns INTERNAL on error", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await getDashboardStats(makeReq(), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });

  it("getHeadcount calls GetHeadcount", async () => {
    await getHeadcount(makeReq({ query: { department: "HR" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetHeadcount",
      expect.objectContaining({ department: "HR" }),
    );
  });

  it("getAttendanceAnalytics calls GetAttendanceAnalytics", async () => {
    await getAttendanceAnalytics(
      makeReq({ query: { month: "3", year: "2024" } }),
      makeRes(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetAttendanceAnalytics",
      expect.objectContaining({ month: "3", year: "2024" }),
    );
  });

  it("getLeaveAnalytics calls GetLeaveAnalytics with leaveType", async () => {
    await getLeaveAnalytics(makeReq({ query: { leaveType: "PL" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetLeaveAnalytics",
      expect.objectContaining({ leaveType: "PL" }),
    );
  });

  it("getRecruitmentAnalytics calls GetRecruitmentAnalytics", async () => {
    await getRecruitmentAnalytics(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetRecruitmentAnalytics",
      expect.any(Object),
    );
  });

  it("getSalaryAnalytics calls GetSalaryAnalytics", async () => {
    await getSalaryAnalytics(makeReq({ query: { year: "2024" } }), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetSalaryAnalytics",
      expect.objectContaining({ year: "2024" }),
    );
  });

  it("getTurnoverAnalytics calls GetTurnoverAnalytics", async () => {
    await getTurnoverAnalytics(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetTurnoverAnalytics",
      expect.any(Object),
    );
  });

  it("getPerformanceAnalytics calls GetPerformanceAnalytics with default quarter", async () => {
    await getPerformanceAnalytics(makeReq(), makeRes());
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "GetPerformanceAnalytics",
      expect.objectContaining({ period: "quarter" }),
    );
  });
});
