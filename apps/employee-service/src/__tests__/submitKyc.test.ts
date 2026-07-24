import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { submitKyc } from "../handlers/submitKyc";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    tenantMembership: { findMany: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    canonicalizeEmail: jest.requireActual("@hrms/db").canonicalizeEmail,
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

const user = { id: "u1", username: "john", kyc_approval: "Pending" };

describe("submitKyc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify.mockResolvedValue({ notificationId: "n1", jobIds: {} });
    mockUpdate.mockResolvedValue({
      ...user,
      kyc_approval: "Pending",
      kyc_date: new Date("2026-01-01"),
    });
    mockFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when userId is missing", async () => {
    const cb = makeCallback();
    await submitKyc(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates user KYC fields and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    await submitKyc(
      makeCall({
        userId: "u1",
        aadharNo: "1234-5678-9012",
        panNo: "ABCDE1234F",
        bankAccountNo: "ACC123",
      }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          aadhar_no: "1234-5678-9012",
          pan_no: "ABCDE1234F",
          kyc_approval: "Pending",
        }),
      }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee-details:john");
    // /get-user-data/:username (KYC edit-prefill + HR detail page) reads
    // through user-service's GetUser RPC cache — a separate key namespace
    // that must also be cleared, or that page keeps showing stale KYC data.
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:john");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("invalidates the resolved user's cache keys when called with only username (the api-gateway editKyc call shape)", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    // No userId in the request — mirrors editKyc's grpcCall(..., { username, ...kycFields })
    await submitKyc(makeCall({ username: "john", panNo: "ABCDE1234F" }), cb);

    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee-details:john");
    // The old bug deleted "employee:undefined" — assert that never happens.
    expect(mockCacheDelete).not.toHaveBeenCalledWith(
      expect.stringContaining("undefined"),
    );
  });

  it("preserves an existing Approved decision when edited via username only (HR correction, not a self-resubmission)", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    const cb = makeCallback();
    await submitKyc(makeCall({ username: "john", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate.mock.calls[0][0].data.kyc_approval).toBeUndefined();
  });

  it("sets Pending on first-ever submission via username only, even with no userId", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: null });
    const cb = makeCallback();
    await submitKyc(makeCall({ username: "john", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kyc_approval: "Pending" }),
      }),
    );
  });

  it("normalizes a retyped Gmail address the same way login does", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    await submitKyc(
      makeCall({ userId: "u1", email: "sameer.y020@gmail.com" }),
      cb,
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "sameery020@gmail.com" }),
      }),
    );
  });

  it("closes an open edit window on self-submit, re-locking the record", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_edit_window: "open" });
    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kyc_edit_window: "closed" }),
      }),
    );
  });

  it("leaves a fresh (never-reopened) self-submit's edit window as null", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_edit_window: null });
    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kyc_edit_window: null }),
      }),
    );
  });

  it("recomputes a stale closed window back to null on a later self-submit (e.g. after Revision Requested)", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_edit_window: "closed" });
    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kyc_edit_window: null }),
      }),
    );
  });

  it("does not touch the edit window on an HR-side correction (username only, no userId)", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_edit_window: "open" });
    const cb = makeCallback();
    await submitKyc(makeCall({ username: "john", panNo: "ABCDE1234F" }), cb);
    expect(mockUpdate.mock.calls[0][0].data.kyc_edit_window).toBeUndefined();
  });

  it("notifies everyone who can approve KYC — superusers, explicit permission holders, and owner/admin/hr tenant members — deduped, not a HR department match", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockFindMany
      .mockResolvedValueOnce([
        { id: "super-1", username: "super_admin" },
        { id: "perm-1", username: "kyc_reviewer" },
      ]) // superuser + explicit BasicKYCDetails:approve_kyc:all holder
      .mockResolvedValueOnce([{ id: "owner-1", username: "owner_bob" }]); // resolved privileged tenant members not already counted
    mockMembershipFindMany.mockResolvedValue([
      { userId: "owner-1" },
      { userId: "perm-1" }, // already counted above — must not be double-notified
    ]);

    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1", panNo: "ABCDE1234F" }), cb);
    await flushMicrotasks();

    expect(mockMembershipFindMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", role: { in: ["owner", "admin", "hr"] } },
      select: { userId: true },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycSubmitted",
        recipients: expect.arrayContaining(["super-1", "perm-1", "owner-1"]),
        pushTargets: expect.arrayContaining([
          "super_admin",
          "kyc_reviewer",
          "owner_bob",
        ]),
        push: { enabled: true },
        inApp: expect.objectContaining({
          socketEvent: "kyc-submitted",
          socketPayload: expect.objectContaining({
            userId: "u1",
            username: "john",
          }),
        }),
      }),
    );
    const [payload] = mockNotify.mock.calls[0];
    expect(payload.recipients).toHaveLength(3);
  });

  it("does not enqueue a notification when there are no approve_kyc holders", async () => {
    mockFindUnique.mockResolvedValue(user);
    mockFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);

    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1", panNo: "ABCDE1234F" }), cb);
    await flushMicrotasks();

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not enqueue a notification when the resulting kyc_approval is not Pending (e.g. an HR correction on an already-decided record)", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    mockUpdate.mockResolvedValueOnce({ ...user, kyc_approval: "Approved" });
    mockFindMany.mockResolvedValue([
      { id: "super-1", username: "super_admin" },
    ]);

    const cb = makeCallback();
    await submitKyc(makeCall({ username: "john", panNo: "ABCDE1234F" }), cb);
    await flushMicrotasks();

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await submitKyc(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
