import { prisma } from "@hrms/db";
import { getMessaging } from "../admin";
import { sendPushNotifications } from "../sendPushNotifications";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockSend = jest.fn();
jest.mock("../admin", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

const db: any = prisma;

function tokenEntry(overrides: Record<string, any> = {}) {
  return {
    token: "tok-1",
    deviceFingerprint: "fp-1",
    isActive: true,
    ...overrides,
  };
}

describe("sendPushNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the no-tokens result when the user lookup throws", async () => {
    db.user.findMany.mockRejectedValue(new Error("db down"));
    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(result).toEqual({
      success: false,
      message: "No active tokens found",
      sentCount: 0,
      failedCount: 0,
      totalTokens: 0,
    });
  });

  it("returns the no-tokens result when no user has any tokens", async () => {
    db.user.findMany.mockResolvedValue([]);
    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("queries all users with tokens for the ALL_USERS target", async () => {
    db.user.findMany.mockResolvedValue([]);
    await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fcmTokens: { not: null } } }),
    );
  });

  it("queries by username for a single-string target", async () => {
    db.user.findMany.mockResolvedValue([]);
    await sendPushNotifications("jdoe", "Title", "Body");
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: { in: ["jdoe"] }, fcmTokens: { not: null } },
      }),
    );
  });

  it("queries by username list for an array target", async () => {
    db.user.findMany.mockResolvedValue([]);
    await sendPushNotifications(["jdoe", "asmith"], "Title", "Body");
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          username: { in: ["jdoe", "asmith"] },
          fcmTokens: { not: null },
        },
      }),
    );
  });

  it("filters out inactive tokens before sending", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          tokenEntry({ token: "active-tok" }),
          tokenEntry({ token: "dead-tok", isActive: false }),
        ],
      },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({
      fcmTokens: [tokenEntry({ token: "active-tok" })],
    });
    db.user.update.mockResolvedValue({});
    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ token: "active-tok" }),
    );
    expect(result.totalTokens).toBe(1);
  });

  it("sends to only the most-recently-used token when latestOnly is set", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          tokenEntry({ token: "old-tok", lastUsed: "2024-01-01T00:00:00Z" }),
          tokenEntry({ token: "new-tok", lastUsed: "2024-06-01T00:00:00Z" }),
        ],
      },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({
      fcmTokens: [
        tokenEntry({ token: "new-tok", lastUsed: "2024-06-01T00:00:00Z" }),
      ],
    });
    db.user.update.mockResolvedValue({});
    await sendPushNotifications("ALL_USERS", "Title", "Body", {
      latestOnly: true,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ token: "new-tok" }),
    );
  });

  it("sends to all active tokens when latestOnly is not set (default)", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          tokenEntry({ token: "tok-a" }),
          tokenEntry({ token: "tok-b" }),
        ],
      },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: [] });
    db.user.update.mockResolvedValue({});
    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.totalTokens).toBe(2);
  });

  it("counts successes and updates lastUsed on the sent token", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: [tokenEntry()] },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: [tokenEntry()] });
    db.user.update.mockResolvedValue({});

    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sentCount: 1,
        failedCount: 0,
        totalTokens: 1,
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        fcmTokens: [expect.objectContaining({ lastUsed: expect.any(String) })],
      },
    });
  });

  it("counts a failure without throwing when send() rejects", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: [tokenEntry()] },
    ]);
    mockSend.mockRejectedValue(new Error("unknown fcm error"));
    const result = await sendPushNotifications("ALL_USERS", "Title", "Body");
    expect(result).toEqual(
      expect.objectContaining({ success: false, sentCount: 0, failedCount: 1 }),
    );
  });

  it("removes an invalid/unregistered token from the user's fcmTokens after a matching failure", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          tokenEntry({ token: "bad-tok", deviceFingerprint: "fp-bad" }),
        ],
      },
    ]);
    const err: any = new Error("invalid token");
    err.code = "messaging/registration-token-not-registered";
    mockSend.mockRejectedValue(err);
    db.user.findUnique.mockResolvedValue({
      fcmTokens: [
        tokenEntry({ token: "bad-tok", deviceFingerprint: "fp-bad" }),
      ],
    });
    db.user.update.mockResolvedValue({});

    await sendPushNotifications("ALL_USERS", "Title", "Body");

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fcmTokens: [] },
    });
  });

  it("does not clean up a token for a transient/unrelated error code", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [tokenEntry({ token: "tok-1", deviceFingerprint: "fp-1" })],
      },
    ]);
    const err: any = new Error("rate limited");
    err.code = "messaging/quota-exceeded";
    mockSend.mockRejectedValue(err);

    await sendPushNotifications("ALL_USERS", "Title", "Body");

    // findUnique is only called on the success path (to update lastUsed) or
    // during cleanup — neither should fire for a non-cleanup-eligible error.
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("passes the title/body through as the FCM notification payload", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: [tokenEntry()] },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: [tokenEntry()] });
    db.user.update.mockResolvedValue({});

    await sendPushNotifications("ALL_USERS", "Hello", "World");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: { title: "Hello", body: "World" },
      }),
    );
  });
});
