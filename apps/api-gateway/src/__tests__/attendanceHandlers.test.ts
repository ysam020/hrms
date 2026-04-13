import { prisma } from "@hrms/db";
import {
  addAttendance,
  getAttendances,
  getAllAttendances,
  attendanceCorrection,
  getAttendanceSummary,
} from "../handlers/attendance";

jest.mock("../grpc/clients", () => {
  const fn = jest.fn();
  return { attendanceClient: {}, grpcCall: fn, attendanceCall: fn };
});

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    leaveBalance: { findUnique: jest.fn() },
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
  errorMessage: { GENERAL: { INTERNAL_ERROR: "Internal server error" } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { grpcCall } from "../grpc/clients";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
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

    const call = mockGrpcCall.mock.calls[0][1];
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
      "getAttendance",
      expect.objectContaining({ userId: "user-id-1" }),
    );
  });
});

describe("getAllAttendances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: [] });
  });

  it("passes empty userId to fetch all employees", async () => {
    const res = makeRes();
    await getAllAttendances(
      makeReq({ params: { month: "3", year: "2024" }, query: {} }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      "getAttendance",
      expect.objectContaining({ userId: "" }),
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

    const call = mockGrpcCall.mock.calls[0][1];
    expect(call.limit).toBe(200);
  });

  it("defaults limit to 50 when not provided", async () => {
    const res = makeRes();
    await getAllAttendances(
      makeReq({ params: { month: "3", year: "2024" }, query: {} }),
      res,
    );

    const call = mockGrpcCall.mock.calls[0][1];
    expect(call.limit).toBe(50);
  });
});

describe("attendanceCorrection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ username: "manager" });
    mockGrpcCall.mockResolvedValue({ message: "Corrected" });
  });

  it("returns BAD_REQUEST when username is missing", async () => {
    const res = makeRes();
    await attendanceCorrection(makeReq({ body: { date: "2024-03-01" } }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.any(Object),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("calls correctAttendance with correctedBy resolved from userId", async () => {
    const res = makeRes();
    await attendanceCorrection(
      makeReq({
        body: {
          username: "john",
          date: "2024-03-01",
          timeIn: "09:00",
          timeOut: "17:00",
        },
      }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      "correctAttendance",
      expect.objectContaining({ username: "john", correctedBy: "manager" }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await attendanceCorrection(makeReq({ body: { username: "john" } }), res);

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
