import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { rejectKyc } from "../handlers/rejectKyc";

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

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue(undefined),
  })),
}));

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

describe("rejectKyc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...user, kyc_approval: "Rejected" });
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
  });

  it("returns INVALID_ARGUMENT when employeeId is missing", async () => {
    const cb = makeCallback();
    await rejectKyc(makeCall({}), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 3 }),
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await rejectKyc(makeCall({ employeeId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns ALREADY_EXISTS when KYC already rejected", async () => {
    mockFindUnique.mockResolvedValue({ ...user, kyc_approval: "Rejected" });
    const cb = makeCallback();
    await rejectKyc(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 6 }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects KYC and invalidates cache", async () => {
    mockFindUnique.mockResolvedValue(user);
    const cb = makeCallback();
    await rejectKyc(makeCall({ employeeId: "u1" }), cb);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { kyc_approval: "Rejected" },
    });
    expect(mockInvalidate).toHaveBeenCalledWith("employees:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("employee:u1");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await rejectKyc(makeCall({ employeeId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
