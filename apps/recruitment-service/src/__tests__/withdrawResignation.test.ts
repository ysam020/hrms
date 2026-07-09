import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { withdrawResignation } from "../handlers/withdrawResignation";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    approvalInstance: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
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

jest.mock("@hrms/approval-engine", () => ({
  cancelApproval: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindUnique = (prisma as any).resignation.findUnique as jest.Mock;
const mockUpdate = (prisma as any).resignation.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("withdrawResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    (prisma as any).approvalInstance.findFirst.mockResolvedValue(null);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await withdrawResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("returns NOT_FOUND when resignation does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("returns PERMISSION_DENIED when withdrawing another user's resignation", async () => {
    mockFindUnique.mockResolvedValue({
      id: "res-1",
      userId: "john",
      status: "Submitted",
    });
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1", userId: "jane" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.CANNOT_WITHDRAW_OTHERS_RESIGNATION,
      status: status.PERMISSION_DENIED,
    });
  });

  it("returns FAILED_PRECONDITION when resignation is not Submitted", async () => {
    mockFindUnique.mockResolvedValue({
      id: "res-1",
      userId: "john",
      status: "Approved",
    });
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1", userId: "john" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.ONLY_SUBMITTED_CAN_BE_WITHDRAWN,
      status: status.FAILED_PRECONDITION,
    });
  });

  it("sets status to Withdrawn (not Rejected) and stamps withdrawnOn", async () => {
    mockFindUnique.mockResolvedValue({
      id: "res-1",
      userId: "john",
      status: "Submitted",
    });
    const updated = { id: "res-1", status: "Withdrawn" };
    mockUpdate.mockResolvedValue(updated);

    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1", userId: "john" }), cb);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "res-1" },
      data: expect.objectContaining({
        status: "Withdrawn",
        withdrawnOn: expect.any(Date),
      }),
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: MESSAGES.RESIGNATION_WITHDRAWN,
        status: status.OK,
        data: expect.objectContaining({ id: "res-1", status: "Withdrawn" }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
