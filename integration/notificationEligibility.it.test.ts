/**
 * Terminated employees receive nothing, against REAL infrastructure:
 * the real BullMQ notification worker on real Redis, the real notify()
 * producer, real MongoDB (replica set) for users and the tenant's
 * notifications, and the real websocket publisher (deliveries observed on
 * the actual Redis pub/sub channel the gateway listens on). Only FCM's
 * network send is stubbed — it's Google's service.
 */
const mockFcmSend = jest.fn();
jest.mock("../packages/firebase/dist/admin", () => ({
  getMessaging: () => ({ send: (...a: unknown[]) => mockFcmSend(...a) }),
}));

import Redis from "ioredis";
import { prisma } from "@hrms/db";
import { notify } from "@hrms/notifications";
import { getNotificationQueue } from "@hrms/queue";
import type { Worker } from "bullmq";
import { startNotificationWorker } from "../apps/notification-service/src/workers/notificationWorker";

const TENANT = "6d0000000000000000000001";
const ALICE = "6e0000000000000000000001";
const BOB = "6e0000000000000000000002";
const FAKE_NODE = "it-host:424242:feedface"; // the "gateway node" whose channel we listen on
const oid = (id: string) => ({ $oid: id });

let workers: Worker[] = [];
let sub: Redis;
let redis: Redis;
const delivered: Array<{ userId: string; eventName: string }> = [];

async function seed() {
  for (const c of ["tenants", "users", "tenant_memberships"]) {
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Notify",
        slug: "it-notify",
        dbName: "hrms-it-acme",
        isActive: true,
      },
    ],
  });
  const user = (id: string, name: string) => ({
    _id: oid(id),
    username: name,
    email: `${name}@example.test`,
    tenantId: oid(TENANT),
    employeeStatus: "Active",
    isSuperUser: false,
    permissions: [],
    role: [],
    fcmTokens: [
      {
        token: `tok-${name}`,
        lastUsed: new Date().toISOString(),
        deviceFingerprint: `dev-${name}`,
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [user(ALICE, "alice"), user(BOB, "bob")],
  });
  // Both have an open socket on our fake gateway node (registry:
  // per-(tenant,user) node set + a live node + its delivery channel).
  await redis
    .pipeline()
    .sadd(`ws:v2:u:${TENANT}:${ALICE}`, FAKE_NODE)
    .sadd(`ws:v2:u:${TENANT}:${BOB}`, FAKE_NODE)
    .set(`ws:v2:alive:${FAKE_NODE}`, "1", "PX", 60_000)
    .exec();
}

/** What termination writes (handlers/employee.ts editEmployeeDetails). */
async function terminate(id: string, status = "Terminated") {
  await prisma.$runCommandRaw({
    update: "users",
    updates: [
      {
        q: { _id: oid(id) },
        u: { $set: { employeeStatus: status, fcmTokens: [] } },
      },
    ],
  });
}

const fcmTokensSent = () =>
  mockFcmSend.mock.calls.map((c) => (c[0] as { token: string }).token);
const socketsTo = (id: string) => delivered.filter((d) => d.userId === id);

async function waitForJob(id: string, timeoutMs = 15000) {
  const q = getNotificationQueue();
  const t0 = Date.now();
  for (;;) {
    const job = await q.getJob(id);
    const state = job ? await job.getState() : "missing";
    if (state === "completed" || state === "failed") return state;
    if (Date.now() - t0 > timeoutMs)
      throw new Error(`job ${id} still ${state}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  redis = new Redis(process.env.REDIS_URL!);
  sub = new Redis(process.env.REDIS_URL!);
  await sub.subscribe(`ws:v2:node:${FAKE_NODE}`);
  sub.on("message", (_ch, raw) => {
    const m = JSON.parse(raw);
    delivered.push({ userId: m.userId, eventName: m.eventName });
  });
  await getNotificationQueue()
    .obliterate({ force: true })
    .catch(() => {});
});
afterAll(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await getNotificationQueue().close();
  sub.disconnect();
  redis.disconnect();
  await prisma.$disconnect();
});
beforeEach(async () => {
  delivered.length = 0;
  mockFcmSend.mockReset().mockResolvedValue("projects/x/messages/1");
  await seed();
});

describe("Notification eligibility (real BullMQ + Redis + Mongo)", () => {
  it("both active: both get the socket notification and the push", async () => {
    if (workers.length === 0) workers = startNotificationWorker();
    const { jobIds } = await notify({
      tenantId: TENANT,
      event: "general" as any,
      recipients: [ALICE, BOB],
      inApp: {
        title: "Chat",
        message: "hello from chat",
        socketEvent: "chat:message",
      },
    });
    expect(await waitForJob(jobIds.inApp!)).toBe("completed");
    await new Promise((r) => setTimeout(r, 200));
    expect(socketsTo(ALICE).length).toBeGreaterThan(0);
    expect(socketsTo(BOB).length).toBeGreaterThan(0);
    expect(fcmTokensSent().sort()).toEqual(["tok-alice", "tok-bob"]);
  });

  it("terminated WHILE the job was queued: nothing reaches Bob (socket or push); Alice unaffected", async () => {
    await Promise.all(workers.map((w) => w.pause()));
    const { jobIds } = await notify({
      tenantId: TENANT,
      event: "general" as any,
      recipients: [ALICE, BOB],
      inApp: {
        title: "Chat",
        message: "secret preview",
        socketEvent: "chat:message",
      },
    });
    await terminate(BOB); // queued, not yet processed
    workers.forEach((w) => w.resume());
    expect(await waitForJob(jobIds.inApp!)).toBe("completed");
    await new Promise((r) => setTimeout(r, 200));
    expect(socketsTo(BOB)).toHaveLength(0);
    expect(fcmTokensSent()).toEqual(["tok-alice"]);
    expect(socketsTo(ALICE).length).toBeGreaterThan(0);
  });

  it("Resigned via the scheduler path (status only, tokens NOT cleared): still no push — send-time check", async () => {
    await prisma.$runCommandRaw({
      update: "users",
      updates: [
        { q: { _id: oid(BOB) }, u: { $set: { employeeStatus: "Resigned" } } },
      ],
    });
    const { jobIds } = await notify({
      tenantId: TENANT,
      event: "general" as any,
      recipients: [BOB],
      inApp: { title: "Payslip", message: "ready" },
    });
    expect(await waitForJob(jobIds.inApp!)).toBe("completed"); // recorded, not dead-lettered
    await new Promise((r) => setTimeout(r, 200));
    expect(fcmTokensSent()).toEqual([]);
    expect(socketsTo(BOB)).toHaveLength(0);
  });

  it("terminated DURING the FCM send: the token sync does not put Bob's tokens back", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFcmSend.mockImplementation(async ({ token }: { token: string }) => {
      if (token === "tok-bob") {
        await terminate(BOB); // termination lands mid-delivery
        release();
      }
      await gate;
      return "ok";
    });
    const { jobIds } = await notify({
      tenantId: TENANT,
      event: "general" as any,
      recipients: [BOB],
      inApp: { title: "t", message: "m" },
    });
    expect(await waitForJob(jobIds.inApp!)).toBe("completed");
    const rows = (await prisma.$runCommandRaw({
      find: "users",
      filter: { _id: oid(BOB) },
    })) as any;
    const doc = rows.cursor.firstBatch[0];
    expect(doc.employeeStatus).toBe("Terminated");
    expect(doc.fcmTokens).toEqual([]); // pre-fix: the read-modify-write restored ["tok-bob"]
  });
});
