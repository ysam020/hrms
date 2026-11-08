/**
 * Multi-socket delivery and immediate termination, on the
 * isolated stack: real Redis, real MongoDB (rs), TWO gateway processes
 * (helpers/gatewayProcess.ts = production wiring: registry, delivery-time
 * authorisation, revocation listener, real chatSocket), real socket.io
 * clients. Production defaults for the account cache (30 s) and socket
 * re-validation (60 s) — so nothing here can pass by waiting for the
 * periodic check. Registry timings are shortened (node TTL 1.5 s) only to
 * make crash cleanup observable quickly.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma, getClientForDb } from "@hrms/db";
import { publishAccountRevocation } from "@hrms/cache";
import { RedisNotificationPublisher } from "../packages/websocket/src/RedisNotificationPublisher";
import { pause, unpause } from "./helpers/docker";

const A = 47501;
const B = 47502;
const T1 = "7f1000000000000000000001";
const T2 = "7f1000000000000000000002";
const DB1 = "hrms-it-acme";
const DB2 = "hrms-it-beta";
const U = {
  alice: "7f2000000000000000000001", // multi-device; member of T1 and T2
  bob: "7f2000000000000000000002",
  carol: "7f2000000000000000000003", // terminated via the application
  dave: "7f2000000000000000000004", // terminated by a direct DB edit
  erin: "7f2000000000000000000005", // membership removed by a DB edit
  frank: "7f2000000000000000000006", // terminated while a message is queued
  gina: "7f2000000000000000000007", // chat sender, terminated by DB edit
  hank: "7f2000000000000000000008", // terminated mid-broadcast
  ivan: "7f2000000000000000000009", // typing after a DB-edit termination
  judy: "7f200000000000000000000a", // presence watcher, DB-edit termination
};
const ROOM = "7f3000000000000000000001";
const oid = (id: string) => ({ $oid: id });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const procs: Record<number, ChildProcess | undefined> = {};
const results: Record<string, unknown> = {};
let redis: Redis;

const GW_ENV = {
  ACCOUNT_ACCESS_TTL_MS: "30000", // production default
  SOCKET_REVALIDATE_MS: "60000", // production default
  WS_NODE_TTL_MS: "1500",
  WS_HEARTBEAT_MS: "500",
  WS_SWEEP_MS: "1000",
  LOG_LEVEL: "error",
};

function startGateway(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["--import", "tsx", "integration/helpers/gatewayProcess.ts"],
      {
        env: { ...process.env, ...GW_ENV, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const t = setTimeout(
      () => reject(new Error(`gateway ${port} did not start`)),
      90_000,
    );
    child.stdout!.on("data", (b) => {
      if (String(b).includes(`READY ${port}`)) {
        clearTimeout(t);
        procs[port] = child;
        resolve(child);
      }
    });
  });
}
const kill = (port: number) =>
  new Promise<void>((r) => {
    const c = procs[port];
    if (!c || c.exitCode != null) return r();
    c.once("exit", () => r());
    c.kill("SIGKILL");
    procs[port] = undefined;
  });

const token = (userId: string, tenantId = T1, dbName = DB1) =>
  jwt.sign(
    { userId, tenantId, tenantRole: "employee", dbName },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: "1h" },
  );

type Client = Socket & {
  pings: Array<{ seq: unknown; from: unknown }>;
  chats: unknown[];
  expiredAt: number | null;
};
function connect(
  port: number,
  tok: string | (() => string),
  opts: { reconnection?: boolean; query?: Record<string, string> } = {},
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s = ioClient(`http://127.0.0.1:${port}`, {
      auth: (cb) => cb({ token: typeof tok === "function" ? tok() : tok }),
      transports: ["websocket"],
      reconnection: opts.reconnection ?? false,
      reconnectionDelay: 200,
      reconnectionDelayMax: 1000,
      forceNew: true,
      query: opts.query,
    }) as Client;
    s.pings = [];
    s.chats = [];
    s.expiredAt = null;
    s.on("it:ping", (p: any) => s.pings.push({ seq: p.seq, from: p.from }));
    s.on("chat:message", (m: unknown) => s.chats.push(m));
    s.on("session-expired", () => (s.expiredAt = Date.now()));
    s.once("connect", () => resolve(s));
    s.once("connect_error", (e) => reject(e));
  });
}
const push = async (
  port: number,
  userId: string,
  tenant: string | null,
  seq?: unknown,
) =>
  (
    await (
      await fetch(
        `http://127.0.0.1:${port}/push/${userId}?${tenant ? `tenant=${tenant}&` : ""}seq=${seq ?? ""}`,
        { method: "POST" },
      )
    ).json()
  ).ok as boolean;
const nodeId = async (port: number) =>
  (await (await fetch(`http://127.0.0.1:${port}/node`)).json())
    .nodeId as string;
const members = (tenant: string, userId: string) =>
  redis.smembers(`ws:v2:u:${tenant}:${userId}`);
const setStatus = (userId: string, employeeStatus: string) =>
  prisma.$runCommandRaw({
    update: "users",
    updates: [{ q: { _id: oid(userId) }, u: { $set: { employeeStatus } } }],
  });
const until = async (cond: () => boolean | Promise<boolean>, ms = 10_000) => {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await sleep(25);
  }
};
const closeAll = (...ss: Socket[]) => ss.forEach((s) => s.close());

beforeAll(async () => {
  redis = new Redis(process.env.REDIS_URL!);
  for (const k of await redis.keys("ws:v2:*")) await redis.del(k);
  for (const c of ["tenants", "users", "tenant_memberships"])
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(T1),
        name: "IT One",
        slug: "it-one",
        dbName: DB1,
        isActive: true,
      },
      {
        _id: oid(T2),
        name: "IT Two",
        slug: "it-two",
        dbName: DB2,
        isActive: true,
      },
    ],
  });
  const ids = Object.values(U);
  await prisma.$runCommandRaw({
    insert: "users",
    documents: ids.map((id, i) => ({
      _id: oid(id),
      username: `p5u${i}`,
      email: `p5u${i}@example.test`,
      tenantId: oid(T1),
      employeeStatus: "Active",
      isSuperUser: false,
      permissions: [],
      role: [],
    })),
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: [
      ...ids.map((id, i) => ({
        _id: oid(`7f40000000000000000000${String(i + 1).padStart(2, "0")}`),
        tenantId: oid(T1),
        userId: oid(id),
        role: "employee",
      })),
      {
        _id: oid("7f4000000000000000000099"),
        tenantId: oid(T2),
        userId: oid(U.alice),
        role: "employee",
      },
    ],
  });
  await startGateway(A);
  await startGateway(B);
}, 200_000);

afterAll(async () => {
  writeFileSync(
    process.env.SOCKET_RESULTS_FILE || "/dev/null",
    JSON.stringify(results, null, 2),
  );
  await Promise.all([A, B].map(kill));
  unpause("praesto-it-redis");
  redis.disconnect();
  await prisma.$disconnect();
});

describe("multi-socket delivery", () => {
  it("three sockets of one user on two processes each receive every message exactly once", async () => {
    const a1 = await connect(A, token(U.alice));
    const a2 = await connect(A, token(U.alice));
    const b1 = await connect(B, token(U.alice));
    await sleep(200);
    expect((await members(T1, U.alice)).sort()).toEqual(
      [await nodeId(A), await nodeId(B)].sort(),
    );
    expect(await push(A, U.alice, T1, "x1")).toBe(true);
    expect(await push(B, U.alice, T1, "x2")).toBe(true);
    await sleep(300);
    for (const s of [a1, a2, b1])
      expect(s.pings.map((p) => p.seq)).toEqual(["x1", "x2"]);
    closeAll(a1, a2, b1);
  });

  it("disconnecting one socket does not silence the others; the process deregisters only with its last socket", async () => {
    const a1 = await connect(A, token(U.alice));
    const a2 = await connect(A, token(U.alice));
    const b1 = await connect(B, token(U.alice));
    await sleep(200);
    a1.close(); // the OLDER tab on A closes (previously this silenced the other tab)
    await sleep(200);
    expect(await members(T1, U.alice)).toHaveLength(2);
    await push(B, U.alice, T1, "after-close");
    await sleep(300);
    expect(a2.pings.map((p) => p.seq)).toEqual(["after-close"]);
    expect(b1.pings.map((p) => p.seq)).toEqual(["after-close"]);
    a2.close();
    await sleep(300);
    expect(await members(T1, U.alice)).toEqual([await nodeId(B)]);
    await push(A, U.alice, T1, "only-b");
    await sleep(300);
    expect(b1.pings.map((p) => p.seq)).toEqual(["after-close", "only-b"]);
    closeAll(b1);
    await sleep(300);
    expect(await members(T1, U.alice)).toEqual([]);
    expect(await push(A, U.alice, T1, "offline")).toBe(false);
  });

  it("concurrent delivery: 200 messages from both processes, no loss and no duplicates on any of 3 sockets", async () => {
    const socks = [
      await connect(A, token(U.alice)),
      await connect(A, token(U.alice)),
      await connect(B, token(U.alice)),
    ];
    await sleep(200);
    const seqs = Array.from({ length: 200 }, (_, i) => i);
    await Promise.all(seqs.map((i) => push(i % 2 ? A : B, U.alice, T1, i)));
    await sleep(800);
    for (const s of socks) {
      const got = s.pings.map((p) => Number(p.seq)).sort((x, y) => x - y);
      expect(got).toEqual(seqs);
    }
    results.concurrent = {
      sockets: 3,
      messages: 200,
      perSocket: socks.map((s) => s.pings.length),
    };
    closeAll(...socks);
  });

  it("tenant isolation: a person's sockets in another organisation never receive this organisation's events", async () => {
    const inT1 = await connect(A, token(U.alice, T1, DB1));
    const inT2 = await connect(B, token(U.alice, T2, DB2));
    await sleep(200);
    await push(A, U.alice, T1, "t1");
    await push(A, U.alice, T2, "t2");
    expect(await push(A, U.alice, null, "no-tenant")).toBe(false);
    await sleep(300);
    expect(inT1.pings.map((p) => p.seq)).toEqual(["t1"]);
    expect(inT2.pings.map((p) => p.seq)).toEqual(["t2"]);
    closeAll(inT1, inT2);
  });

  it("reconnect with a refreshed token: the socket is re-registered and keeps receiving", async () => {
    let current = token(U.bob);
    const s = await connect(A, () => current, { reconnection: false });
    s.disconnect();
    current = token(U.bob); // what the HTTP refresh stores
    s.connect();
    await until(() => s.connected);
    await sleep(200);
    await push(B, U.bob, T1, "post-refresh");
    await sleep(300);
    expect(s.pings.map((p) => p.seq)).toEqual(["post-refresh"]);
    closeAll(s);
  });
});

describe("failures", () => {
  it("gateway crash + restart: clients reconnect, stale registration is swept, no duplicates", async () => {
    const onA = await connect(A, token(U.alice), { reconnection: true });
    const onB = await connect(B, token(U.alice));
    await sleep(200);
    const deadNode = await nodeId(A);
    await kill(A);
    await sleep(300);
    // Survivor still delivers to the socket on B; the dead node is skipped.
    expect(await push(B, U.alice, T1, "during-outage")).toBe(true);
    const t0 = Date.now();
    await startGateway(A);
    await until(() => onA.connected, 20_000);
    const reconnectMs = Date.now() - t0;
    await until(
      async () => !(await members(T1, U.alice)).includes(deadNode),
      10_000,
    );
    const sweptMs = Date.now() - t0;
    await sleep(200);
    await push(B, U.alice, T1, "after-restart");
    await sleep(300);
    expect(onA.pings.map((p) => p.seq)).toEqual(["after-restart"]);
    expect(onB.pings.map((p) => p.seq)).toEqual([
      "during-outage",
      "after-restart",
    ]);
    expect(await members(T1, U.alice)).toHaveLength(2);
    results.gatewayRestart = {
      reconnectMsAfterRestartIssued: reconnectMs,
      staleSweptMs: sweptMs,
    };
    closeAll(onA, onB);
  }, 60_000);

  it("Redis outage: sockets stay connected, same-process delivery continues, cross-process resumes after recovery", async () => {
    const a = await connect(A, token(U.bob));
    const b = await connect(B, token(U.bob));
    await sleep(300);
    pause("praesto-it-redis");
    try {
      const pending = push(A, U.bob, T1, "during-redis-outage"); // local leg first
      await sleep(500);
      expect(a.pings.map((p) => p.seq)).toEqual(["during-redis-outage"]);
      expect(a.connected && b.connected).toBe(true);
      await sleep(2000);
      unpause("praesto-it-redis");
      await pending;
    } finally {
      unpause("praesto-it-redis");
    }
    await sleep(1500); // heartbeat + resync
    await push(A, U.bob, T1, "after-redis");
    await sleep(400);
    expect(b.pings.map((p) => p.seq)).toContain("after-redis");
    expect(a.pings.map((p) => p.seq)).toEqual([
      "during-redis-outage",
      "after-redis",
    ]);
    closeAll(a, b);
  }, 30_000);
});

describe("termination enforcement (no reliance on the 60 s re-validation)", () => {
  it("application termination closes every socket on every process within the revocation latency; others unaffected", async () => {
    const c1 = await connect(A, token(U.carol));
    const c2 = await connect(B, token(U.carol));
    const bob = await connect(B, token(U.bob));
    await sleep(200);
    await setStatus(U.carol, "Terminated");
    const t0 = Date.now();
    await publishAccountRevocation({
      userId: U.carol,
      reason: "test-termination",
    });
    await until(() => c1.expiredAt != null && c2.expiredAt != null, 5000);
    const latency = Math.max(c1.expiredAt!, c2.expiredAt!) - t0;
    expect(await push(A, U.carol, T1, "after-termination")).toBe(false);
    await push(A, U.bob, T1, "bob-still");
    await sleep(300);
    expect(c1.pings).toHaveLength(0);
    expect(c2.pings).toHaveLength(0);
    expect(bob.pings.map((p) => p.seq)).toEqual(["bob-still"]);
    await expect(connect(A, token(U.carol))).rejects.toMatchObject({
      data: { code: "AUTH_REJECTED" },
    });
    results.appTermination = { socketsClosedMs: latency };
    expect(latency).toBeLessThan(1000);
    closeAll(c1, c2, bob);
  });

  it("direct DB termination (no revocation message): targeted delivery stops within the delivery bound (5 s), not 90 s", async () => {
    const d = await connect(A, token(U.dave));
    const bob = await connect(B, token(U.bob));
    await sleep(200);
    await push(B, U.dave, T1, "warm"); // cache the 'allowed' decision
    await setStatus(U.dave, "Terminated");
    const t0 = Date.now();
    let lastReceivedAt = 0;
    d.on("it:ping", () => (lastReceivedAt = Date.now()));
    for (let i = 0; i < 40; i++) {
      await push(B, U.dave, T1, `d${i}`);
      await push(A, U.bob, T1, `b${i}`);
      await sleep(200);
    }
    const boundaryMs = lastReceivedAt ? lastReceivedAt - t0 : 0;
    expect(boundaryMs).toBeLessThanOrEqual(5500);
    expect(d.expiredAt).not.toBeNull(); // denied at delivery ⇒ socket closed
    expect(bob.pings).toHaveLength(40);
    results.dbTermination = {
      lastDeliveryAfterEditMs: boundaryMs,
      socketClosedMs: d.expiredAt! - t0,
    };
    closeAll(d, bob);
  }, 30_000);

  it("membership removal (direct DB edit): delivery stops within the same bound", async () => {
    const e = await connect(A, token(U.erin));
    await sleep(200);
    await push(A, U.erin, T1, "warm");
    await prisma.$runCommandRaw({
      delete: "tenant_memberships",
      deletes: [{ q: { userId: oid(U.erin), tenantId: oid(T1) }, limit: 0 }],
    });
    const t0 = Date.now();
    let last = 0;
    e.on("it:ping", () => (last = Date.now()));
    for (let i = 0; i < 35; i++) {
      await push(B, U.erin, T1, `e${i}`);
      await sleep(200);
    }
    expect(last ? last - t0 : 0).toBeLessThanOrEqual(5500);
    expect(e.expiredAt).not.toBeNull();
    results.membershipRemoval = {
      lastDeliveryAfterEditMs: last ? last - t0 : 0,
    };
    closeAll(e);
  }, 30_000);

  it("termination while a message is queued: the notification-service publisher delivers nothing afterwards", async () => {
    const f = await connect(A, token(U.frank));
    await sleep(200);
    const publisher = new RedisNotificationPublisher();
    expect(
      await publisher.sendToUser(
        U.frank,
        "it:ping",
        { seq: "queued-before" },
        { tenantId: T1 },
      ),
    ).toBe(true);
    // The job is "in the queue" while the termination lands (app path):
    await setStatus(U.frank, "Terminated");
    await publishAccountRevocation({ userId: U.frank, reason: "test-queued" });
    await until(() => f.expiredAt != null, 5000);
    // …then the worker processes it.
    expect(
      await publisher.sendToUser(
        U.frank,
        "it:ping",
        { seq: "queued-after" },
        { tenantId: T1 },
      ),
    ).toBe(false);
    await sleep(300);
    expect(f.pings.map((p) => p.seq)).toEqual(["queued-before"]);
    closeAll(f);
  });

  it("termination during a broadcast stream: nothing reaches the terminated person after revocation; others get everything", async () => {
    const h = await connect(A, token(U.hank));
    const bob = await connect(B, token(U.bob));
    await sleep(200);
    let revokedAt = 0;
    let receivedAfterRevocation = 0;
    h.on(
      "it:ping",
      () => revokedAt && Date.now() > revokedAt && receivedAfterRevocation++,
    );
    const stream = (async () => {
      for (let i = 0; i < 100; i++) {
        await Promise.all([push(B, U.hank, T1, i), push(A, U.bob, T1, i)]);
        await sleep(10);
      }
    })();
    await sleep(400);
    await setStatus(U.hank, "Terminated");
    await publishAccountRevocation({
      userId: U.hank,
      reason: "test-mid-broadcast",
    });
    await until(() => h.expiredAt != null, 5000);
    revokedAt = h.expiredAt!;
    await stream;
    await sleep(300);
    expect(receivedAfterRevocation).toBe(0);
    expect(bob.pings).toHaveLength(100);
    results.midBroadcast = {
      hankReceivedBeforeRevocation: h.pings.length,
      bobReceived: bob.pings.length,
    };
    closeAll(h, bob);
  }, 30_000);
});

describe("sensitive socket operations (real chatSocket)", () => {
  beforeAll(async () => {
    const tenantDb = getClientForDb(DB1) as any;
    await tenantDb
      .$runCommandRaw({ delete: "chatrooms", deletes: [{ q: {}, limit: 0 }] })
      .catch(() => undefined);
    await tenantDb
      .$runCommandRaw({ delete: "messages", deletes: [{ q: {}, limit: 0 }] })
      .catch(() => undefined);
    await tenantDb.chatRoom.create({
      data: {
        id: ROOM,
        tenantId: T1,
        participants: [U.bob, U.gina, U.ivan],
        type: "direct",
      } as any,
    });
    (global as any).__tenantDb = tenantDb;
  });

  it("a chat message reaches every one of the recipient's devices exactly once", async () => {
    const bobA = await connect(A, token(U.bob));
    const bobB = await connect(B, token(U.bob));
    const gina = await connect(A, token(U.gina));
    await sleep(200);
    gina.emit("chat:send", { roomId: ROOM, content: "hello" });
    await until(() => bobA.chats.length === 1 && bobB.chats.length === 1, 5000);
    await sleep(300);
    expect(bobA.chats).toHaveLength(1);
    expect(bobB.chats).toHaveLength(1);
    expect(gina.chats).toHaveLength(1); // sender's own echo, once
    closeAll(bobA, bobB, gina);
  });

  it("a terminated sender's chat:send is refused on the very next attempt (fresh check), even with a warm cache", async () => {
    const bob = await connect(B, token(U.bob));
    const gina = await connect(A, token(U.gina));
    await sleep(200);
    gina.emit("chat:typing", { roomId: ROOM }); // warms the cached decision
    await sleep(200);
    await setStatus(U.gina, "Terminated"); // direct edit, no revocation message
    gina.emit("chat:send", { roomId: ROOM, content: "after termination" });
    await sleep(1000);
    expect(bob.chats).toHaveLength(0);
    expect(gina.expiredAt).not.toBeNull();
    const stored = await (global as any).__tenantDb.message.count({
      where: { chatRoomId: ROOM, content: "after termination" },
    });
    expect(stored).toBe(0);
    closeAll(bob, gina);
  });

  it("typing indicators from a person terminated by a direct DB edit stop within the 5 s bound", async () => {
    const bob = await connect(B, token(U.bob));
    const ivan = await connect(A, token(U.ivan));
    let lastTypingAt = 0;
    bob.on("chat:typing", () => (lastTypingAt = Date.now()));
    await sleep(200);
    ivan.emit("chat:typing", { roomId: ROOM });
    await until(() => lastTypingAt > 0, 5000); // reaches the colleague while employed
    await setStatus(U.ivan, "Terminated"); // no revocation message
    const t0 = Date.now();
    for (let i = 0; i < 40 && ivan.connected; i++) {
      ivan.emit("chat:typing", { roomId: ROOM });
      await sleep(200);
    }
    const afterMs = lastTypingAt > t0 ? lastTypingAt - t0 : 0;
    expect(afterMs).toBeLessThanOrEqual(5500);
    expect(ivan.expiredAt).not.toBeNull();
    results.typingAfterDbTermination = {
      lastTypingSeenMs: afterMs,
      socketClosedMs: ivan.expiredAt! - t0,
    };
    closeAll(bob, ivan);
  }, 30_000);

  it("presence updates stop reaching a watcher terminated by a direct DB edit within the 5 s bound; other watchers continue", async () => {
    const room = `px:${T1}:${U.bob}`;
    const judy = await connect(A, token(U.judy), { query: { itJoin: room } });
    const alice = await connect(A, token(U.alice), { query: { itJoin: room } });
    const seen = { judy: 0, alice: 0, judyLastAt: 0 };
    judy.on("presence:update", () => {
      seen.judy++;
      seen.judyLastAt = Date.now();
    });
    alice.on("presence:update", () => seen.alice++);
    await sleep(200);
    const emit = async (i: number) =>
      (
        await fetch(
          `http://127.0.0.1:${A}/room-emit?room=${encodeURIComponent(room)}&seq=${i}`,
          { method: "POST" },
        )
      ).json();
    await emit(0);
    await sleep(200);
    expect(seen.judy).toBe(1);
    await setStatus(U.judy, "Terminated");
    const t0 = Date.now();
    for (let i = 1; i <= 35; i++) {
      await emit(i);
      await sleep(200);
    }
    const afterMs = seen.judyLastAt > t0 ? seen.judyLastAt - t0 : 0;
    expect(afterMs).toBeLessThanOrEqual(5500);
    expect(judy.expiredAt).not.toBeNull();
    expect(seen.alice).toBe(36);
    results.presenceAfterDbTermination = {
      lastUpdateSeenMs: afterMs,
      otherWatcherReceived: seen.alice,
    };
    closeAll(judy, alice);
  }, 30_000);

  it("a socket of another organisation cannot join or read this organisation's room", async () => {
    const aliceT2 = await connect(B, token(U.alice, T2, DB2));
    const errors: unknown[] = [];
    aliceT2.on("chat:error", (e) => errors.push(e));
    aliceT2.emit("chat:send", { roomId: ROOM, content: "cross-tenant" });
    aliceT2.emit("chat:read", { roomId: ROOM });
    await sleep(800);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const stored = await (global as any).__tenantDb.message.count({
      where: { content: "cross-tenant" },
    });
    expect(stored).toBe(0);
    closeAll(aliceT2);
  });
});
