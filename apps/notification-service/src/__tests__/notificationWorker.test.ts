import { prisma } from "@hrms/db";
import { requestIdStorage } from "@hrms/logger";
import { startNotificationWorker } from "../workers/notificationWorker";

let capturedProcessor: (job: any) => Promise<any>;
let capturedHandlers: Record<string, (...args: any[]) => void>;
// Every constructed worker by queue name; capturedProcessor/Handlers above
// are the last one constructed (the current queue's).
const mockWorkersByQueue: Record<
  string,
  { processor: any; handlers: Record<string, (...args: any[]) => void> }
> = {};

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((name: string, processor: any) => {
    capturedProcessor = processor;
    capturedHandlers = {};
    mockWorkersByQueue[name] = { processor, handlers: capturedHandlers };
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
    BLOCKED_STATUSES: ["Terminated", "Absconded", "Resigned"],
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

const mockDlqAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/queue", () => ({
  NOTIFICATION_QUEUE_NAME: "notificationQueueV2",
  LEGACY_NOTIFICATION_QUEUE_NAME: "notificationQueue",
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
  // The real check — authorization is part of what these tests verify.
  assertPlatformBroadcastAuthorized:
    jest.requireActual("@hrms/firebase").assertPlatformBroadcastAuthorized,
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
const mockRedisGet = jest.fn(
  async (key: string) => fakeRedisStore.get(key) ?? null,
);
jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    eval: mockRedisEval,
  })),
}));

const mockUserFindMany = (prisma as any).user.findMany as jest.Mock;
const mockNotificationCreate = (prisma as any).notification.create as jest.Mock;
const mockNotificationFindFirst = (prisma as any).notification
  .findFirst as jest.Mock;

const runProcessor = (data: Record<string, any>) =>
  capturedProcessor({ id: "job-1", data, opts: {} } as any);

const TENANT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const PLATFORM = "cccccccccccccccccccccccc";
const ALICE = "a11ce0000000000000000001";
const BOB = "b0b000000000000000000002";
// A real user of a different organisation: in production the tenant filter
// on prismaWithTenant.user hides them, which this directory reproduces.
const OUTSIDER = "0f0f00000000000000000003";
const TENANT_USERS = [
  { id: ALICE, username: "alice" },
  { id: BOB, username: "bob" },
];

// Answers prismaWithTenant.user.findMany the way the tenant-scoped client
// does: only this tenant's users, filtered by id / username / OR.
function tenantDirectory({ where }: { where?: any } = {}) {
  const matches = (u: { id: string; username: string }, w: any): boolean => {
    if (!w) return true;
    if (w.OR) return w.OR.some((c: any) => matches(u, c));
    if (w.id?.in && !w.id.in.includes(u.id)) return false;
    if (w.username?.in && !w.username.in.includes(u.username)) return false;
    return true;
  };
  return Promise.resolve(TENANT_USERS.filter((u) => matches(u, where)));
}

