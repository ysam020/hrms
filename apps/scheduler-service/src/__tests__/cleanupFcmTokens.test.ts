import { prisma } from "@hrms/db";
import { cleanupFcmTokens } from "../jobs/cleanupFcmTokens";

jest.mock("@hrms/db", () => {
  const _db = {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

// Mock firebase-admin dynamic import
const mockSend = jest.fn();
jest.mock(
  "firebase-admin",
  () => ({
    __esModule: true,
    default: {
      apps: [],
      initializeApp: jest.fn().mockReturnValue({}),
      credential: { cert: jest.fn() },
      messaging: jest.fn().mockReturnValue({ send: mockSend }),
    },
  }),
  { virtual: true },
);

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;

const recentDate = new Date(
  Date.now() - 10 * 24 * 60 * 60 * 1000,
).toISOString(); // 10 days ago
const staleDate = new Date(
  Date.now() - 100 * 24 * 60 * 60 * 1000,
).toISOString(); // 100 days ago

describe("cleanupFcmTokens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserUpdate.mockResolvedValue(undefined);
    mockSend.mockResolvedValue("message-id");
  });

  it("does nothing when no users have FCM tokens", async () => {
    mockUserFindMany.mockResolvedValue([]);
    await cleanupFcmTokens();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("skips users with empty token arrays", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "u1", username: "john", fcmTokens: [] },
    ]);
    await cleanupFcmTokens();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("removes tokens that were last used more than 90 days ago", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "stale-token", lastUsed: staleDate }],
      },
    ]);

    await cleanupFcmTokens();

    // stale token removed → user updated with empty array
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("keeps tokens that were recently used (within 90 days)", async () => {
    mockSend.mockResolvedValue("message-id"); // valid token
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "fresh-token", lastUsed: recentDate }],
      },
    ]);

    await cleanupFcmTokens();

    // Fresh token validated and kept — no update needed (removed === 0)
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("removes tokens that fail FCM validation with invalid-registration-token error", async () => {
    mockSend.mockRejectedValue({
      code: "messaging/invalid-registration-token",
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "invalid-token", lastUsed: recentDate }],
      },
    ]);

    await cleanupFcmTokens();

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("removes tokens that fail with registration-token-not-registered error", async () => {
    mockSend.mockRejectedValue({
      code: "messaging/registration-token-not-registered",
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "unregistered-token", lastUsed: recentDate }],
      },
    ]);

    await cleanupFcmTokens();

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("keeps tokens on non-validity FCM errors (e.g. network error)", async () => {
    mockSend.mockRejectedValue({ code: "messaging/internal-error" });
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "maybe-valid-token", lastUsed: recentDate }],
      },
    ]);

    await cleanupFcmTokens();

    // Token kept on ambiguous error
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("handles tokens stored as plain string (legacy format)", async () => {
    mockSend.mockRejectedValue({
      code: "messaging/invalid-registration-token",
    });
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        // Plain string token (legacy format)
        fcmTokens: ["legacy-string-token"],
      },
    ]);

    await cleanupFcmTokens();

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("processes multiple users independently", async () => {
    mockSend
      .mockRejectedValueOnce({ code: "messaging/invalid-registration-token" }) // user 1 token invalid
      .mockResolvedValueOnce("message-id"); // user 2 token valid

    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        username: "john",
        fcmTokens: [{ token: "bad-token", lastUsed: recentDate }],
      },
      {
        id: "u2",
        username: "jane",
        fcmTokens: [{ token: "good-token", lastUsed: recentDate }],
      },
    ]);

    await cleanupFcmTokens();

    // Only user 1 gets updated
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("throws when the database findMany call fails", async () => {
    mockUserFindMany.mockRejectedValue(new Error("DB error"));
    await expect(cleanupFcmTokens()).rejects.toThrow("DB error");
  });
});
