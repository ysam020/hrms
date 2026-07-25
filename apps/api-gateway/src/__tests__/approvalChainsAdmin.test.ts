import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { actOnStep } from "@hrms/approval-engine";
import { grpcCall } from "../grpc/clients";
import { emitWebhookEvent } from "../utils/webhookEmitter";
import { getWorkingDays, isHoliday, eachDate } from "../utils/workingDays";
import {
  listApprovalChains,
  createApprovalChain,
  updateApprovalChain,
  deleteApprovalChain,
  listApprovalDelegates,
  createApprovalDelegate,
  deleteApprovalDelegate,
  actOnApproval,
} from "../handlers/approvalChains";

jest.mock("@hrms/db", () => {
  const _db: any = {
    approvalChain: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    approvalChainStep: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    approvalDelegate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    approvalInstance: { findFirst: jest.fn() },
    overtimeRequest: { update: jest.fn() },
    wfhRequest: { update: jest.fn() },
    attendanceRecord: { upsert: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  return { prismaWithTenant: _db };
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
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@hrms/approval-engine", () => ({
  actOnStep: jest.fn(),
  getPendingApprovalsFor: jest.fn(),
}));

jest.mock("../grpc/clients", () => ({
  leaveClient: {},
  recruitmentClient: {},
  salaryClient: {},
  performanceReviewClient: {},
  grpcCall: jest.fn(),
}));

jest.mock("../utils/webhookEmitter", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../utils/workingDays", () => ({
  getWorkingDays: jest.fn(() => [1, 2, 3, 4, 5]),
  isHoliday: jest.fn().mockResolvedValue(false),
  eachDate: jest.fn(() => []),
}));

jest.mock("../handlers/tenantSettings", () => ({
  getActiveSettings: jest.fn().mockResolvedValue({}),
}));

jest.mock("@hrms/proto", () => ({
  recruitment: { UpdateStatusRequest: { fromPartial: (o: any) => o } },
  salary: {
    UpdateSalaryRequest: { fromPartial: (o: any) => o },
    CreateSalaryRequest: { fromPartial: (o: any) => o },
  },
}));

const db: any = prisma;
const mockActOnStep = actOnStep as jest.Mock;
const mockGrpcCall = grpcCall as jest.Mock;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "owner" },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}
function makeRes() {
  return { json: jest.fn() } as any;
}
const NON_OWNER = {
  user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
};

