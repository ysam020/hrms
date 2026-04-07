import { prisma } from "@hrms/db";
import {
  addLeave,
  getLeaveApplications,
  updateLeaveStatus,
  getAvailablePaidLeaves,
} from "../handlers/leave";

jest.mock("../grpc/clients", () => ({
  leaveClient: {},
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

describe("addLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ username: "john" });
    mockGrpcCall.mockResolvedValue({ message: "Leave applied", status: 0 });
  });

  it("returns NOT_FOUND when user cannot be resolved", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = makeRes();
    await addLeave(
      makeReq({
        body: { from: "2024-03-01", to: "2024-03-05", leaveType: "Casual" },
      }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("calls grpcCall with applyLeave and resolved username", async () => {
    const res = makeRes();
    await addLeave(
      makeReq({
        body: {
          from: "2024-03-01",
          to: "2024-03-05",
          leaveType: "Casual",
          reason: "Trip",
        },
      }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "applyLeave",
      expect.objectContaining({
        username: "john",
        leaveType: "Casual",
        from: "2024-03-01",
      }),
    );
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await addLeave(makeReq({ body: {} }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getLeaveApplications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: [] });
  });

  it("scopes to own username for non-superuser", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({ isSuperUser: false }) // isSuperUser check
      .mockResolvedValueOnce({ username: "john" }); // resolveUsername

    const res = makeRes();
    await getLeaveApplications(makeReq({ query: { username: "other" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaves",
      expect.objectContaining({ userId: "john" }),
    );
  });

  it("allows superuser to query any employee's leaves via query param", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: true,
      username: "admin",
    });

    const res = makeRes();
    await getLeaveApplications(makeReq({ query: { username: "jane" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaves",
      expect.objectContaining({ userId: "jane" }),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await getLeaveApplications(makeReq({ query: {} }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("updateLeaveStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ username: "manager" });
    mockGrpcCall.mockResolvedValue({ message: "OK" });
  });

  it("returns BAD_REQUEST when leaveId or action is missing", async () => {
    const res = makeRes();
    await updateLeaveStatus(makeReq({ body: { action: "approve" } }), res);

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.any(Object),
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("calls approveLeave with approvedByUsername for action=approve", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "approve" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "approveLeave",
      expect.objectContaining({ id: "l1", approvedByUsername: "manager" }),
    );
  });

  it("calls rejectLeave for action=reject", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "reject" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "rejectLeave",
      expect.objectContaining({ id: "l1" }),
    );
  });

  it("calls cancelLeave with username for action=cancel", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "cancel" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "cancelLeave",
      expect.objectContaining({ id: "l1", username: "manager" }),
    );
  });

  it("returns BAD_REQUEST for unknown action", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "unknown" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.any(Object),
    );
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws", async () => {
    mockGrpcCall.mockRejectedValue(new Error("gRPC error"));
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "approve" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.INTERNAL_SERVER_ERROR,
      expect.any(Object),
    );
  });
});

describe("getAvailablePaidLeaves", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ data: {} });
  });

  it("returns NOT_FOUND when username cannot be resolved for non-superuser", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({ isSuperUser: false })
      .mockResolvedValueOnce(null); // resolveUsername returns null

    const res = makeRes();
    await getAvailablePaidLeaves(
      makeReq({ params: { username: "john" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.NOT_FOUND,
      expect.any(Object),
    );
  });

  it("scopes to own username for non-superuser", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({ isSuperUser: false })
      .mockResolvedValueOnce({ username: "john" });

    const res = makeRes();
    await getAvailablePaidLeaves(
      makeReq({ params: { username: "other" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaveBalance",
      { username: "john" },
    );
  });

  it("allows superuser to query any employee's balance via route param", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getAvailablePaidLeaves(
      makeReq({ params: { username: "jane" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaveBalance",
      { username: "jane" },
    );
  });
});
