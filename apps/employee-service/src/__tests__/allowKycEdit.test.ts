import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { allowKycEdit } from "../handlers/allowKycEdit";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    tenantMembership: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn(), delete: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));
const mockNotify = notify as jest.Mock;

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockUpdateMany = prisma.user.updateMany as jest.Mock;
const mockFindMany = prisma.user.findMany as jest.Mock;
const mockMembershipFindMany = (prisma as any).tenantMembership
  .findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

// Lets the fire-and-forget "notify other approvers" .then() chain settle
// before assertions run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const user = {
  id: "u1",
  username: "john",
  kyc_approval: "Edit Requested",
  kyc_edit_request_reason: "Bank account changed",
};

describe("allowKycEdit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({
      ...user,
      kyc_approval: "Pending",
      kyc_edit_request_reason: null,
    });
    mockFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when employeeId is missing", async () => {
    const cb = makeCallback();
    await allowKycEdit(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await allowKycEdit(makeCall({ employeeId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
  });

  it("returns FAILED_PRECONDITION when there's no pending edit-access request", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    const cb = makeCallback();
    await allowKycEdit(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9, kycStatus: "Approved" }),
    );
  });

  // Two eligible approvers clicking "Allow Editing" at nearly the same time
  // race on the same status-guarded updateMany — only the first one's write
  // actually matches `kyc_approval: "Edit Requested"`, so the second gets
  // count 0 and this same graceful FAILED_PRECONDITION instead of a
  // duplicate grant.
  it("treats a losing race the same as no pending request", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Pending" });
    const cb = makeCallback();
    await allowKycEdit(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9, kycStatus: "Pending" }),
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("sets Pending, clears the reason, and invalidates cache", async () => {
    const cb = makeCallback();
    await allowKycEdit(makeCall({ employeeId: "u1" }), cb);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", kyc_approval: "Edit Requested" },
      data: {
        kyc_approval: "Pending",
        kyc_edit_request_reason: null,
        kyc_edit_requested_at: null,
        kyc_edit_window: "open",
      },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:john");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, kycStatus: "Pending" }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycEditAllowed",
        targetUser: "john",
        push: { enabled: true },
        inApp: expect.objectContaining({
          socketEvent: "kyc-edit-allowed",
          socketPayload: { userId: "u1", username: "john" },
        }),
      }),
    );
  });

  it("notifies the other eligible approvers, excluding whoever just acted", async () => {
    mockFindMany.mockResolvedValue([
      { id: "actor", username: "hr-jane" },
      { id: "other-hr", username: "hr-bob" },
    ]);
    const cb = makeCallback();
    await allowKycEdit(
      makeCall({ employeeId: "u1", actorUserId: "actor" }),
      cb,
    );
    await flushMicrotasks();

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycEditResolved",
        pushTargets: ["hr-bob"],
        push: { enabled: false },
        inApp: expect.objectContaining({
          socketEvent: "kyc-edit-resolved",
          socketPayload: { userId: "u1", username: "john" },
        }),
      }),
    );
  });

  it("skips the resolved notification when the actor was the only approver", async () => {
    mockFindMany.mockResolvedValue([{ id: "actor", username: "hr-jane" }]);
    const cb = makeCallback();
    await allowKycEdit(
      makeCall({ employeeId: "u1", actorUserId: "actor" }),
      cb,
    );
    await flushMicrotasks();

    expect(mockNotify).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "kycEditResolved" }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await allowKycEdit(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