describe("approvalChains — chain CRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ isSuperUser: false });
  });

  it("listApprovalChains groups steps under their owning chain", async () => {
    db.approvalChain.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    db.approvalChainStep.findMany.mockResolvedValue([
      { chainId: "c1", order: 1 },
      { chainId: "c1", order: 2 },
    ]);
    const req = makeReq({ query: { module: "leave" } });
    const res = makeRes();

    await listApprovalChains(req, res);

    expect(db.approvalChain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", module: "leave" } }),
    );
    const data = (res.json.mock.calls[0][0] as any).data;
    expect(data[0].steps).toHaveLength(2);
    expect(data[1].steps).toHaveLength(0);
  });

  it("createApprovalChain rejects a non-privileged member", async () => {
    const req = makeReq(NON_OWNER);
    const res = makeRes();
    await createApprovalChain(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("createApprovalChain numbers steps in submission order", async () => {
    db.approvalChain.create.mockResolvedValue({ id: "c1" });
    db.approvalChainStep.createMany.mockResolvedValue({});
    const req = makeReq({
      body: {
        module: "leave",
        name: "Standard",
        steps: [
          { approverType: "reporting_manager" },
          { approverType: "role", approverRole: "hr" },
        ],
      },
    });
    const res = makeRes();

    await createApprovalChain(req, res);

    expect(db.approvalChainStep.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          chainId: "c1",
          order: 1,
          approverType: "reporting_manager",
        }),
        expect.objectContaining({
          chainId: "c1",
          order: 2,
          approverRole: "hr",
        }),
      ],
    });
  });

  it("updateApprovalChain returns NOT_FOUND for a chain outside the tenant", async () => {
    db.approvalChain.findFirst.mockResolvedValue(null);
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await updateApprovalChain(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("updateApprovalChain only patches fields present in the body", async () => {
    db.approvalChain.findFirst.mockResolvedValue({ id: "c1" });
    db.approvalChain.update.mockResolvedValue({});
    const req = makeReq({ params: { id: "c1" }, body: { priority: 5 } });
    const res = makeRes();

    await updateApprovalChain(req, res);

    expect(db.approvalChain.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { priority: 5 },
    });
    expect(db.approvalChainStep.deleteMany).not.toHaveBeenCalled();
  });

  it("updateApprovalChain replaces all steps when steps is provided", async () => {
    db.approvalChain.findFirst.mockResolvedValue({ id: "c1" });
    db.approvalChain.update.mockResolvedValue({});
    db.approvalChainStep.deleteMany.mockResolvedValue({});
    db.approvalChainStep.createMany.mockResolvedValue({});
    const req = makeReq({
      params: { id: "c1" },
      body: {
        steps: [{ approverType: "specific_user", approverUserId: "u2" }],
      },
    });
    const res = makeRes();

    await updateApprovalChain(req, res);

    expect(db.approvalChainStep.deleteMany).toHaveBeenCalledWith({
      where: { chainId: "c1" },
    });
    expect(db.approvalChainStep.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ order: 1, approverUserId: "u2" })],
    });
  });

  it("deleteApprovalChain returns NOT_FOUND for a nonexistent chain", async () => {
    db.approvalChain.findFirst.mockResolvedValue(null);
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await deleteApprovalChain(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("deleteApprovalChain blocks deletion while an instance is in progress", async () => {
    db.approvalChain.findFirst.mockResolvedValue({ id: "c1" });
    db.approvalInstance.findFirst.mockResolvedValue({ id: "inst1" });
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await deleteApprovalChain(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        message: expect.stringContaining("in progress"),
      }),
    );
    expect(db.approvalChain.delete).not.toHaveBeenCalled();
  });

  it("deleteApprovalChain deletes steps then the chain when nothing is in progress", async () => {
    db.approvalChain.findFirst.mockResolvedValue({ id: "c1" });
    db.approvalInstance.findFirst.mockResolvedValue(null);
    db.approvalChainStep.deleteMany.mockResolvedValue({});
    db.approvalChain.delete.mockResolvedValue({});
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await deleteApprovalChain(req, res);
    expect(db.approvalChainStep.deleteMany).toHaveBeenCalledWith({
      where: { chainId: "c1" },
    });
    expect(db.approvalChain.delete).toHaveBeenCalledWith({
      where: { id: "c1" },
    });
  });
});

