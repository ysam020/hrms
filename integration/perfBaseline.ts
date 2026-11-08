/**
 * Performance baseline on the ISOLATED stack (127.0.0.1 containers
 * from integration/up.sh; never production). Not a load test of any shared
 * system: one laptop, local Docker, so absolute numbers are a lower bound on
 * latency and only the relative shape (cold vs warm, hit ratio, memory per
 * entry, reconnect spread) transfers.
 *
 *   node -r ./integration/setupEnv.cjs node_modules/.bin/tsx integration/perfBaseline.ts
 *   (or: npx tsx --require ./integration/setupEnv.cjs integration/perfBaseline.ts)
 *
 * Writes JSON to PERF_RESULTS_FILE.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "../packages/database/dist/index";

const TENANT = "7a1000000000000000000001";
const N_USERS = 50_000;
const uid = (i: number) => (0x7b0000000000 + i).toString(16).padStart(24, "0");
const mid = (i: number) => (0x7c0000000000 + i).toString(16).padStart(24, "0");
const oid = (id: string) => ({ $oid: id });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const procs: ChildProcess[] = [];

function startGateway(
  port: number,
  env: Record<string, string>,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      [
        "--expose-gc",
        "--import",
        "tsx",
        "integration/helpers/gatewayProcess.ts",
      ],
      {
        env: { ...process.env, PORT: String(port), LOG_LEVEL: "error", ...env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const t = setTimeout(
      () => reject(new Error(`gateway ${port} did not start`)),
      90_000,
    );
    child.stdout!.on(
      "data",
      (b) =>
        String(b).includes(`READY ${port}`) &&
        (clearTimeout(t), resolve(child)),
    );
    child.stderr!.on(
      "data",
      (b) => process.env.PERF_DEBUG && process.stderr.write(b),
    );
    procs.push(child);
  });
}
const stop = (c: ChildProcess) =>
  new Promise<void>((r) => (c.once("exit", () => r()), c.kill("SIGKILL")));

const tokens = new Map<number, string>();
const token = (i: number) => {
  let t = tokens.get(i);
  if (!t) {
    t = jwt.sign(
      {
        userId: uid(i),
        tenantId: TENANT,
        tenantRole: "employee",
        dbName: "hrms-it-acme",
      },
      process.env.ACCESS_JWT_TOKEN!,
      { algorithm: "HS256", expiresIn: "2h" },
    );
    tokens.set(i, t);
  }
  return t;
};

function pct(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) =>
    +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2);
  return {
    n: s.length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: +s[s.length - 1].toFixed(2),
  };
}

/** `count` GET /me requests over users [from, from+count) at `concurrency`. */
async function run(
  port: number,
  from: number,
  count: number,
  concurrency: number,
) {
  const lat: number[] = [];
  const codes: Record<number, number> = {};
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count) {
        const i = from + next++;
        const s = performance.now();
        const r = await fetch(`http://127.0.0.1:${port}/me`, {
          headers: { authorization: `Bearer ${token(i)}` },
        });
        await r.arrayBuffer();
        lat.push(performance.now() - s);
        codes[r.status] = (codes[r.status] ?? 0) + 1;
      }
    }),
  );
  const secs = (performance.now() - t0) / 1000;
  return { ...pct(lat), rps: Math.round(count / secs), codes };
}

async function metric(port: number, name: string) {
  const txt = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
  return txt.split("\n").filter((l) => l.startsWith(name));
}
const mem = async (port: number) =>
  (await fetch(`http://127.0.0.1:${port}/mem`)).json();

async function mongoConnections() {
  const r: any = await prisma.$runCommandRaw({ serverStatus: 1 });
  return {
    current: r.connections.current,
    available: r.connections.available,
    totalCreated: r.connections.totalCreated,
    active: r.connections.active,
  };
}

