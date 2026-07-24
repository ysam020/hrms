import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { approveKyc } from "../handlers/approveKyc";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), update: jest.fn() },
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
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const user = { id: "u1", username: "john", kyc_approval: "Pending" };

describe("approveKyc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when employeeId is missing", async () => {
    const cb = makeCallback();
    await approveKyc(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await approveKyc(makeCall({ employeeId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns ALREADY_EXISTS when KYC already approved", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Approved" });
    const cb = makeCallback();
    await approveKyc(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 6 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("approves KYC, clears any earlier revision notes, and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    await approveKyc(makeCall({ employeeId: "u1" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { kyc_approval: "Approved", kyc_revision_notes: null },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:employee-details:john");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:john");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, kycStatus: "Approved" }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "kycApproved",
        targetUser: "john",
        push: { enabled: true },
      }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await approveKyc(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
