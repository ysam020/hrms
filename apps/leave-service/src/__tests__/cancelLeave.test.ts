import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { cancelLeave } from "../handlers/cancelLeave";
import { instantiateApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    approvalInstance: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest
    .fn()
    .mockReturnValue({ add: jest.fn().mockResolvedValue(undefined) }),
  getEmailQueue: jest
    .fn()
    .mockReturnValue({ add: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/approval-engine", () => ({
  instantiateApproval: jest.fn().mockResolvedValue({
    instanceId: "inst-1",
    firstApproverId: "manager-1",
    usedDefaultChain: true,
  }),
  cancelApproval: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.leaveApplication.findUnique as jest.Mock;
const mockUpdate = prisma.leaveApplication.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockNotificationAdd = getNotificationQueue().add as jest.Mock;

// Waits for the fire-and-forget notification promise chain (kicked off but
// not awaited by the handler) to settle before assertions run against it.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe("cancelLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockUserFindUnique.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([]);
    mockNotificationAdd.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await cancelLeave(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when leave application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("requests cancellation (via Approval Chain) when leave is already Approved", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Approved",
      userId: "john",
    });
    const requested = { id: "leave-1", status: "Cancellation Requested" };
    mockUpdate.mockResolvedValue(requested);

    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1", userId: "john" }), cb);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "leave-1" },
      data: { status: "Cancellation Requested", cancellationReason: null },
    });
    expect(instantiateApproval).toHaveBeenCalledWith(
      "t1",
      "leave",
      "leave-1",
      "john",
      { isCancellation: true },
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.LEAVE_CANCELLATION_REQUESTED,
        status: status.OK,
        data: expect.objectContaining(requested),
      }),
    );
  });

  it("notifies HR and the original approver when an approved leave's cancellation is requested", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Approved",
      userId: "john",
      approvedById: "manager-1",
      from: new Date("2024-03-10T00:00:00.000Z"),
      to: new Date("2024-03-10T00:00:00.000Z"),
    });
    mockUpdate.mockResolvedValue({
      id: "leave-1",
      status: "Cancellation Requested",
    });
    mockUserFindUnique.mockImplementation(({ where }: any) => {
      if (where.id === "john") return { username: "john" };
      if (where.id === "manager-1")
        return { id: "manager-1", username: "manager1" };
      return null;
    });
    mockUserFindMany.mockResolvedValue([{ id: "hr-1", username: "hr1" }]);

    await cancelLeave(
      makeCall({ id: "leave-1", userId: "john" }),
      makeCallback(),
    );
    await flushMicrotasks();

    expect(mockNotificationAdd).toHaveBeenCalledWith(
      "leaveCancellationRequested",
      expect.objectContaining({
        title: "Leave",
        recipients: expect.arrayContaining(["hr-1", "manager-1"]),
        pushTargets: expect.arrayContaining(["hr1", "manager1"]),
        eventType: "leave_notification",
      }),
    );
  });

  it("returns FAILED_PRECONDITION when leave is Rejected", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Rejected",
      userId: "john",
    });
    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1", userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.CANNOT_CANCEL_IN_CURRENT_STATE,
      status: status.FAILED_PRECONDITION,
    });
  });

  it("returns PERMISSION_DENIED when cancelling another user's leave", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Pending",
      userId: "john",
    });
    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1", userId: "jane" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.CANNOT_CANCEL_OTHERS_LEAVE,
      status: status.PERMISSION_DENIED,
    });
  });

  it("cancels leave when userId matches owner", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Pending",
      userId: "john",
    });
    const cancelled = { id: "leave-1", status: "Cancelled" };
    mockUpdate.mockResolvedValue(cancelled);

    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1", userId: "john" }), cb);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "leave-1" },
      data: expect.objectContaining({
        status: "Cancelled",
        cancelledBy: "john",
        cancellationReason: null,
        cancelledOn: expect.any(Date),
      }),
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.LEAVE_CANCELLED,
        status: status.OK,
        data: expect.objectContaining(cancelled),
      }),
    );
  });

  it("cancels the apply-time approval instance when the leave is still Pending", async () => {
    const { cancelApproval } = jest.requireMock("@hrms/approval-engine");
    (prisma as any).approvalInstance.findFirst.mockResolvedValue({
      id: "inst-1",
    });
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Pending",
      userId: "john",
    });
    mockUpdate.mockResolvedValue({ id: "leave-1", status: "Cancelled" });

    await cancelLeave(
      makeCall({ id: "leave-1", userId: "john" }),
      makeCallback(),
    );

    expect((prisma as any).approvalInstance.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        module: "leave",
        entityId: "leave-1",
        status: "pending",
      },
    });
    expect(cancelApproval).toHaveBeenCalledWith("inst-1");
  });

  it("allows cancellation when userId is not provided (no ownership check)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Pending",
      userId: "john",
    });
    mockUpdate.mockResolvedValue({ id: "leave-1", status: "Cancelled" });

    const cb = makeCallback();
    // username omitted — HR/admin cancellation path
    await cancelLeave(makeCall({ id: "leave-1" }), cb);

    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("invalidates leave cache after cancellation", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Pending",
      username: "john",
    });
    mockUpdate.mockResolvedValue({});

    await cancelLeave(
      makeCall({ id: "leave-1", username: "john" }),
      makeCallback(),
    );

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:leaves:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
