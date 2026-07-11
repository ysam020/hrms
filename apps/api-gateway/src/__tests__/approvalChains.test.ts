import { prismaWithTenant as prisma } from "@hrms/db";
import { actOnStep, getPendingApprovalsFor } from "@hrms/approval-engine";
import { recruitment } from "@hrms/proto";
import { grpcCall } from "../grpc/clients";
import {
  actOnApprovalForEntity,
  listPendingApprovals,
} from "../handlers/approvalChains";

jest.mock("@hrms/db", () => {
  const _db = {
    approvalInstance: { findFirst: jest.fn(), findMany: jest.fn() },
    leaveApplication: { findUnique: jest.fn(), findMany: jest.fn() },
    resignation: { findMany: jest.fn() },
    overtimeRequest: { update: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  return { prismaWithTenant: _db };
});

jest.mock("@hrms/approval-engine", () => ({
  actOnStep: jest.fn(),
  getPendingApprovalsFor: jest.fn(),
}));

jest.mock("../grpc/clients", () => ({
  leaveClient: {},
  recruitmentClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindFirst = (prisma as any).approvalInstance.findFirst as jest.Mock;
const mockLeaveFindUnique = (prisma as any).leaveApplication
  .findUnique as jest.Mock;
const mockActOnStep = actOnStep as jest.Mock;
const mockGrpcCall = grpcCall as jest.Mock;
const mockApprovalInstanceFindMany = (prisma as any).approvalInstance
  .findMany as jest.Mock;
const mockLeaveFindMany = (prisma as any).leaveApplication
  .findMany as jest.Mock;
const mockResignationFindMany = (prisma as any).resignation
  .findMany as jest.Mock;
const mockOvertimeFindMany = (prisma as any).overtimeRequest
  .findMany as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockGetPendingApprovalsFor = getPendingApprovalsFor as jest.Mock;

describe("actOnApprovalForEntity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when no pending instance exists for the entity", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      actOnApprovalForEntity(
        "t1",
        "leave",
        "l1",
        "u1",
        "approved",
        undefined,
        false,
      ),
    ).rejects.toThrow("No pending approval found for this leave request.");

    expect(mockActOnStep).not.toHaveBeenCalled();
  });

  it("acts on the resolved instance and forwards allowOverride", async () => {
    mockFindFirst.mockResolvedValue({
      id: "i1",
      module: "leave",
      entityId: "l1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: false,
    });

    const result = await actOnApprovalForEntity(
      "t1",
      "leave",
      "l1",
      "u1",
      "approved",
      "looks good",
      true,
    );

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "t1",
          module: "leave",
          entityId: "l1",
          status: "pending",
        },
      }),
    );
    expect(mockActOnStep).toHaveBeenCalledWith(
      "i1",
      "u1",
      "approved",
      "looks good",
      {
        allowOverride: true,
      },
    );
    expect(result.isFinal).toBe(false);
    expect(mockGrpcCall).not.toHaveBeenCalled();
  });

  describe("leave side effect disambiguation", () => {
    beforeEach(() => {
      mockFindFirst.mockResolvedValue({
        id: "i1",
        module: "leave",
        entityId: "l1",
      });
    });

    it("calls approveLeave when the underlying application is still Pending (original apply-approval)", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "approved",
        isFinal: true,
        finalStatus: "approved",
      });
      mockLeaveFindUnique.mockResolvedValue({ id: "l1", status: "Pending" });

      await actOnApprovalForEntity(
        "t1",
        "leave",
        "l1",
        "manager-1",
        "approved",
        undefined,
        false,
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "approveLeave",
        { id: "l1", approvedById: "manager-1" },
      );
    });

    it("calls rejectLeave when the underlying application is still Pending and the decision is rejected", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "rejected",
        isFinal: true,
        finalStatus: "rejected",
      });
      mockLeaveFindUnique.mockResolvedValue({ id: "l1", status: "Pending" });

      await actOnApprovalForEntity(
        "t1",
        "leave",
        "l1",
        "manager-1",
        "rejected",
        undefined,
        false,
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "rejectLeave",
        {
          id: "l1",
        },
      );
    });

    it("calls finalizeLeaveCancellation when the application is Cancellation Requested", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "approved",
        isFinal: true,
        finalStatus: "approved",
      });
      mockLeaveFindUnique.mockResolvedValue({
        id: "l1",
        status: "Cancellation Requested",
      });

      await actOnApprovalForEntity(
        "t1",
        "leave",
        "l1",
        "manager-1",
        "approved",
        undefined,
        false,
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "finalizeLeaveCancellation",
        { id: "l1", approved: true },
      );
    });

    it("does not run the side effect when the decision only advances to the next step", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "approved",
        isFinal: false,
        nextApproverId: "u2",
      });

      await actOnApprovalForEntity(
        "t1",
        "leave",
        "l1",
        "manager-1",
        "approved",
        undefined,
        false,
      );

      expect(mockLeaveFindUnique).not.toHaveBeenCalled();
      expect(mockGrpcCall).not.toHaveBeenCalled();
    });
  });

  describe("resignation side effect", () => {
    beforeEach(() => {
      mockFindFirst.mockResolvedValue({
        id: "i1",
        module: "resignation",
        entityId: "r1",
      });
    });

    // Regression test for "Request message serialization failure: invalid
    // float32: undefined" — UpdateStatusRequest is a shared proto message
    // with float/bool fields (buyoutAmount, noticePeriodWaived) that the
    // generated encoder tries to write even when omitted, unless the
    // request object is built via fromPartial() to default them.
    const expectEncodesCleanly = () => {
      const sentRequest = mockGrpcCall.mock.calls[0][2];
      expect(() =>
        recruitment.UpdateStatusRequest.encode(sentRequest).finish(),
      ).not.toThrow();
    };

    it("calls approveResignation with a cleanly-encodable request when no optional metadata is given", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "approved",
        isFinal: true,
        finalStatus: "approved",
      });

      await actOnApprovalForEntity(
        "t1",
        "resignation",
        "r1",
        "manager-1",
        "approved",
        "looks good",
        false,
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "approveResignation",
        expect.objectContaining({ id: "r1", remarks: "looks good" }),
      );
      expectEncodesCleanly();
    });

    it("forwards buyoutAmount/noticePeriodWaived metadata to approveResignation and still encodes cleanly", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "approved",
        isFinal: true,
        finalStatus: "approved",
      });

      await actOnApprovalForEntity(
        "t1",
        "resignation",
        "r1",
        "manager-1",
        "approved",
        undefined,
        false,
        {
          lastWorkingDay: "2026-08-01",
          noticePeriodWaived: true,
          buyoutAmount: 50000,
        },
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "approveResignation",
        expect.objectContaining({
          id: "r1",
          lastWorkingDay: "2026-08-01",
          noticePeriodWaived: true,
          buyoutAmount: 50000,
        }),
      );
      expectEncodesCleanly();
    });

    it("calls rejectResignation with a cleanly-encodable request", async () => {
      mockActOnStep.mockResolvedValue({
        instanceId: "i1",
        decision: "rejected",
        isFinal: true,
        finalStatus: "rejected",
      });

      await actOnApprovalForEntity(
        "t1",
        "resignation",
        "r1",
        "manager-1",
        "rejected",
        "not eligible",
        false,
        { rejectionReason: "Notice period not served" },
      );

      expect(mockGrpcCall).toHaveBeenCalledWith(
        expect.anything(),
        "rejectResignation",
        expect.objectContaining({
          id: "r1",
          rejectionReason: "Notice period not served",
          remarks: "not eligible",
        }),
      );
      expectEncodesCleanly();
    });
  });
});

