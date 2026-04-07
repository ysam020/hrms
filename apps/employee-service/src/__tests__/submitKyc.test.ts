import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { submitKyc } from "../handlers/submitKyc";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  },
}));

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
const mockFindMany = prisma.user.findMany as jest.Mock;
const mockInvalidate = cacheManager.invalidatePattern as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

const makeCall = (req: any) => ({ request: req }) as any;
const makeCallback = () => jest.fn();

const user = { id: "u1", username: "john", kyc_approval: "Pending" };

describe("submitKyc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...user, kyc_approval: "Pending" });
    mockFindMany.mockResolvedValue([]);
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
    await submitKyc(makeCall({ userId: "u1" }), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