async function seed() {
  for (const c of ["tenants", "users", "tenant_memberships"])
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Perf",
        slug: "it-perf",
        dbName: "hrms-it-acme",
        isActive: true,
      },
    ],
  });
  for (let b = 0; b < N_USERS; b += 2000) {
    const idx = Array.from(
      { length: Math.min(2000, N_USERS - b) },
      (_, k) => b + k,
    );
    await prisma.$runCommandRaw({
      insert: "users",
      ordered: false,
      documents: idx.map((i) => ({
        _id: oid(uid(i)),
        username: `perf${i}`,
        email: `perf${i}@example.test`,
        tenantId: oid(TENANT),
        employeeStatus: "Active",
        isSuperUser: false,
        permissions: [],
        role: [],
      })),
    });
    await prisma.$runCommandRaw({
      insert: "tenant_memberships",
      ordered: false,
      documents: idx.map((i) => ({
        _id: oid(mid(i)),
        tenantId: oid(TENANT),
        userId: oid(uid(i)),
        role: "employee",
      })),
    });
  }
}

async function redisLatency() {
  const r = new Redis(process.env.REDIS_URL!);
  const ping: number[] = [],
    setget: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let s = performance.now();
    await r.ping();
    ping.push(performance.now() - s);
    s = performance.now();
    await r.set(`perf:${i}`, "x", "EX", 60);
    await r.get(`perf:${i}`);
    setget.push(performance.now() - s);
  }
  const info = await r.info("memory");
  await r.quit();
  return {
    ping: pct(ping),
    setThenGet: pct(setget),
    evictionPolicy: /maxmemory_policy:(\S+)/.exec(info)?.[1],
  };
}

async function mongoLatency() {
  const ping: number[] = [],
    lookup: number[] = [];
  for (let i = 0; i < 1000; i++) {
    let s = performance.now();
    await prisma.$runCommandRaw({ ping: 1 });
    ping.push(performance.now() - s);
    s = performance.now();
    await prisma.user.findUnique({
      where: { id: uid(i * 37) },
      select: { employeeStatus: true },
    });
    lookup.push(performance.now() - s);
  }
  return { ping: pct(ping), userByIdLookup: pct(lookup) };
}

async function socketReconnect(port: number, n: number) {
  let gw = await startGateway(port, { SOCKET_REVALIDATE_MS: "60000" });
  const sockets: Socket[] = [];
  for (let i = 0; i < n; i++) {
    // Same options as SocketContext (socket.io's own reconnection handles a
    // server restart; base 1 s, cap 30 s, default randomisation 0.5).
    const s = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token: token(40_000 + i) },
      transports: ["websocket"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      forceNew: true,
    });
    await new Promise((r) => s.once("connect", r));
    sockets.push(s);
  }
  await stop(gw);
  const down = Date.now();
  await sleep(3000); // a short outage: clients back off meanwhile
  const back: number[] = [];
  const done = Promise.all(
    sockets.map(
      (s) =>
        new Promise<void>((r) =>
          s.io.once("reconnect", () => (back.push(Date.now() - down), r())),
        ),
    ),
  );
  const restartAt = Date.now() - down;
  gw = await startGateway(port, { SOCKET_REVALIDATE_MS: "60000" });
  const ready = Date.now() - down;
  await Promise.race([done, sleep(90_000)]);
  sockets.forEach((s) => s.close());
  await stop(gw);
  const perSecond: Record<number, number> = {};
  for (const t of back)
    perSecond[Math.floor(t / 1000)] =
      (perSecond[Math.floor(t / 1000)] ?? 0) + 1;
  return {
    clients: n,
    reconnected: back.length,
    restartIssuedAtMs: restartAt,
    gatewayReadyAtMs: ready,
    msAfterKill: pct(back),
    reconnectsPerSecond: perSecond,
  };
}

