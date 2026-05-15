import { prisma } from "@hrms/db";
import {
  addAttendance,
  getAttendances,
  getAllAttendances,
  attendanceCorrection,
  getAttendanceSummary,
  attendanceInsights,
} from "../handlers/attendance";

jest.mock("../grpc/clients", () => ({
  attendanceClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findUnique: jest.fn(), findMany: jest.fn() },
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
const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockRecordFindMany = (prisma as any).attendanceRecord
  .findMany as jest.Mock;
const mockLeaveBalanceFindUnique = (prisma as any).leaveBalance
  .findUnique as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { userId: "user-id-1" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;

describe("addAttendance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ message: "Checked in", status: 0 });
  });

  it("calls markAttendance with userId and type", async () => {
    const res = makeRes();
    await addAttendance(makeReq({ body: { type: "CHECK_IN" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "markAttendance",
      expect.objectContaining({ userId: "user-id-1", type: "CHECK_IN" }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("defaults optional fields to empty/zero when not provided", async () => {
    const res = makeRes();
    await addAttendance(makeReq({ body: { type: "CHECK_OUT" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "markAttendance",
      expect.objectContaining({
        latitude: 0,
        longitude: 0,
        deviceInfo: "",
        imageUrl: "",
      }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await addAttendance(makeReq({ body: { type: "CHECK_IN" } }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getAttendances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: [] });
  });

  it("constructs correct startDate and endDate from month and year params", async () => {
    const res = makeRes();
    await getAttendances(
      makeReq({ params: { month: "3", year: "2024" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getAttendance",
      expect.objectContaining({
        startDate: "2024-03-01",
        endDate: "2024-03-31",
      }),
    );
  });

  it("zero-pads single digit months", async () => {
    const res = makeRes();
    await getAttendances(
      makeReq({ params: { month: "5", year: "2024" } }),
      res,
    );

    const call = mockGrpcCall.mock.calls[0][2];
    expect(call.startDate).toBe("2024-05-01");
    expect(call.endDate).toBe("2024-05-31");
  });

  it("passes userId from authenticated user", async () => {
    const res = makeRes();
    await getAttendances(
      makeReq({ params: { month: "3", year: "2024" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getAttendance",
      expect.objectContaining({ userId: "user-id-1" }),
    );
  });
});

describe("getAllAttendances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([]);
    mockRecordFindMany.mockResolvedValue([]);
    (prisma.leaveBalance.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("returns paginated attendance records for all employees", async () => {
    (prisma.user.count as jest.Mock).mockResolvedValue(2);
    mockUserFindMany.mockResolvedValue([
      { id: "u1", username: "alice" },
      { id: "u2", username: "bob" },
    ]);
    const res = makeRes();
    await getAllAttendances(
      makeReq({ params: { month: "3", year: "2024" }, query: {} }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.objectContaining({
        data: expect.objectContaining({
          pagination: expect.objectContaining({ totalCount: 2 }),
        }),
      }),
    );
  });

  it("caps limit at 200", async () => {
    const res = makeRes();
    await getAllAttendances(
      makeReq({
        params: { month: "3", year: "2024" },
        query: { limit: "500" },
      }),
      res,
    );

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("defaults limit to 50 when not provided", async () => {
    const res = makeRes();
    await getAllAttendances(
      makeReq({ params: { month: "3", year: "2024" }, query: {} }),
      res,
    );

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});

describe("attendanceCorrection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    mockGrpcCall.mockResolvedValue({ message: "Corrected" });
  });

  it("returns BAD_REQUEST when userId is missing", async () => {
    const res = makeRes();
    await attendanceCorrection(makeReq({ body: { date: "2024-03-01" } }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.any(Object),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("calls correctAttendance with userId and correctedBy", async () => {
    const res = makeRes();
    await attendanceCorrection(
      makeReq({
        body: {
          userId: "john",
          date: "2024-03-01",
          timeIn: "09:00",
          timeOut: "17:00",
        },
      }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "correctAttendance",
      expect.objectContaining({ userId: "john", correctedBy: "user-id-1" }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await attendanceCorrection(makeReq({ body: { userId: "john" } }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getAttendanceSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeaveBalanceFindUnique.mockResolvedValue(null);
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 15)); // March 15 — mid-month
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts Present records correctly", async () => {
    mockRecordFindMany.mockResolvedValue([
      { date: new Date(2024, 2, 4), status: "Present", isCorrected: false },
      { date: new Date(2024, 2, 5), status: "Present", isCorrected: false },
      { date: new Date(2024, 2, 6), status: "Late", isCorrected: false },
    ]);

    const res = makeRes();
    await getAttendanceSummary(
      makeReq({ params: { username: "john", year: "2024", month: "3" } }),
      res,
    );

    const responseData = mockApiResponse.mock.calls[0][2];
    expect(responseData.data.presents).toBe(2);
  });

  it("counts Half Day records separately", async () => {
    mockRecordFindMany.mockResolvedValue([
      { date: new Date(2024, 2, 4), status: "Half Day", isCorrected: false },
    ]);

    const res = makeRes();
    await getAttendanceSummary(
      makeReq({ params: { username: "john", year: "2024", month: "3" } }),
      res,
    );

    const responseData = mockApiResponse.mock.calls[0][2];
    expect(responseData.data.halfDays).toBe(1);
  });

  it("counts corrections used", async () => {
    mockRecordFindMany.mockResolvedValue([
      { date: new Date(2024, 2, 4), status: "Present", isCorrected: true },
      { date: new Date(2024, 2, 5), status: "Present", isCorrected: false },
    ]);

    const res = makeRes();
    await getAttendanceSummary(
      makeReq({ params: { username: "john", year: "2024", month: "3" } }),
      res,
    );

    const responseData = mockApiResponse.mock.calls[0][2];
    expect(responseData.data.correctionsUsed).toBe(1);
  });

  it("reads usedPL and usedLWP from leave balance for the requested month", async () => {
    mockRecordFindMany.mockResolvedValue([]);
    mockLeaveBalanceFindUnique.mockResolvedValue({
      balances: [{ year: 2024, month: 3, usedPL: 2, usedLWP: 1 }],
    });

    const res = makeRes();
    await getAttendanceSummary(
      makeReq({ params: { username: "john", year: "2024", month: "3" } }),
      res,
    );

    const responseData = mockApiResponse.mock.calls[0][2];
    expect(responseData.data.paidLeaves).toBe(2);
    expect(responseData.data.unpaidLeaves).toBe(1);
    expect(responseData.data.totalLeaves).toBe(3);
  });

  it("returns INTERNAL_SERVER_ERROR on database error", async () => {
    mockRecordFindMany.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await getAttendanceSummary(
      makeReq({ params: { username: "john", year: "2024", month: "3" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("attendanceInsights", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindMany.mockResolvedValue([]);
    mockRecordFindMany.mockResolvedValue([]);
  });

  it("returns SUCCESS with correct top-level shape on empty data", async () => {
    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.objectContaining({
        data: expect.objectContaining({
          primaryMetrics: expect.objectContaining({
            overallAttendanceRate: 0,
            correctionRate: 0,
            automationRate: 0,
          }),
          employeeRiskAssessment: [],
          teamPerformance: [],
          trendAnalysis: expect.objectContaining({ trendDirection: "stable" }),
          attendancePatterns: expect.objectContaining({ peakHours: [] }),
        }),
      }),
    );
  });

  it("calculates overallAttendanceRate from Present and Half Day records", async () => {
    mockRecordFindMany.mockResolvedValue([
      {
        username: "alice",
        status: "Present",
        isCorrected: false,
        workingHours: 8,
        timeIn: "09:00",
        date: new Date("2024-03-01"),
      },
      {
        username: "alice",
        status: "Half Day",
        isCorrected: false,
        workingHours: 4,
        timeIn: "09:00",
        date: new Date("2024-03-04"),
      },
      {
        username: "alice",
        status: "Absent",
        isCorrected: false,
        workingHours: null,
        timeIn: null,
        date: new Date("2024-03-05"),
      },
      {
        username: "alice",
        status: "Late",
        isCorrected: false,
        workingHours: 7,
        timeIn: "10:00",
        date: new Date("2024-03-06"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      { username: "alice", department: "Engineering" },
    ]);

    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);

    const call = mockApiResponse.mock.calls[0][2];
    // 3 out of 4 records are Present/Late/HalfDay → 75%
    expect(call.data.primaryMetrics.overallAttendanceRate).toBe(75);
  });

  it("assigns High risk level when attendance rate is 0", async () => {
    mockRecordFindMany.mockResolvedValue([
      {
        userId: "bob-id",
        status: "Absent",
        isCorrected: true,
        workingHours: null,
        timeIn: null,
        date: new Date("2024-03-01"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "bob-id", department: "HR" }]);

    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);

    const call = mockApiResponse.mock.calls[0][2];
    const emp = call.data.employeeRiskAssessment[0];
    expect(emp.userId).toBe("bob-id");
    expect(emp.riskLevel).toBe("High");
  });

  it("assigns Low risk level for perfect attendance with full hours", async () => {
    mockRecordFindMany.mockResolvedValue([
      {
        username: "carol",
        status: "Present",
        isCorrected: false,
        workingHours: 9,
        timeIn: "09:00",
        date: new Date("2024-03-01"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      { username: "carol", department: "Finance" },
    ]);

    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);

    const call = mockApiResponse.mock.calls[0][2];
    const emp = call.data.employeeRiskAssessment[0];
    expect(emp.riskLevel).toBe("Low");
  });

  it("groups records by department for teamPerformance", async () => {
    mockRecordFindMany.mockResolvedValue([
      {
        userId: "alice-id",
        status: "Present",
        isCorrected: false,
        workingHours: 8,
        timeIn: "09:00",
        date: new Date("2024-03-01"),
      },
      {
        userId: "bob-id",
        status: "Absent",
        isCorrected: false,
        workingHours: null,
        timeIn: null,
        date: new Date("2024-03-01"),
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "alice-id", department: "Engineering" },
      { id: "bob-id", department: "HR" },
    ]);

    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);

    const call = mockApiResponse.mock.calls[0][2];
    const depts = call.data.teamPerformance.map((t: any) => t.department);
    expect(depts).toContain("Engineering");
    expect(depts).toContain("HR");
  });

  it("handles last_month period without error", async () => {
    const res = makeRes();
    await attendanceInsights(makeReq({ query: { period: "last_month" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("handles quarter period without error", async () => {
    const res = makeRes();
    await attendanceInsights(makeReq({ query: { period: "quarter" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("handles year period without error", async () => {
    const res = makeRes();
    await attendanceInsights(makeReq({ query: { period: "year" } }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR on DB error", async () => {
    mockRecordFindMany.mockRejectedValue(new Error("DB error"));
    const res = makeRes();
    await attendanceInsights(makeReq({ query: {} }), res);
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});
