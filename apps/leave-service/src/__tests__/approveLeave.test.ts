import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { approveLeave } from "../handlers/approveLeave";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => ({
  prisma: {
    leaveApplication: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
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
const mockUpdate = prisma.leaveApplication.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("approveLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
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
    expect(mockUpdate).not.toHaveBeenCalled();
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

  it("approves leave and returns updated record on happy path", async () => {
    const pending = { id: "leave-1", status: "Pending", userId: "john-id" };
    const approved = {
      id: "leave-1",
      status: "Approved",
      userId: "john-id",
      approvedById: "manager-id",
    };
    mockFindUnique.mockResolvedValue(pending);
    mockUpdate.mockResolvedValue(approved);

    const cb = makeCallback();
    await approveLeave(
      makeCall({ id: "leave-1", approvedById: "manager-id" }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "leave-1" },
      data: expect.objectContaining({
        status: "Approved",
        approvedById: "manager-id",
        approvedOn: expect.any(Date),
      }),
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_APPROVED,
      status: status.OK,
      data: approved,
    });
  });

  it("invalidates leave cache after approval", async () => {
    mockFindUnique.mockResolvedValue({ id: "leave-1", status: "Pending" });
    mockUpdate.mockResolvedValue({ id: "leave-1", status: "Approved" });

    await approveLeave(makeCall({ id: "leave-1" }), makeCallback());

    expect(mockInvalidate).toHaveBeenCalledWith("leaves:*");
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
