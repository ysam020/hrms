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

jest.mock("../handlers/approvalChains", () => ({
  actOnApprovalForEntity: jest.fn(),
  isPrivileged: jest.fn().mockResolvedValue(false),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

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
import { actOnApprovalForEntity } from "../handlers/approvalChains";

const mockGrpcCall = grpcCall as jest.Mock;
const mockApiResponse = apiResponse as jest.Mock;
const mockActOnApprovalForEntity = actOnApprovalForEntity as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { userId: "user-id-1", tenantId: "t1", tenantRole: "member" },
    body: {},
    query: {},
    params: {},
    ...overrides,
  }) as any;

describe("addLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrpcCall.mockResolvedValue({ message: "Leave applied", status: 0 });
  });

  it("calls grpcCall with applyLeave and userId", async () => {
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
        userId: "user-id-1",
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
    mockUserFindMany.mockResolvedValue([]);
  });

  it("scopes to own userId for non-superuser", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getLeaveApplications(makeReq({ query: { userId: "other" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaves",
      expect.objectContaining({ userId: "user-id-1" }),
    );
  });

  it("allows superuser to query any employee's leaves via query param", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getLeaveApplications(makeReq({ query: { userId: "jane" } }), res);

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
    mockGrpcCall.mockResolvedValue({ message: "OK" });
    mockActOnApprovalForEntity.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
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
    expect(mockActOnApprovalForEntity).not.toHaveBeenCalled();
  });

  it("acts on the pending approval instance via the Approval Chain for action=approve", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "approve" } }),
      res,
    );

    expect(mockActOnApprovalForEntity).toHaveBeenCalledWith(
      "t1",
      "leave",
      "l1",
      "user-id-1",
      "approved",
      undefined,
      false,
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.SUCCESS,
      expect.any(Object),
    );
  });

  it("acts on the pending approval instance via the Approval Chain for action=reject", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "reject" } }),
      res,
    );

    expect(mockActOnApprovalForEntity).toHaveBeenCalledWith(
      "t1",
      "leave",
      "l1",
      "user-id-1",
      "rejected",
      undefined,
      false,
    );
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  it("calls cancelLeave with userId for action=cancel", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "cancel" } }),
      res,
    );

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "cancelLeave",
      expect.objectContaining({ id: "l1", userId: "user-id-1" }),
    );
    expect(mockActOnApprovalForEntity).not.toHaveBeenCalled();
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

  it("returns BAD_REQUEST when actOnApprovalForEntity rejects with a plain message (e.g. not the resolved approver)", async () => {
    mockActOnApprovalForEntity.mockRejectedValue(
      new Error("You are not the approver for this request."),
    );
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "approve" } }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.BAD_REQUEST,
      expect.objectContaining({
        message: "You are not the approver for this request.",
      }),
    );
  });

  it("returns FORBIDDEN when there is no active tenant for action=approve", async () => {
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({
        user: { userId: "user-id-1", tenantId: null, tenantRole: "member" },
        body: { leaveId: "l1", action: "approve" },
      }),
      res,
    );

    expect(mockApiResponse).toHaveBeenCalledWith(
      res,
      RESPONSE_STATUS.FORBIDDEN,
      expect.any(Object),
    );
    expect(mockActOnApprovalForEntity).not.toHaveBeenCalled();
  });

  it("returns INTERNAL_SERVER_ERROR when grpcCall throws for action=cancel", async () => {
    // Real @grpc/grpc-js errors always carry a numeric `.code` — used to
    // distinguish them from plain application-thrown Errors (see the catch
    // block in updateLeaveStatus).
    mockGrpcCall.mockRejectedValue(
      Object.assign(new Error("gRPC error"), { code: 2 }),
    );
    const res = makeRes();
    await updateLeaveStatus(
      makeReq({ body: { leaveId: "l1", action: "cancel" } }),
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

  it("scopes to own userId for non-superuser", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });

    const res = makeRes();
    await getAvailablePaidLeaves(makeReq({ params: { userId: "other" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaveBalance",
      { userId: "user-id-1" },
    );
  });

  it("allows superuser to query any employee's balance via route param", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });

    const res = makeRes();
    await getAvailablePaidLeaves(makeReq({ params: { userId: "jane" } }), res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "getLeaveBalance",
      { userId: "jane" },
    );
  });
});