describe("listPendingApprovals", () => {
  const makeRes = () =>
    ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }) as any;
  const makeReq = (overrides: any = {}) =>
    ({
      user: { userId: "u1", tenantId: "t1" },
      query: {},
      ...overrides,
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLeaveFindMany.mockResolvedValue([]);
    mockResignationFindMany.mockResolvedValue([]);
    mockOvertimeFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
  });

  it("orders items newest first, regardless of which module resolved first", async () => {
    // leave is resolved before resignation by getPendingApprovalsFor, but
    // the resignation instance is newer and must sort to the top.
    mockGetPendingApprovalsFor.mockResolvedValue([
      { instanceId: "i-leave", module: "leave", entityId: "l1", stepOrder: 1 },
      {
        instanceId: "i-res",
        module: "resignation",
        entityId: "r1",
        stepOrder: 1,
      },
    ]);
    mockApprovalInstanceFindMany.mockResolvedValue([
      {
        id: "i-leave",
        module: "leave",
        requestedBy: "u2",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "i-res",
        module: "resignation",
        requestedBy: "u3",
        createdAt: new Date("2026-01-10"),
      },
    ]);

    const res = makeRes();
    await listPendingApprovals(makeReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.map((d: any) => d.instanceId)).toEqual([
      "i-res",
      "i-leave",
    ]);
  });
});