async function main() {
  const out: any = {
    env: {
      node: process.version,
      users: N_USERS,
      mongo: "mongo:7 rs0 (docker, local)",
      redis: "redis:7-alpine (docker, local)",
    },
  };
  console.log("seeding", N_USERS, "synthetic users");
  await seed();
  out.mongoLatency = await mongoLatency();
  out.redisLatency = await redisLatency();
  out.mongoConnectionsIdle = await mongoConnections();

  // ── API latency, production defaults (TTL 30 s, bound 50k) ──
  const A = 47201;
  let gw = await startGateway(A, {});
  await run(A, 0, 200, 10); // JIT warm-up (users 0..199)
  const conns: any[] = [];
  const poll = setInterval(
    async () => conns.push(await mongoConnections().catch(() => null)),
    500,
  );
  out.apiCold = await run(A, 1000, 5000, 50); // every request a cache miss → Mongo
  out.apiWarm = await run(A, 1000, 5000, 50); // same users within TTL → cache hits
  out.apiMixed = await run(A, 3000, 5000, 50); // 3000-5999 warm, 6000-7999 cold → ~60% hit
  clearInterval(poll);
  out.mongoConnectionsUnderLoad = conns.filter(Boolean).reduce(
    (m, c) => ({
      maxCurrent: Math.max(m.maxCurrent, c.current),
      maxActive: Math.max(m.maxActive, c.active),
      samples: m.samples + 1,
    }),
    { maxCurrent: 0, maxActive: 0, samples: 0 },
  );
  out.accountChecks = await metric(A, "account_access_checks_total");
  out.accountCheckDurationSum = await metric(
    A,
    "account_access_check_duration_ms",
  );
  await stop(gw);

  // ── Memory at 5k / 10k / 50k cached decisions (long TTL so nothing expires mid-fill) ──
  gw = await startGateway(A, { ACCOUNT_ACCESS_TTL_MS: "3600000" });
  const base = await mem(A);
  out.memory = [
    {
      entries: base.cachedDecisions,
      heapUsedMB: +(base.heapUsed / 1048576).toFixed(1),
      rssMB: +(base.rss / 1048576).toFixed(1),
    },
  ];
  let filled = 0;
  for (const target of [5_000, 10_000, 50_000]) {
    await run(A, filled, target - filled, 50);
    filled = target;
    const m = await mem(A);
    out.memory.push({
      entries: m.cachedDecisions,
      heapUsedMB: +(m.heapUsed / 1048576).toFixed(1),
      rssMB: +(m.rss / 1048576).toFixed(1),
      bytesPerEntryVsBase: Math.round(
        (m.heapUsed - base.heapUsed) / m.cachedDecisions,
      ),
    });
  }
  // Eviction: 5k more distinct users beyond the 50k bound.
  const before = (await mem(A)).cachedDecisions;
  await prisma.$runCommandRaw({
    insert: "users",
    ordered: false,
    documents: Array.from({ length: 5000 }, (_, k) => ({
      _id: oid(uid(N_USERS + k)),
      username: `perfx${k}`,
      email: `perfx${k}@example.test`,
      tenantId: oid(TENANT),
      employeeStatus: "Active",
      isSuperUser: false,
      permissions: [],
      role: [],
    })),
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    ordered: false,
    documents: Array.from({ length: 5000 }, (_, k) => ({
      _id: oid(mid(N_USERS + k)),
      tenantId: oid(TENANT),
      userId: oid(uid(N_USERS + k)),
      role: "employee",
    })),
  });
  await run(A, N_USERS, 5000, 50);
  const evicted = await run(A, 0, 1000, 50); // the oldest 1000 were evicted → misses again
  out.eviction = {
    before,
    after: (await mem(A)).cachedDecisions,
    bound: 50_000,
    oldestReRequested: evicted,
    checks: await metric(A, "account_access_checks_total"),
  };
  await stop(gw);

  // ── Socket reconnection spread after a gateway restart ──
  out.socketReconnect = await socketReconnect(47202, 200);

  writeFileSync(
    process.env.PERF_RESULTS_FILE || "/dev/stdout",
    JSON.stringify(out, null, 2),
  );
}

main()
  .catch((e) => (console.error(e), (process.exitCode = 1)))
  .finally(async () => {
    procs.forEach((p) => p.exitCode == null && p.kill("SIGKILL"));
    await prisma.$disconnect();
    process.exit();
  });
