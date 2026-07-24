import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { withdrawResignation } from "../handlers/withdrawResignation";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    approvalInstance: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
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

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/common", () => ({
  tenantFrom: jest.fn(
    (name: string) => `"${name} HR" <hr@notifications.praesto.cloud>`,
  ),
  tenantReplyTo: jest.fn((email?: string | null) => email || undefined),
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeCall = (request: Record<string, any>) => ({ request }) as any;
const makeCallback = () => jest.fn();

const mockFindFirst = (prisma as any).resignation.findFirst as jest.Mock;
const mockUpdate = (prisma as any).resignation.update as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;

describe("withdrawResignation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    (prisma as any).approvalInstance.findFirst.mockResolvedValue(null);
    (prisma as any).user.findUnique.mockResolvedValue(null);
    (prisma as any).user.findMany.mockResolvedValue([]);
    (prisma as any).team.findMany.mockResolvedValue([]);
    (prisma as any).tenant.findUnique.mockResolvedValue(null);
  });

  it("returns INVALID_ARGUMENT when id is missing", async () => {
    const cb = makeCallback();
    await withdrawResignation(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_ID_REQUIRED,
      status: status.INVALID_ARGUMENT,
    });
  });

  it("scopes the lookup to the current tenant", async () => {
    mockFindFirst.mockResolvedValue({
      id: "res-1",
      userId: "john",
      status: "Submitted",
    });
    mockUpdate.mockResolvedValue({ id: "res-1", status: "Withdrawn" });
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1", userId: "john" }), cb);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "res-1", tenantId: "t1" },
    });
  });

  it("returns NOT_FOUND when resignation does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_NOT_FOUND,
      status: status.NOT_FOUND,
    });
  });

  it("returns PERMISSION_DENIED when withdrawing another user's resignation", async () => {
    mockFindFirst.mockResolvedValue({
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

  it("allows a privileged override that omits userId entirely", async () => {
    // Mirrors apps/api-gateway's withdrawResignation, which omits userId
    // when the caller is a superuser withdrawing on someone else's behalf.
    mockFindFirst.mockResolvedValue({
      id: "res-1",
      userId: "john",
      status: "Submitted",
    });
    mockUpdate.mockResolvedValue({ id: "res-1", status: "Withdrawn" });
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: status.OK }),
    );
  });

  it("returns FAILED_PRECONDITION when resignation is not Submitted", async () => {
    mockFindFirst.mockResolvedValue({
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
    mockFindFirst.mockResolvedValue({
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
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.RESIGNATION_WITHDRAWN,
      status: status.OK,
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:resignations:*");
  });

  it("returns INTERNAL on database error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await withdrawResignation(makeCall({ id: "res-1" }), cb);
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  });
});
