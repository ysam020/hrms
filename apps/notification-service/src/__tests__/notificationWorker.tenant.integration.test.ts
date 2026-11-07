/**
 * Two-tenant integration test for notification delivery.
 *
 * Real code: the notification worker, @hrms/db's tenant routing (the tenant
 * filter on master `user` queries, per-tenant databases) and @hrms/firebase's
 * push sender — over an in-memory PrismaClient. Faked: the FCM transport,
 * the WebSocket publisher, Redis and BullMQ. Every user lives in the shared
 * master users collection, exactly as in production, so these tests show
 * that one tenant's notification cannot reach another tenant's people.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);

const mockFcmSend = jest.fn().mockResolvedValue("ok");
jest.mock("../../../../packages/firebase/dist/admin", () => ({
  __esModule: true,
  getMessaging: () => ({ send: mockFcmSend }),
  getFirebaseApp: jest.fn(),
  default: {},
}));

let processor: (job: any) => Promise<any>;
// Per queue name — the worker consumes both notification queues.
const mockProcessors: Record<string, (job: any) => Promise<any>> = {};
jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((q: string, p: any) => {
    processor = p;
    mockProcessors[q] = p;
    return { on: jest.fn() };
  }),
}));

jest.mock("@hrms/queue", () => ({
  NOTIFICATION_QUEUE_NAME: "notificationQueueV2",
  LEGACY_NOTIFICATION_QUEUE_NAME: "notificationQueue",
  getBullMQConnection: jest.fn(() => ({})),
  getDeadLetterQueue: jest.fn(() => ({ add: jest.fn() })),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  requestIdStorage: { run: jest.fn((_id: string, fn: () => any) => fn()) },
}));

const mockSendToUser = jest.fn().mockResolvedValue(true);
const mockSendNotification = jest.fn().mockResolvedValue(undefined);
jest.mock("@hrms/websocket", () => ({
  getNotificationPublisher: () => ({
    sendToUser: mockSendToUser,
    sendNotification: mockSendNotification,
  }),
}));

const redis = new Map<string, string>();
jest.mock("@hrms/cache", () => ({
  getRedisClient: () => ({
    get: async (k: string) => redis.get(k) ?? null,
    set: async (k: string, v: string, ...rest: string[]) => {
      if (rest.includes("NX") && redis.has(k)) return null;
      redis.set(k, v);
      return "OK";
    },
    eval: async (_s: string, _n: number, k: string, token: string) =>
      redis.get(k) === token ? (redis.delete(k), 1) : 0,
  }),
}));

import {
  MASTER_DB,
  readTable,
  resetDatabases,
  seedDatabase,
} from "@hrms/db/testing";
import { startNotificationWorker } from "../workers/notificationWorker";

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const PLATFORM = "cccccccccccccccccccccccc";
const DB_A = "tenant_a_db";
const DB_B = "tenant_b_db";
const DB_PLATFORM = "platform_db";

const ALICE = "a00000000000000000000001"; // tenant A
const AMIR = "a00000000000000000000002"; // tenant A
const BOB = "b00000000000000000000001"; // tenant B

const token = (t: string) => [
  { token: t, deviceFingerprint: t, isActive: true },
];

function seed() {
  resetDatabases();
  redis.clear();
  seedDatabase(MASTER_DB, {
    tenant: [
      { id: TENANT_A, dbName: DB_A },
      { id: TENANT_B, dbName: DB_B },
      { id: PLATFORM, dbName: DB_PLATFORM },
    ],
    user: [
      {
        id: ALICE,
        tenantId: TENANT_A,
        username: "alice",
        fcmTokens: token("tok-alice"),
      },
      {
        id: AMIR,
        tenantId: TENANT_A,
        username: "amir",
        fcmTokens: token("tok-amir"),
      },
      {
        id: BOB,
        tenantId: TENANT_B,
        username: "bob",
        fcmTokens: token("tok-bob"),
      },
    ],
  });
}

let jobSeq = 0;
const run = (data: Record<string, unknown>) =>
  processor({ id: `job-${++jobSeq}`, data, opts: {} });

const fcmTokensSent = () => mockFcmSend.mock.calls.map(([m]) => m.token).sort();
const wsUsers = () =>
  [...new Set(mockSendToUser.mock.calls.map(([u]) => u))].sort();
const notificationRows = (db: string) => readTable(db, "notification");

describe("notification delivery across two tenants (real routing and push sender, in-memory databases)", () => {
  const ORIGINAL_PLATFORM = process.env.PLATFORM_TENANT_ID;
  beforeAll(() => {
    process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";
  });
  afterAll(() => {
    if (ORIGINAL_PLATFORM === undefined) delete process.env.PLATFORM_TENANT_ID;
    else process.env.PLATFORM_TENANT_ID = ORIGINAL_PLATFORM;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    seed();
    startNotificationWorker();
  });

  it("a recipients-only notification (performance review cycle) pushes to its recipient, not to every user on the platform", async () => {
    await run({
      tenantId: TENANT_A,
      title: "Performance Review",
      message: "You've been assigned a performance review: Q4",
      recipients: [ALICE],
    });

    expect(fcmTokensSent()).toEqual(["tok-alice"]);
    expect(wsUsers()).toEqual([ALICE]);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("a recipient id from another tenant is dropped: nothing is stored, sent or pushed for them", async () => {
    const result = await run({
      tenantId: TENANT_A,
      title: "Leave",
      message: "Approved",
      recipients: [ALICE, BOB],
    });

    expect(result.unresolvedTargets).toEqual([BOB]);
    expect(wsUsers()).toEqual([ALICE]);
    expect(fcmTokensSent()).toEqual(["tok-alice"]);
    const [row] = notificationRows(DB_A);
    expect(row.recipients.create).toEqual([
      { tenantId: TENANT_A, userId: ALICE },
    ]);
    expect(notificationRows(DB_B)).toHaveLength(0);
    expect(notificationRows(MASTER_DB)).toHaveLength(0);
  });

  it("another tenant's username resolves to nobody, so the job fails instead of broadcasting", async () => {
    await expect(
      run({
        tenantId: TENANT_A,
        title: "x",
        message: "y",
        pushTargets: ["bob"],
      }),
    ).rejects.toMatchObject({ name: "UnrecoverableError" });

    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockFcmSend).not.toHaveBeenCalled();
    expect(notificationRows(DB_A)).toHaveLength(0);
  });

  it("a legacy job passing a user id as targetUser reaches that user when they belong to the tenant", async () => {
    await run({
      tenantId: TENANT_A,
      title: "Leave",
      message: "Approved",
      targetUser: AMIR,
    });

    expect(wsUsers()).toEqual([AMIR]);
    expect(fcmTokensSent()).toEqual(["tok-amir"]);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("a legacy job passing another tenant's user id as targetUser reaches nobody", async () => {
    await expect(
      run({
        tenantId: TENANT_A,
        title: "Leave",
        message: "Approved",
        targetUser: BOB,
      }),
    ).rejects.toMatchObject({ name: "UnrecoverableError" });

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it("an explicit tenant broadcast reaches every user of that tenant and no one else", async () => {
    await run({
      tenantId: TENANT_A,
      title: "Office closed",
      message: "Friday",
      broadcast: { scope: "tenant" },
    });

    expect(wsUsers()).toEqual([ALICE, AMIR]);
    expect(fcmTokensSent()).toEqual(["tok-alice", "tok-amir"]);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("a platform broadcast requested by a customer tenant is refused and reaches no one", async () => {
    process.env.PLATFORM_TENANT_ID = PLATFORM;
    await expect(
      run({
        tenantId: TENANT_A,
        title: "x",
        message: "y",
        broadcast: { scope: "platform", authorizedBy: ALICE, reason: "test" },
      }),
    ).rejects.toThrow(/not the platform tenant/);

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockFcmSend).not.toHaveBeenCalled();
  });

  it("an authorized platform broadcast from the platform tenant reaches every tenant", async () => {
    process.env.PLATFORM_TENANT_ID = PLATFORM;
    await run({
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
    expect(fcmTokensSent()).toEqual(["tok-alice", "tok-amir", "tok-bob"]);
    expect(notificationRows(DB_PLATFORM)).toHaveLength(1);
  });

  describe("job ids across the two queues", () => {
    const { randomUUID } = jest.requireActual("crypto");
    const legacy = (job: any) => mockProcessors.notificationQueue(job);
    const current = (job: any) => mockProcessors.notificationQueueV2(job);
    const jobFor = (id: string, tenantId: string, recipient: string) => ({
      id,
      data: { tenantId, title: "t", message: "m", recipients: [recipient] },
      opts: {},
    });

    it("processes a historical job with a numeric id from the legacy queue, keyed by that id", async () => {
      await legacy(jobFor("123", TENANT_A, ALICE));
      expect(notificationRows(DB_A).map((r) => r.jobId)).toEqual(["123"]);
      expect(wsUsers()).toEqual([ALICE]);
    });

    it("processes a new job whose id is the notification UUID, keyed by that UUID", async () => {
      const id = randomUUID();
      await current(jobFor(id, TENANT_A, ALICE));
      expect(notificationRows(DB_A).map((r) => r.jobId)).toEqual([id]);
    });

    it("after a Redis counter rollback, a new job is not mistaken for an old one: UUID ids never collide with stored numeric ids", async () => {
      // A notification stored before Redis lost recent writes.
      seedDatabase(DB_A, {
        notification: [
          { id: "n-old", tenantId: TENANT_A, jobId: "7", recipients: [] },
        ],
      });
      await current(jobFor(randomUUID(), TENANT_A, ALICE));
      expect(notificationRows(DB_A)).toHaveLength(2);
      expect(fcmTokensSent()).toEqual(["tok-alice"]);

      // The residual risk, confined to the legacy queue: a reissued
      // numeric id there is (wrongly) treated as already processed.
      mockFcmSend.mockClear();
      const reissued = await legacy(jobFor("7", TENANT_A, ALICE));
      expect(reissued).toMatchObject({ deduped: true });
      expect(mockFcmSend).not.toHaveBeenCalled();
    });

    it("the same job delivered twice (replay after the notification was stored, or a duplicate UUID) creates and sends it once", async () => {
      const job = jobFor(randomUUID(), TENANT_A, ALICE);
      await current(job);
      const replayed = await current(job);

      expect(replayed).toMatchObject({ deduped: true });
      expect(notificationRows(DB_A)).toHaveLength(1);
      expect(mockFcmSend).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).toHaveBeenCalledTimes(1);
    });

    it("runs both queues side by side without crossing tenants, even when legacy and new ids interleave", async () => {
      await Promise.all([
        legacy(jobFor("1", TENANT_B, BOB)),
        current(jobFor(randomUUID(), TENANT_A, ALICE)),
        legacy(jobFor("2", TENANT_A, AMIR)),
      ]);

      expect(notificationRows(DB_B).map((r) => r.jobId)).toEqual(["1"]);
      expect(
        notificationRows(DB_A)
          .map((r) => r.jobId)
          .filter((id) => id === "2"),
      ).toEqual(["2"]);
      expect(notificationRows(DB_A)).toHaveLength(2);
      expect(fcmTokensSent()).toEqual(["tok-alice", "tok-amir", "tok-bob"]);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("a legacy job naming another tenant's user is refused, not delivered across tenants", async () => {
      await expect(legacy(jobFor("3", TENANT_A, BOB))).rejects.toMatchObject({
        name: "UnrecoverableError",
      });
      expect(fcmTokensSent()).toEqual([]);
      expect(notificationRows(DB_A)).toHaveLength(0);
    });

    it("refuses an unauthorized platform broadcast on the legacy queue too", async () => {
      delete process.env.PLATFORM_TENANT_ID;
      await expect(
        legacy({
          id: "4",
          data: {
            tenantId: TENANT_A,
            title: "t",
            message: "m",
            broadcast: { scope: "platform", authorizedBy: "x", reason: "y" },
          },
          opts: {},
        }),
      ).rejects.toMatchObject({ name: "UnrecoverableError" });
      expect(mockFcmSend).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });
});
