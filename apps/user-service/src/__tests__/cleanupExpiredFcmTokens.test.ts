import { prisma } from "@hrms/db";
import { cleanupExpiredFcmTokens } from "../handlers/cleanupExpiredFcmTokens";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findMany: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = prisma.user.findMany as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;

const makeCall = () => ({ request: {} }) as any;
const makeCallback = () => jest.fn();

describe("cleanupExpiredFcmTokens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 31, 12, 0, 0)); // 2024-03-31 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("cleans expired tokens (older than 30 days)", async () => {
    const oldDate = new Date(2024, 2, 1, 12, 0, 0); // 30 days before current
    const recentDate = new Date(2024, 2, 30, 12, 0, 0); // 1 day ago
    mockFindMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          { token: "expired", lastUsed: oldDate, isActive: true },
          { token: "active", lastUsed: recentDate, isActive: true },
        ],
      },
    ]);
    const cb = makeCallback();
    await cleanupExpiredFcmTokens(makeCall(), cb);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        fcmTokens: [{ token: "active", lastUsed: recentDate, isActive: true }],
      },
    });
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, cleaned: 1 }),
    );
  });

  it("skips users with no tokens needing cleanup", async () => {
    const recentDate = new Date(2024, 2, 30, 12, 0, 0);
    mockFindMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [{ token: "active", lastUsed: recentDate, isActive: true }],
      },
    ]);
    const cb = makeCallback();
    await cleanupExpiredFcmTokens(makeCall(), cb);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, cleaned: 0 }),
    );
  });

  it("cleans inactive tokens", async () => {
    const recentDate = new Date(2024, 2, 30, 12, 0, 0);
    mockFindMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          { token: "inactive", lastUsed: recentDate, isActive: false },
          { token: "active", lastUsed: recentDate, isActive: true },
        ],
      },
    ]);
    const cb = makeCallback();
    await cleanupExpiredFcmTokens(makeCall(), cb);
    const updatedTokens = mockUpdate.mock.calls[0][0].data.fcmTokens;
    expect(updatedTokens).toHaveLength(1);
    expect(updatedTokens[0].token).toBe("active");
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, cleaned: 1 }),
    );
  });

  it("handles empty users list", async () => {
    mockFindMany.mockResolvedValue([]);
    const cb = makeCallback();
    await cleanupExpiredFcmTokens(makeCall(), cb);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 0, cleaned: 0 }),
    );
  });

  it("returns INTERNAL on database error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const cb = makeCallback();
    await cleanupExpiredFcmTokens(makeCall(), cb);
    expect(cb).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ status: 13 }),
    );
  });
});
