import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { deleteUser } from "../handlers/deleteUser";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), delete: jest.fn() },
  },
}));

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

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

describe("deleteUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidate.mockResolvedValue(undefined);
    mockCacheDelete.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
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
    expect(mockInvalidate).toHaveBeenCalledWith("users:*");
    expect(mockCacheDelete).toHaveBeenCalledWith("user:u1");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0 }),
    );
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
