import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { cancelLeave } from "../handlers/cancelLeave";
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

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = prisma.leaveApplication.findUnique as jest.Mock;
const mockUpdate = prisma.leaveApplication.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("cancelLeave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
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

  it("returns FAILED_PRECONDITION when leave is already Approved", async () => {
    mockFindUnique.mockResolvedValue({
      id: "leave-1",
      status: "Approved",
      userId: "john",
    });
    const cb = makeCallback();
    await cancelLeave(makeCall({ id: "leave-1", userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ONLY_PENDING_CAN_BE_CANCELLED,
      status: status.FAILED_PRECONDITION,
    });
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
      message: MESSAGES.ONLY_PENDING_CAN_BE_CANCELLED,
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
      data: { status: "Cancelled" },
    });
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.LEAVE_CANCELLED,
      status: status.OK,
      data: cancelled,
    });
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

    expect(mockInvalidate).toHaveBeenCalledWith("leaves:*");
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