describe("approvalChains — delegate CRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ isSuperUser: false });
  });

  it("lists delegates for the tenant", async () => {
    db.approvalDelegate.findMany.mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await listApprovalDelegates(req, res);
    expect(db.approvalDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1" } }),
    );
  });

  it("rejects a delegate with startDate after endDate", async () => {
    const req = makeReq({
      body: {
        delegateId: "u2",
        startDate: "2024-06-10",
        endDate: "2024-06-01",
      },
    });
    const res = makeRes();
    await createApprovalDelegate(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(db.approvalDelegate.create).not.toHaveBeenCalled();
  });

  it("creates a delegate assignment attributed to the requesting user", async () => {
    db.approvalDelegate.create.mockResolvedValue({ id: "d1" });
    const req = makeReq({
      body: {
        delegateId: "u2",
        startDate: "2024-06-01",
        endDate: "2024-06-10",
      },
    });
    const res = makeRes();
    await createApprovalDelegate(req, res);
    expect(db.approvalDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delegatorId: "u1", delegateId: "u2" }),
    });
  });

  it("returns NOT_FOUND deleting a nonexistent delegate", async () => {
    db.approvalDelegate.findFirst.mockResolvedValue(null);
    const req = makeReq({ params: { id: "d1" } });
    const res = makeRes();
    await deleteApprovalDelegate(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("forbids removing someone else's delegate assignment when not privileged", async () => {
    db.approvalDelegate.findFirst.mockResolvedValue({
      id: "d1",
      delegatorId: "someone-else",
    });
    const req = makeReq({ ...NON_OWNER, params: { id: "d1" } });
    const res = makeRes();
    await deleteApprovalDelegate(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
    expect(db.approvalDelegate.delete).not.toHaveBeenCalled();
  });

  it("allows the delegator to remove their own delegate assignment", async () => {
    db.approvalDelegate.findFirst.mockResolvedValue({
      id: "d1",
      delegatorId: "u1",
    });
    db.approvalDelegate.delete.mockResolvedValue({});
    const req = makeReq({ ...NON_OWNER, params: { id: "d1" } });
    const res = makeRes();
    await deleteApprovalDelegate(req, res);
    expect(db.approvalDelegate.delete).toHaveBeenCalledWith({
      where: { id: "d1" },
    });
  });
});

describe("actOnApproval (PUT /approvals/:instanceId/act)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ isSuperUser: false });
  });

  it("returns NOT_FOUND when the instance doesn't belong to the tenant", async () => {
    db.approvalInstance.findFirst.mockResolvedValue(null);
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();
    await actOnApproval(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
    );
  });

  it("reports a non-final decision as forwarded to the next approver", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "overtime",
      entityId: "o1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: false,
    });
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Approved — forwarded to the next approver.",
      }),
    );
    expect(db.overtimeRequest.update).not.toHaveBeenCalled();
  });

  it("flips the overtime request status on final approval", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "overtime",
      entityId: "o1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    db.overtimeRequest.update.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.overtimeRequest.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: expect.objectContaining({
        status: "Approved",
        approvedAt: expect.any(Date),
      }),
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Request approved." }),
    );
  });

  it("marks the overtime request Rejected without an approvedAt stamp on final rejection", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "overtime",
      entityId: "o1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "rejected",
      isFinal: true,
      finalStatus: "rejected",
    });
    db.overtimeRequest.update.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "rejected" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.overtimeRequest.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "Rejected" },
    });
  });

  it("marks attendance WFH for each working day and emits a webhook on final WFH approval", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "wfh",
      entityId: "w1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    db.wfhRequest.update.mockResolvedValue({
      userId: "u2",
      date: new Date("2024-06-10"),
      toDate: new Date("2024-06-11"),
    });
    (eachDate as jest.Mock).mockReturnValue([
      new Date("2024-06-10T00:00:00Z"),
      new Date("2024-06-11T00:00:00Z"),
    ]);
    (getWorkingDays as jest.Mock).mockReturnValue([1, 2, 3, 4, 5]);
    (isHoliday as jest.Mock).mockResolvedValue(false);
    db.attendanceRecord.upsert.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.attendanceRecord.upsert).toHaveBeenCalledTimes(2);
    expect(emitWebhookEvent).toHaveBeenCalledWith(
      "wfh.approved",
      expect.objectContaining({ requestId: "w1", userId: "u2" }),
    );
  });

  it("skips holidays and non-working days when marking WFH attendance", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "wfh",
      entityId: "w1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    db.wfhRequest.update.mockResolvedValue({
      userId: "u2",
      date: new Date("2024-06-08"), // Saturday
      toDate: new Date("2024-06-10"),
    });
    (eachDate as jest.Mock).mockReturnValue([
      new Date("2024-06-08T00:00:00Z"), // Saturday — not a working day
      new Date("2024-06-09T00:00:00Z"), // Sunday — not a working day
      new Date("2024-06-10T00:00:00Z"), // Monday, but a holiday
    ]);
    (getWorkingDays as jest.Mock).mockReturnValue([1, 2, 3, 4, 5]);
    (isHoliday as jest.Mock).mockImplementation((d: Date) =>
      Promise.resolve(d.toISOString().startsWith("2024-06-10")),
    );
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("rejects a WFH request without touching attendance", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "wfh",
      entityId: "w1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "rejected",
      isFinal: true,
      finalStatus: "rejected",
    });
    db.wfhRequest.update.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "rejected", comment: "Team is short-staffed" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.wfhRequest.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { status: "Rejected", rejectionReason: "Team is short-staffed" },
    });
    expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("creates a new salary structure and syncs User.salary when a performance review with an increment is finally approved", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "performance_review",
      entityId: "pr1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    mockGrpcCall.mockImplementation((_client: any, method: string) => {
      if (method === "getReview") {
        return Promise.resolve({
          data: {
            userId: "u2",
            recommendedIncrementPct: 10,
            effectiveFrom: "2024-07-01",
          },
        });
      }
      if (method === "getSalaryStructure")
        return Promise.resolve({ data: null });
      if (method === "createSalaryStructure")
        return Promise.resolve({ data: { id: "ss1" } });
      if (method === "finalizeReview") return Promise.resolve({});
      return Promise.resolve({});
    });
    db.user.findUnique.mockResolvedValue({ salary: 100000 });
    db.user.update.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "createSalaryStructure",
      expect.objectContaining({ userId: "u2", basicPay: 110000 }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { salary: 110000, salaryBasicPay: 110000 },
    });
    expect(cacheManager.invalidatePattern).toHaveBeenCalledWith(
      "t:t1:employee-details:*",
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "finalizeReview",
      expect.objectContaining({
        id: "pr1",
        approved: true,
        salaryStructureId: "ss1",
      }),
    );
  });

  it("updates the existing salary structure in place, carrying over other components, when one already exists for the period", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "performance_review",
      entityId: "pr1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    mockGrpcCall.mockImplementation((_client: any, method: string) => {
      if (method === "getReview")
        return Promise.resolve({
          data: { userId: "u2", recommendedIncrementPct: 10 },
        });
      if (method === "getSalaryStructure")
        return Promise.resolve({
          data: { id: "ss1", hra: 5000, conveyance: 1600 },
        });
      if (method === "updateSalaryStructure")
        return Promise.resolve({ data: { id: "ss1" } });
      if (method === "finalizeReview") return Promise.resolve({});
      return Promise.resolve({});
    });
    db.user.findUnique.mockResolvedValue({ salary: 100000 });
    db.user.update.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "updateSalaryStructure",
      expect.objectContaining({
        id: "ss1",
        basicPay: 110000,
        hra: 5000,
        conveyance: 1600,
      }),
    );
  });

  it("finalizes the review without touching salary when no increment was recommended", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "performance_review",
      entityId: "pr1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "approved",
      isFinal: true,
      finalStatus: "approved",
    });
    mockGrpcCall.mockImplementation((_client: any, method: string) => {
      if (method === "getReview")
        return Promise.resolve({ data: { userId: "u2" } });
      if (method === "finalizeReview") return Promise.resolve({});
      return Promise.resolve({});
    });
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "approved" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(db.user.update).not.toHaveBeenCalled();
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "finalizeReview",
      expect.objectContaining({ id: "pr1", salaryStructureId: undefined }),
    );
  });

  it("finalizes a rejected performance review without any salary work", async () => {
    db.approvalInstance.findFirst.mockResolvedValue({
      id: "i1",
      module: "performance_review",
      entityId: "pr1",
    });
    mockActOnStep.mockResolvedValue({
      instanceId: "i1",
      decision: "rejected",
      isFinal: true,
      finalStatus: "rejected",
    });
    mockGrpcCall.mockResolvedValue({});
    const req = makeReq({
      params: { instanceId: "i1" },
      body: { decision: "rejected" },
    });
    const res = makeRes();

    await actOnApproval(req, res);

    expect(mockGrpcCall).not.toHaveBeenCalledWith(
      expect.anything(),
      "getReview",
      expect.anything(),
    );
    expect(mockGrpcCall).toHaveBeenCalledWith(
      expect.anything(),
      "finalizeReview",
      expect.objectContaining({ id: "pr1", approved: false }),
    );
  });
});
