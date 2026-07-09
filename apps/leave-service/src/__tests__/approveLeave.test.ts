import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { approveLeave } from "../handlers/approveLeave";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveApplication: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    tenantSettings: {
      findFirst: jest.fn(),
    },
    leaveBalance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    compOffCredit: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: {
    invalidatePattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest
    .fn()
    .mockReturnValue({ add: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.leaveApplication.findUnique as jest.Mock;
const mockFindUniqueOrThrow = (prisma as any).leaveApplication
  .findUniqueOrThrow as jest.Mock;
const mockUpdateMany = (prisma as any).leaveApplication.updateMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("approveLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    // Happy-path default: the conditional transition succeeds.
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await approveLeave(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when leave application does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await approveLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("returns FAILED_PRECONDITION when leave is not pending", async () => {
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Approved" });
    const cb = makeCallback();
    await approveLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ONLY_PENDING_CAN_BE_APPROVED,
      status: status.FAILED_PRECONDITION,
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("returns FAILED_PRECONDITION for Rejected leave", async () => {
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Rejected" });
    const cb = makeCallback();
    await approveLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ONLY_PENDING_CAN_BE_APPROVED,
      status: status.FAILED_PRECONDITION,
    });
  });

  it("returns FAILED_PRECONDITION when a concurrent approval already won the race", async () => {
    // First read sees "Pending", but the conditional update matches nothing
    // because another request flipped the status a moment earlier.
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Pending" });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const cb = makeCallback();
    await approveLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ONLY_PENDING_CAN_BE_APPROVED,
      status: status.FAILED_PRECONDITION,
    });
    expect(mockFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("approves leave and returns updated record on happy path", async () => {
    const pending = { id: "leave-1", status: "Pending", userId: "john-id" };
    const approved = {
      id: "leave-1",
      status: "Approved",
      userId: "john-id",
      approvedById: "manager-id",
    };
    mockFindUnique.mockResolvedValue(pending);
    mockFindUniqueOrThrow.mockResolvedValue(approved);

    const cb = makeCallback();
    await approveLeave(
      makeCall({ id: "leave-1", approvedById: "manager-id" }),
      cb,
    );

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "leave-1", status: "Pending" },
      data: expect.objectContaining({
        status: "Approved",
        approvedById: "manager-id",
        approvedOn: expect.any(Date),
      }),
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.LEAVE_APPROVED,
        status: status.OK,
        data: expect.objectContaining(approved),
      }),
    );
  });

  it("invalidates leave cache after approval", async () => {
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Pending" });
    mockFindUniqueOrThrow.mockResolvedValue({
      id: "leave-1",
      status: "Approved",
    });

    await approveLeave(makeCall({ id: "leave-1" }), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:leaves:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await approveLeave(makeCall({ id: "leave-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
