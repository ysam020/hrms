import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  sendPushNotifications,
  PlatformBroadcastNotAuthorizedError,
} from "../sendPushNotifications";

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const PLATFORM = "cccccccccccccccccccccccc";
const USER_1 = "111111111111111111111111";
const USER_2 = "222222222222222222222222";
const AUDIENCE = { tenantId: TENANT_A, userIds: [USER_1] };

jest.mock("@hrms/db", () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      // The token sync is now a conditional write.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
  BLOCKED_STATUSES: ["Terminated", "Absconded", "Resigned"],
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
    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");
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
    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");
    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("queries only the given user ids inside the audience's tenant", async () => {
    db.user.findMany.mockResolvedValue([]);
    await sendPushNotifications(
      { tenantId: TENANT_A, userIds: [USER_1, USER_2, USER_1] },
      "Title",
      "Body",
    );
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [USER_1, USER_2] },
          tenantId: TENANT_A,
          fcmTokens: { not: null },
          // Never push to people whose employment ended.
          employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
        },
      }),
    );
  });

  it("never queries without a tenant filter for a user-id audience", async () => {
    db.user.findMany.mockResolvedValue([]);
    await sendPushNotifications(AUDIENCE, "Title", "Body");
    for (const [args] of db.user.findMany.mock.calls) {
      expect(args.where.tenantId).toBe(TENANT_A);
    }
  });

  it("sends nothing — and queries nothing — for an empty user-id list (no implicit 'everyone')", async () => {
    const result = await sendPushNotifications(
      { tenantId: TENANT_A, userIds: [] },
      "Title",
      "Body",
    );
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(result.sentCount).toBe(0);
  });

  it("drops malformed ids (e.g. usernames) instead of querying with them", async () => {
    const result = await sendPushNotifications(
      { tenantId: TENANT_A, userIds: ["jdoe"] },
      "Title",
      "Body",
    );
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(result.sentCount).toBe(0);
  });

  describe("platform-wide broadcast", () => {
    const ORIGINAL = process.env.PLATFORM_TENANT_ID;
    const auth = {
      tenantId: PLATFORM,
      authorizedBy: USER_1,
      reason: "Scheduled maintenance notice",
    };
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.PLATFORM_TENANT_ID;
      else process.env.PLATFORM_TENANT_ID = ORIGINAL;
    });

    it("is refused when PLATFORM_TENANT_ID is not configured (fails closed)", async () => {
      delete process.env.PLATFORM_TENANT_ID;
      await expect(
        sendPushNotifications({ platformBroadcast: auth }, "T", "B"),
      ).rejects.toBeInstanceOf(PlatformBroadcastNotAuthorizedError);
      expect(db.user.findMany).not.toHaveBeenCalled();
    });

    it("is refused for any tenant other than the platform tenant", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      await expect(
        sendPushNotifications(
          { platformBroadcast: { ...auth, tenantId: TENANT_A } },
          "T",
          "B",
        ),
      ).rejects.toBeInstanceOf(PlatformBroadcastNotAuthorizedError);
      expect(db.user.findMany).not.toHaveBeenCalled();
    });

    it("is refused without a named authorizer and reason", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      await expect(
        sendPushNotifications(
          { platformBroadcast: { ...auth, authorizedBy: " " } },
          "T",
          "B",
        ),
      ).rejects.toBeInstanceOf(PlatformBroadcastNotAuthorizedError);
      await expect(
        sendPushNotifications(
          { platformBroadcast: { ...auth, reason: "" } },
          "T",
          "B",
        ),
      ).rejects.toBeInstanceOf(PlatformBroadcastNotAuthorizedError);
    });

    it("reaches every user with a token when authorized, and records who authorized it", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      db.user.findMany.mockResolvedValue([]);
      await sendPushNotifications({ platformBroadcast: auth }, "T", "B");
      expect(db.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            fcmTokens: { not: null },
            employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
          },
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        "[FCM] Platform-wide push broadcast",
        { authorizedBy: USER_1, reason: auth.reason },
      );
    });
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
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");
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
    db.user.updateMany.mockResolvedValue({ count: 1 });
    await sendPushNotifications(AUDIENCE, "Title", "Body", {
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
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.totalTokens).toBe(2);
  });

  it("counts successes and updates lastUsed on the sent token", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: [tokenEntry()] },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: [tokenEntry()] });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sentCount: 1,
        failedCount: 0,
        totalTokens: 1,
      }),
    );
    // Conditional on the person still being employed.
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
      },
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
    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");
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
    db.user.updateMany.mockResolvedValue({ count: 1 });

    await sendPushNotifications(AUDIENCE, "Title", "Body");

    // Conditional on the person still being employed.
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
      },
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

    await sendPushNotifications(AUDIENCE, "Title", "Body");

    // findUnique is only called on the success path (to update lastUsed) or
    // during cleanup — neither should fire for a non-cleanup-eligible error.
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("sends to a legacy string-format token entry, and upgrades it to object form with a lastUsed timestamp on success", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: ["legacy-tok"] },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: ["legacy-tok"] });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ token: "legacy-tok" }),
    );
    expect(result.sentCount).toBe(1);
    // Conditional on the person still being employed.
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
      },
      data: {
        fcmTokens: [{ token: "legacy-tok", lastUsed: expect.any(String) }],
      },
    });
  });

  it("removes a legacy string-format token entry after an invalid-token failure", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: ["bad-legacy-tok"] },
    ]);
    const err: any = new Error("invalid token");
    err.code = "messaging/invalid-registration-token";
    mockSend.mockRejectedValue(err);
    db.user.findUnique.mockResolvedValue({ fcmTokens: ["bad-legacy-tok"] });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    await sendPushNotifications(AUDIENCE, "Title", "Body");

    // Conditional on the person still being employed.
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "u1",
        employeeStatus: { notIn: ["Terminated", "Absconded", "Resigned"] },
      },
      data: { fcmTokens: [] },
    });
  });

  it("batches a multi-device user's lastUsed updates into a single read-modify-write instead of one per device", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        fcmTokens: [
          tokenEntry({ token: "device-a", deviceFingerprint: "fp-a" }),
          tokenEntry({ token: "device-b", deviceFingerprint: "fp-b" }),
        ],
      },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({
      fcmTokens: [
        tokenEntry({ token: "device-a", deviceFingerprint: "fp-a" }),
        tokenEntry({ token: "device-b", deviceFingerprint: "fp-b" }),
      ],
    });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await sendPushNotifications(AUDIENCE, "Title", "Body");

    expect(result.sentCount).toBe(2);
    // One combined read and one combined write for both of this user's
    // devices, not one per device — avoids the two concurrent sends racing
    // to read-modify-write the same array and clobbering each other.
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    const written = db.user.updateMany.mock.calls[0][0].data.fcmTokens;
    expect(written).toHaveLength(2);
    expect(written.every((t: any) => typeof t.lastUsed === "string")).toBe(
      true,
    );
  });

  it("passes the title/body through as the FCM notification payload", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", fcmTokens: [tokenEntry()] },
    ]);
    mockSend.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ fcmTokens: [tokenEntry()] });
    db.user.updateMany.mockResolvedValue({ count: 1 });

    await sendPushNotifications(AUDIENCE, "Hello", "World");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: { title: "Hello", body: "World" },
      }),
    );
  });
});

// The token sync must not resurrect a terminated person's tokens.
describe("sendPushNotifications — termination during delivery", () => {
  it("the post-send token sync is conditional on the person still being employed", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: USER_1,
        fcmTokens: [{ token: "tok-1", lastUsed: new Date().toISOString() }],
      },
    ]);
    mockSend.mockResolvedValue("ok");
    // Read happened before the termination; by the time we write, the
    // person is Terminated — the conditional write matches nothing.
    db.user.findUnique.mockResolvedValue({
      fcmTokens: [{ token: "tok-1", lastUsed: new Date().toISOString() }],
    });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await sendPushNotifications(
      { tenantId: TENANT_A, userIds: [USER_1] },
      "T",
      "B",
    );
    const where = db.user.updateMany.mock.calls.at(-1)[0].where;
    expect(where.employeeStatus).toEqual({
      notIn: ["Terminated", "Absconded", "Resigned"],
    });
    expect(db.user.update).not.toHaveBeenCalled(); // never the unconditional write
  });
});
