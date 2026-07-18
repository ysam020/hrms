import { status } from "@grpc/grpc-js";
import { prisma, checkUserHasHistoricalRecords } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { deleteUser } from "../handlers/deleteUser";
import { MESSAGES } from "../constants/messages";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn(), delete: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    checkUserHasHistoricalRecords: jest.fn(),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn(), delete: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockDelete = prisma.user.delete as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;
const mockCheckHistoricalRecords = checkUserHasHistoricalRecords as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("deleteUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockCheckHistoricalRecords.mockResolvedValue({
      hasRecords: false,
      models: [],
    });
  });

  it("returns NOT_FOUND when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const cb = makeCallback();
    await deleteUser(makeCall({ userId: "u-99" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 5 }),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes user and invalidates cache on success", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", username: "john" });
    const cb = makeCallback();
    await deleteUser(makeCall({ userId: "u1" }), cb);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(mockInvalidate).toHaveBeenCalledWith("t:t1:users:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("t:t1:user:v6:u1");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
  });

  it("blocks hard-delete when the user has historical records", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", username: "john" });
    mockCheckHistoricalRecords.mockResolvedValue({
      hasRecords: true,
      models: ["leaveApplication"],
    });
    const cb = makeCallback();
    await deleteUser(makeCall({ userId: "u1" }), cb);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(null, {
      message: MESSAGES.USER_HAS_HISTORICAL_RECORDS,
      status: status.FAILED_PRECONDITION,
    });
  });

  it("returns INTERNAL on database error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await deleteUser(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