describe("notificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeRedisStore.clear();
    mockNotificationCreate.mockResolvedValue({ id: "notif-1", recipients: [] });
    mockNotificationFindFirst.mockResolvedValue(null);
    mockUserFindMany.mockImplementation(tenantDirectory);
    startNotificationWorker();
  });

  // The socket registry (RedisWebSocketAdapter) keys connected sockets by
  // userId, not username — sendToUser() must be called with the resolved
  // userId, never the raw username, or every targeted WS delivery silently
  // no-ops ("user may be offline") even for connected users.
  it("delivers to WebSocket using resolved userIds, not raw usernames, when recipients are explicit ids", async () => {
    await runProcessor({
      tenantId: TENANT,
      title: "KYC",
      message: "hi",
      recipients: [ALICE, BOB],
      pushTargets: ["alice", "bob"],
    });

    expect(mockSendToUser).toHaveBeenCalledWith(
      ALICE,
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      BOB,
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
    await runProcessor({
      tenantId: TENANT,
      title: "KYC",
      message: "hi",
      pushTargets: ["alice", "bob"],
    });

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { username: { in: ["alice", "bob"] } },
      select: { id: true, username: true },
    });
    expect(mockSendToUser).toHaveBeenCalledWith(
      ALICE,
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).toHaveBeenCalledWith(
      BOB,
      "notification",
      expect.anything(),
    );
  });

  it("also delivers a custom socketEvent to resolved userIds, not usernames", async () => {
    await runProcessor({
      tenantId: TENANT,
      title: "KYC",
      message: "hi",
      recipients: [ALICE],
      pushTargets: ["alice"],
      socketEvent: "kyc-edit-requested",
      socketPayload: { username: "alice" },
    });

    expect(mockSendToUser).toHaveBeenCalledWith(ALICE, "kyc-edit-requested", {
      username: "alice",
    });
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      "alice",
      "kyc-edit-requested",
      expect.anything(),
    );
  });

  it("fails permanently — never broadcasts — when the job names no recipients", async () => {
    const run = runProcessor({
      tenantId: TENANT,
      title: "Announcement",
      message: "hi",
    });
    await expect(run).rejects.toMatchObject({ name: "UnrecoverableError" });
    await expect(run).rejects.toThrow(/no recipient in tenant/);

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockSendPushNotifications).not.toHaveBeenCalled();
  });

  describe("correlation ID propagation", () => {
    it("runs the job inside the producer's requestId context when the job carries one", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
        requestId: "req-abc-123",
      });

      expect(requestIdStorage.run).toHaveBeenCalledWith(
        "req-abc-123",
        expect.any(Function),
      );
    });

    it("does not touch requestIdStorage when the job carries no requestId (older producer, or direct enqueue)", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
      });

      expect(requestIdStorage.run).not.toHaveBeenCalled();
    });
  });

  describe("idempotency on BullMQ retry", () => {
    it("tags the created notification with the job's id", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
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
        recipients: [{ userId: ALICE }],
      });

      const result = await runProcessor({
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
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
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
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
        created ? { id: "notif-1", recipients: [{ userId: ALICE }] } : null,
      );
      mockNotificationCreate.mockImplementation(async () => {
        // Real DB latency, so the second attempt's first lock-acquire
        // genuinely lands while the first attempt is still inside its
        // critical section — without this, the two calls wouldn't overlap
        // and the test wouldn't exercise the race at all.
        await new Promise((resolve) => setTimeout(resolve, 30));
        created = true;
        return { id: "notif-1", recipients: [{ userId: ALICE }] };
      });

      const data = {
        tenantId: TENANT,
        title: "KYC",
        message: "hi",
        recipients: [ALICE],
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
          tenantId: TENANT,
          title: "KYC",
          message: "hi",
          recipients: [ALICE],
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
        runProcessor({ tenantId: TENANT, title: "x", message: "y" }),
      ).rejects.toThrow(/has no resolvable database/);
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("throws when the tenant record itself does not exist", async () => {
      (prisma as any).tenant.findUnique.mockResolvedValueOnce(null);
      await expect(
        runProcessor({ tenantId: TENANT, title: "x", message: "y" }),
      ).rejects.toThrow(/has no resolvable database/);
    });
  });

  describe("FCM push notifications", () => {
    it("sends to pushTargets when provided", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "Title",
        message: "Body",
        pushTargets: ["alice", "bob"],
      });
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE, BOB] },
        "Title",
        "Body",
      );
    });

    it("resolves targetUser (normalized to an array) when pushTargets is empty", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "Title",
        message: "Body",
        targetUser: "alice",
      });
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE] },
        "Title",
        "Body",
      );
    });

    it("pushes to the resolved recipients when only user ids are given — never to everyone", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "Performance Review",
        message: "Body",
        recipients: [ALICE],
      });
      expect(mockSendPushNotifications).toHaveBeenCalledTimes(1);
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE] },
        "Performance Review",
        "Body",
      );
    });

    it("skips FCM entirely when sendPushNotification is false", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "Title",
        message: "Body",
        recipients: [ALICE],
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
        tenantId: TENANT,
        title: "Title",
        message: "Body",
        recipients: [ALICE],
      });
      expect(result.pushNotificationResult).toEqual({
        sentCount: 3,
        failedCount: 1,
        success: true,
      });
    });
  });

  describe("recipient identity and tenant isolation", () => {
    const base = { tenantId: TENANT, title: "Leave", message: "Approved" };

    it("delivers by user id", async () => {
      const result = await runProcessor({ ...base, recipients: [BOB] });
      expect(mockSendToUser).toHaveBeenCalledWith(
        BOB,
        "notification",
        expect.anything(),
      );
      expect(result.unresolvedTargets).toEqual([]);
    });

    it("delivers by username", async () => {
      await runProcessor({ ...base, pushTargets: ["bob"] });
      expect(mockSendToUser).toHaveBeenCalledWith(
        BOB,
        "notification",
        expect.anything(),
      );
    });

    it("resolves a user id passed as targetUser (jobs enqueued before producers switched to recipients)", async () => {
      await runProcessor({ ...base, targetUser: ALICE });
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: {
          OR: [{ username: { in: [ALICE] } }, { id: { in: [ALICE] } }],
        },
        select: { id: true, username: true },
      });
      expect(mockSendToUser).toHaveBeenCalledWith(
        ALICE,
        "notification",
        expect.anything(),
      );
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("only ever looks users up through the tenant-scoped client", async () => {
      await runProcessor({ ...base, recipients: [ALICE] });
      // prisma and prismaWithTenant are the same mock object here; the
      // assertion that matters is that the lookup is a findMany on `user`
      // inside runWithTenant, which in production carries the tenant filter.
      const { runWithTenant } = jest.requireMock("@hrms/db");
      expect(runWithTenant).toHaveBeenCalledWith(
        TENANT,
        expect.anything(),
        expect.any(Function),
      );
      expect(mockUserFindMany).toHaveBeenCalledWith({
        where: { id: { in: [ALICE] } },
        select: { id: true },
      });
    });

    it("fails permanently, reaching nobody, when the only recipient belongs to another organisation", async () => {
      const run = runProcessor({ ...base, recipients: [OUTSIDER] });
      await expect(run).rejects.toMatchObject({ name: "UnrecoverableError" });
      await expect(run).rejects.toThrow(OUTSIDER);

      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(mockSendToUser).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });

    it("fails permanently for an unknown username instead of broadcasting", async () => {
      await expect(
        runProcessor({ ...base, targetUser: "nobody" }),
      ).rejects.toThrow(/unresolved: nobody/);
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });

    it("delivers to the resolvable recipients and records the rest", async () => {
      const { logger } = jest.requireMock("@hrms/logger");
      const result = await runProcessor({
        ...base,
        recipients: [ALICE, OUTSIDER, "not-an-id"],
      });

      expect(mockSendToUser).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).toHaveBeenCalledWith(
        ALICE,
        "notification",
        expect.anything(),
      );
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE] },
        "Leave",
        "Approved",
      );
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipients: { create: [{ tenantId: TENANT, userId: ALICE }] },
          }),
        }),
      );
      expect(result.unresolvedTargets).toEqual([OUTSIDER, "not-an-id"]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("2 target(s) not found"),
        { unresolved: [OUTSIDER, "not-an-id"] },
      );
    });

    it("delivers a silent ping only to the resolved recipients of the tenant", async () => {
      await runProcessor({
        ...base,
        silent: true,
        pushTargets: ["alice"],
      });
      expect(mockSendToUser).toHaveBeenCalledWith(
        ALICE,
        "notification",
        expect.objectContaining({ silent: true }),
      );
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE] },
        "Leave",
        "Approved",
      );
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("fails a silent job with no recipients instead of broadcasting the ping", async () => {
      await expect(
        runProcessor({ ...base, silent: true }),
      ).rejects.toMatchObject({ name: "UnrecoverableError" });
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendToUser).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });
  });

  describe("explicit broadcasts", () => {
    const ORIGINAL = process.env.PLATFORM_TENANT_ID;
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.PLATFORM_TENANT_ID;
      else process.env.PLATFORM_TENANT_ID = ORIGINAL;
    });

    it("a tenant broadcast reaches every user of that tenant, individually, and nobody else", async () => {
      await runProcessor({
        tenantId: TENANT,
        title: "Office closed",
        message: "Friday",
        broadcast: { scope: "tenant" },
      });

      expect(mockUserFindMany).toHaveBeenCalledWith({ select: { id: true } });
      expect(mockSendToUser).toHaveBeenCalledWith(
        ALICE,
        "notification",
        expect.anything(),
      );
      expect(mockSendToUser).toHaveBeenCalledWith(
        BOB,
        "notification",
        expect.anything(),
      );
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        { tenantId: TENANT, userIds: [ALICE, BOB] },
        "Office closed",
        "Friday",
      );
    });

    it("a platform broadcast from a customer tenant is refused permanently", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      const run = runProcessor({
        tenantId: TENANT,
        title: "x",
        message: "y",
        broadcast: { scope: "platform", authorizedBy: ALICE, reason: "test" },
      });
      await expect(run).rejects.toMatchObject({ name: "UnrecoverableError" });
      await expect(run).rejects.toThrow(/not the platform tenant/);
      expect(mockNotificationCreate).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });

    it("a platform broadcast is refused when PLATFORM_TENANT_ID is not configured", async () => {
      delete process.env.PLATFORM_TENANT_ID;
      await expect(
        runProcessor({
          tenantId: PLATFORM,
          title: "x",
          message: "y",
          broadcast: { scope: "platform", authorizedBy: ALICE, reason: "r" },
        }),
      ).rejects.toThrow(/PLATFORM_TENANT_ID is not configured/);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("a platform broadcast is refused without a named authorizer", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      await expect(
        runProcessor({
          tenantId: PLATFORM,
          title: "x",
          message: "y",
          broadcast: { scope: "platform", authorizedBy: "", reason: "r" },
        }),
      ).rejects.toThrow(/authorizedBy and reason are required/);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("an authorized platform broadcast from the platform tenant reaches every socket and push token", async () => {
      process.env.PLATFORM_TENANT_ID = PLATFORM;
      await runProcessor({
        tenantId: PLATFORM,
        title: "Maintenance",
        message: "Sunday 02:00",
        broadcast: {
          scope: "platform",
          authorizedBy: ALICE,
          reason: "Planned downtime",
        },
      });

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        {
          platformBroadcast: {
            tenantId: PLATFORM,
            authorizedBy: ALICE,
            reason: "Planned downtime",
          },
        },
        "Maintenance",
        "Sunday 02:00",
      );
    });
  });

  describe("queues consumed", () => {
    // Pre-fix workers consume only "notificationQueue" and broadcast a job
    // they can't resolve; producers now write to "notificationQueueV2" so
    // such a worker never sees their jobs. This worker must drain both.
    it("consumes both the current and the legacy queue", () => {
      expect(Object.keys(mockWorkersByQueue).sort()).toEqual([
        "notificationQueue",
        "notificationQueueV2",
      ]);
    });

    it("processes a legacy-queue job with the same tenant-scoped resolution (no broadcast)", async () => {
      const job = {
        id: "legacy-1",
        data: { tenantId: TENANT, title: "t", message: "m" },
      };
      await expect(
        mockWorkersByQueue.notificationQueue.processor(job),
      ).rejects.toMatchObject({ name: "UnrecoverableError" });
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockSendPushNotifications).not.toHaveBeenCalled();
    });

    it("labels dead-letter entries with the queue the job failed on", async () => {
      const job = {
        id: "legacy-2",
        data: { tenantId: "t1" },
        attemptsMade: 3,
        opts: { attempts: 3 },
      };
      mockWorkersByQueue.notificationQueue.handlers.failed(
        job,
        new Error("boom"),
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-notification",
        expect.objectContaining({
          originalQueue: "notificationQueue",
          originalJobId: "legacy-2",
        }),
      );
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
          originalQueue: "notificationQueueV2",
          originalJobId: "j1",
          failureReason: "processing crashed",
        }),
      );
    });

    it("forwards a permanent (UnrecoverableError) failure to the DLQ on its first attempt", async () => {
      const job = {
        id: "j4",
        data: { tenantId: "t1" },
        attemptsMade: 1,
        opts: { attempts: 3 },
      };
      const err = new Error("no recipient in tenant t1");
      err.name = "UnrecoverableError";
      capturedHandlers.failed(job, err);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockDlqAdd).toHaveBeenCalledWith(
        "failed-notification",
        expect.objectContaining({
          originalJobId: "j4",
          failureReason: "no recipient in tenant t1",
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

// A notification may still be FOR a terminated person (it is
// recorded), but nothing is delivered to their devices — checked when the
// job runs, so termination while it sat in the queue (or between retries)
// applies.
describe("notificationWorker — recipient eligibility at delivery time", () => {
  let bobStatus = "Active";
  // The tenant directory, now honouring the employeeStatus filter the way
  // the database does.
  const directoryWithStatus = ({ where }: { where?: any } = {}) =>
    tenantDirectory({ where }).then((rows) =>
      rows.filter((u) => {
        const notIn: string[] | undefined = where?.employeeStatus?.notIn;
        const status = u.id === BOB ? bobStatus : "Active";
        return !notIn || !notIn.includes(status);
      }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    bobStatus = "Active";
    mockUserFindMany.mockImplementation(directoryWithStatus);
    (prisma as any).notification.findFirst.mockResolvedValue(null);
    (prisma as any).notification.create.mockImplementation(
      async ({ data }: any) => ({
        id: "n1",
        ...data,
        recipients: [],
      }),
    );
  });

  it("does not push a realtime notification to a terminated recipient, still delivers to an active one", async () => {
    bobStatus = "Terminated";
    await runProcessor({
      tenantId: TENANT,
      title: "Chat",
      message: "preview text",
      recipients: [ALICE, BOB],
    });
    expect(mockSendToUser).toHaveBeenCalledWith(
      ALICE,
      "notification",
      expect.anything(),
    );
    expect(mockSendToUser).not.toHaveBeenCalledWith(
      BOB,
      expect.anything(),
      expect.anything(),
    );
  });

  it("termination while the job was queued: the next attempt (retry) re-checks", async () => {
    await runProcessor({
      tenantId: TENANT,
      title: "t",
      message: "m",
      recipients: [BOB],
      socketEvent: "chat:message",
    });
    expect(mockSendToUser).toHaveBeenCalledWith(
      BOB,
      "notification",
      expect.anything(),
    );
    mockSendToUser.mockClear();
    (prisma as any).notification.findFirst.mockResolvedValue(null); // first attempt "failed" before persisting
    bobStatus = "Resigned";
    await runProcessor({
      tenantId: TENANT,
      title: "t",
      message: "m",
      recipients: [BOB],
      socketEvent: "chat:message",
    });
    expect(mockSendToUser).not.toHaveBeenCalled();
  });

  it("a job whose only recipient was terminated completes (recorded, not dead-lettered, nothing delivered)", async () => {
    bobStatus = "Absconded";
    await expect(
      runProcessor({
        tenantId: TENANT,
        title: "F&F",
        message: "settled",
        recipients: [BOB],
      }),
    ).resolves.toMatchObject({ success: true });
    expect(mockSendToUser).not.toHaveBeenCalled();
  });
});
