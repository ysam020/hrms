import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { requestKycEditAccess } from "../handlers/requestKycEditAccess";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
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
const mockUpdate = prisma.user.update as jest.Mock;
const mockFindMany = prisma.user.findMany as jest.Mock;
const mockMembershipFindMany = (prisma as any).tenantMembership
  .findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

// Lets the fire-and-forget notification .then() chain settle before
// assertions run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const user = { id: "u1", username: "john", kyc_approval: "Approved" };

describe("requestKycEditAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify.mockResolvedValue({ notificationId: "n1", jobIds: {} });
    mockUpdate.mockResolvedValue({
      ...user,
      kyc_approval: "Edit Requested",
      kyc_edit_request_reason: "Bank account changed",
    });
    mockFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await requestKycEditAccess(makeCall({ reason: "changed" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns INVALID_ARGUMENT when reason is missing or blank", async () => {
    const cb = makeCallback();
    await requestKycEditAccess(makeCall({ userId: "u1", reason: "   " }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u-99", reason: "changed" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns FAILED_PRECONDITION when the KYC isn't currently Approved", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Pending" });
    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u1", reason: "changed" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 9 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sets Edit Requested with the reason and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u1", reason: "Bank account changed" }),
      cb,
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        kyc_approval: "Edit Requested",
        kyc_edit_request_reason: "Bank account changed",
        kyc_edit_requested_at: expect.any(Date),
      },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:john");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, kycStatus: "Edit Requested" }),
    );
  });

  it("notifies everyone who can allow editing — superusers, explicit permission holders, and owner/admin/hr tenant members — deduped, not a HR department match", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockFindMany
      .mockResolvedValueOnce([
        { id: "super-1", username: "super_admin" },
        { id: "perm-1", username: "kyc_reviewer" },
      ]) // superuser + explicit BasicKYCDetails:request_kyc_revision:all holder
      .mockResolvedValueOnce([{ id: "owner-1", username: "owner_bob" }]); // resolved privileged tenant members not already counted
    mockMembershipFindMany.mockResolvedValue([
      { userId: "owner-1" },
      { userId: "perm-1" }, // already counted above — must not be double-notified
    ]);

    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u1", reason: "Bank account changed" }),
      cb,
    );
    await flushMicrotasks();

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", role: { in: ["owner", "admin", "hr"] } },
      select: { userId: true },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycEditAccessRequested",
        recipients: expect.arrayContaining(["super-1", "perm-1", "owner-1"]),
        pushTargets: expect.arrayContaining([
          "super_admin",
          "kyc_reviewer",
          "owner_bob",
        ]),
        push: { enabled: true },
        inApp: expect.objectContaining({
          socketEvent: "kyc-edit-requested",
          socketPayload: expect.objectContaining({
            userId: "u1",
            username: "john",
            reason: "Bank account changed",
          }),
        }),
      }),
    );
    const [payload] = mockNotify.mock.calls[0];
    expect(payload.recipients).toHaveLength(3);
  });

  it("does not enqueue a notification when there are no approvers", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);

    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u1", reason: "Bank account changed" }),
      cb,
    );
    await flushMicrotasks();

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await requestKycEditAccess(
      makeCall({ userId: "u1", reason: "changed" }),
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
