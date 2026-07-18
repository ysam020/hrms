import { prisma } from "@hrms/db";
import { requestIdStorage } from "@hrms/logger";
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
    notification: { create: jest.fn(), findFirst: jest.fn() },
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
  requestIdStorage: { run: jest.fn((_id: string, fn: () => any) => fn()) },
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

// Minimal fake Redis backing withNotificationJobLock's SET NX / compare-and-
// delete eval, so the lock behaves like the real thing (only one concurrent
// SET NX wins, release only succeeds for the token that set it) without a
// real Redis server.
const fakeRedisStore = new Map<string, string>();
const mockRedisSet = jest.fn(
  async (key: string, value: string, ...rest: any[]) => {
    const nx = rest.includes("NX");
    if (nx && fakeRedisStore.has(key)) return null;
    fakeRedisStore.set(key, value);
    return "OK";
  },
);
const mockRedisEval = jest.fn(
  async (_script: string, _numKeys: number, key: string, token: string) => {
    if (fakeRedisStore.get(key) === token) {
      fakeRedisStore.delete(key);
      return 1;
    }
    return 0;
  },
);
jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(() => ({ set: mockRedisSet, eval: mockRedisEval })),
}));

const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockNotificationCreate = (prisma as any).notification.create as jest.Mock;
const mockNotificationFindFirst = (prisma as any).notification
  .findFirst as jest.Mock;

const runProcessor = (data: Record<string, any>) =>
  capturedProcessor({ id: "job-1", data, opts: {} } as any);

describe("notificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedisStore.clear();
    mockNotificationCreate.mockResolvedValue({ id: "notif-1", recipients: [] });
    mockNotificationFindFirst.mockResolvedValue(null);
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

  describe("correlation ID propagation", () => {
    it("runs the job inside the producer's requestId context when the job carries one", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
        requestId: "req-abc-123",
      });

      expect(requestIdStorage.run).toHaveBeenCalledWith(
        "req-abc-123",
        expect.any(Function),
      );
    });

    it("does not touch requestIdStorage when the job carries no requestId (older producer, or direct enqueue)", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
      });

      expect(requestIdStorage.run).not.toHaveBeenCalled();
    });
  });

  describe("idempotency on BullMQ retry", () => {
    it("tags the created notification with the job's id", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
      });

      expect(mockNotificationFindFirst).toHaveBeenCalledWith({
        where: { jobId: "job-1" },
        include: { recipients: true },
      });
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ jobId: "job-1" }),
        }),
      );
    });

    it("is a no-op on a retried job that already completed — no duplicate create, WS broadcast, or push", async () => {
      mockNotificationFindFirst.mockResolvedValue({
        id: "notif-existing",
        recipients: [{ userId: "id-1" }],
      });

      const result = await runProcessor({
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
        sendPushNotification: true,
      });

      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(mockSendToUser).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          deduped: true,
          notificationId: "notif-existing",
        }),
      );
    });
  });

  describe("concurrent attempts at the same job (BullMQ stalled-job reassignment)", () => {
    it("acquires a per-jobId lock before the idempotency check, and releases it once done", async () => {
      await runProcessor({
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
      });

      expect(mockRedisSet).toHaveBeenCalledWith(
        "lock:notification-job:job-1",
        expect.any(String),
        "EX",
        expect.any(Number),
        "NX",
      );
      // Released (eval'd) after the critical section, not left held for its
      // full TTL — a later legitimate retry (real failure, not a race)
      // shouldn't have to wait out the lock.
      expect(mockRedisEval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        "lock:notification-job:job-1",
        expect.any(String),
      );
      expect(fakeRedisStore.has("lock:notification-job:job-1")).toBe(false);
    });

    it("serializes two concurrent attempts for the same job so only one create happens, not two duplicate sends", async () => {
      let created = false;
      mockNotificationFindFirst.mockImplementation(async () =>
        created ? { id: "notif-1", recipients: [{ userId: "id-1" }] } : null,
      );
      mockNotificationCreate.mockImplementation(async () => {
        // Real DB latency, so the second attempt's first lock-acquire
        // genuinely lands while the first attempt is still inside its
        // critical section — without this, the two calls wouldn't overlap
        // and the test wouldn't exercise the race at all.
        await new Promise((resolve) => setTimeout(resolve, 30));
        created = true;
        return { id: "notif-1", recipients: [{ userId: "id-1" }] };
      });

      const data = {
        tenantId: "tenant-1",
        title: "KYC",
        message: "hi",
        recipients: ["id-1"],
      };

      const [first, second] = await Promise.all([
        runProcessor(data),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return runProcessor(data);
        })(),
      ]);

      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).toHaveBeenCalledTimes(1); // exactly one broadcast, not two
      expect(first.notificationId).toBe("notif-1");
      expect(second.notificationId).toBe("notif-1");
      // exactly one of the two attempts actually created it; the other found
      // it already there and deduped instead of sending a second time
      const dedupedCount = [first.deduped, second.deduped].filter(
        Boolean,
      ).length;
      expect(dedupedCount).toBe(1);
    }, 10_000);

    it("fails (for BullMQ to retry later) rather than proceeding unguarded if a concurrent holder never releases the lock in time", async () => {
      jest.useFakeTimers();
      try {
        // Simulate another attempt already holding the lock indefinitely.
        fakeRedisStore.set("lock:notification-job:job-1", "someone-else");

        const result = runProcessor({
          tenantId: "tenant-1",
          title: "KYC",
          message: "hi",
          recipients: ["id-1"],
        });
        const assertion = expect(result).rejects.toThrow(/timed out waiting/);

        await jest.advanceTimersByTimeAsync(50 * 200); // exhaust the bounded wait
        await assertion;

        expect(mockNotificationCreate).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
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
