import { prisma } from "@hrms/db";
import { startNotificationWorker } from "../workers/notificationWorker";

let capturedProcessor: (job: any) => Promise<any>;
let capturedHandlers: Record<string, (...args: any[]) => void>;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    capturedHandlers = {};
    return {
      on: jest.fn((event: string, handler: any) => {
        capturedHandlers[event] = handler;
      }),
    };
  }),
}));

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findMany: jest.fn() },
    notification: { create: jest.fn() },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ dbName: "hrms-test-tenant" }),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getClientForDb: jest.fn(() => ({})),
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

const mockDlqAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: mockDlqAdd })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/firebase", () => ({
  sendPushNotifications: jest
    .fn()
    .mockResolvedValue({ sentCount: 0, failedCount: 0, success: true }),
}));

const { sendPushNotifications: mockSendPushNotifications } =
  jest.requireMock("@hrms/firebase");

const mockSendToUser = jest.fn().mockResolvedValue(true);
const mockSendNotification = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/websocket", () => ({
  getNotificationPublisher: jest.fn(() => ({
    sendToUser: mockSendToUser,
    sendNotification: mockSendNotification,
  })),
}));

const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockNotificationCreate = (prisma as any).notification.create as jest.Mock;

const runProcessor = (data: Record<string, any>) =>
  capturedProcessor({ id: "job-1", data, opts: {} } as any);

describe("notificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({ id: "notif-1", recipients: [] });
    startNotificationWorker();
  });

  // The socket registry (RedisWebSocketAdapter) keys connected sockets by
  // userId, not username — sendToUser() must be called with the resolved
  // userId, never the raw username, or every targeted WS delivery silently
  // no-ops ("user may be offline") even for connected users.
  it("delivers to WebSocket using resolved userIds, not raw usernames, when recipients are explicit ids", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      recipients: ["id-1", "id-2"],
      pushTargets: ["alice", "bob"],
    });

    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-1",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-2",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "alice",
      expect.anything(),
      expect.anything(),
    );
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "bob",
      expect.anything(),
      expect.anything(),
    );
  });

  it("resolves pushTargets usernames to userIds before WebSocket delivery when no explicit recipients are given", async () => {
    mockUserFindMany.mockResolvedValue([{ id: "id-1" }, { id: "id-2" }]);

    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      pushTargets: ["alice", "bob"],
    });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { username: { in: ["alice", "bob"] } },
      select: { id: true },
    });
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-1",
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      "id-2",
      "notification",
      expect.anything(),
    );
  });

  it("also delivers a custom socketEvent to resolved userIds, not usernames", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "KYC",
      message: "hi",
      recipients: ["id-1"],
      pushTargets: ["alice"],
      socketEvent: "kyc-edit-requested",
      socketPayload: { username: "alice" },
    });

    expect(mockSendToUser).toHaveBeenCalledWith("id-1", "kyc-edit-requested", {
      username: "alice",
    });
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "alice",
      "kyc-edit-requested",
      expect.anything(),
    );
  });

  it("broadcasts instead of targeting when there are no recipients at all", async () => {
    await runProcessor({
      tenantId: "tenant-1",
      title: "Announcement",
      message: "hi",
    });

    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalled();
  });

  describe("tenant safety guards", () => {
    it("throws (refuses to process) when the job has no tenantId", async () => {
      await expect(runProcessor({ title: "x", message: "y" })).rejects.toThrow(
        /missing tenantId/,
      );
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("throws when the tenant has no resolvable database", async () => {
      (prisma as any).tenant.findUnique.mockResolvedValueOnce({ dbName: null });
      await expect(
        runProcessor({ tenantId: "tenant-1", title: "x", message: "y" }),
      ).rejects.toThrow(/has no resolvable database/);
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("throws when the tenant record itself does not exist", async () => {
      (prisma as any).tenant.findUnique.mockResolvedValueOnce(null);
      await expect(
        runProcessor({ tenantId: "tenant-1", title: "x", message: "y" }),
      ).rejects.toThrow(/has no resolvable database/);
    });
  });

  describe("FCM push notifications", () => {
    it("sends to pushTargets when provided", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "Title",
        message: "Body",
        pushTargets: ["alice", "bob"],
      });
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        ["alice", "bob"],
        "Title",
        "Body",
      );
    });

    it("falls back to targetUser (normalized to an array) when pushTargets is empty", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "Title",
        message: "Body",
        targetUser: "alice",
      });
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        ["alice"],
        "Title",
        "Body",
      );
    });

    it("broadcasts to ALL_USERS when there are no push targets at all", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "Title",
        message: "Body",
      });
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        "ALL_USERS",
        "Title",
        "Body",
      );
    });

    it("skips FCM entirely when sendPushNotification is false", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "Title",
        message: "Body",
        sendPushNotification: false,
      });
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });

    it("includes the FCM result in the job's return value", async () => {
      mockSendPushNotifications.mockResolvedValueOnce({
        sentCount: 3,
        failedCount: 1,
        success: true,
      });
      const result = await runProcessor({
        tenantId: "tenant-1",
        title: "Title",
        message: "Body",
      });
      expect(result.pushNotificationResult).toEqual({
        sentCount: 3,
        failedCount: 1,
        success: true,
      });
    });
  });

  describe("worker lifecycle events", () => {
    it("forwards an exhausted-retry failure to the dead-letter queue", async () => {
      const job = {
        id: "j1",
        data: { tenantId: "t1" },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      capturedHandlers.failed(job, new Error("processing crashed"));
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-notification",
        expect.objectContaining({
          originalQueue: "notificationQueue",
          originalJobId: "j1",
          failureReason: "processing crashed",
        }),
      );
    });

    it("does not forward to the DLQ while retry attempts remain", async () => {
      const job = {
        id: "j2",
        data: { tenantId: "t1" },
        attemptsMade: 1,
        opts: { attempts: 3 },
      };
      capturedHandlers.failed(job, new Error("transient error"));
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockDlqAdd).not.toHaveBeenCalled();
    });

    it("logs stalled and worker-error events", () => {
      const { logger } = require("@hrms/logger");
      capturedHandlers.stalled("j3");
      expect(logger.warn).toHaveBeenCalledWith("Notification job j3 stalled");

      capturedHandlers.error(new Error("conn lost"));
      expect(logger.error).toHaveBeenCalledWith("Notification worker error:", {
        err: expect.any(Error),
      });
    });
  });
});
