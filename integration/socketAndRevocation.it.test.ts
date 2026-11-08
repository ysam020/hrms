/**
 * Outage handling and session revocation across processes — REAL infrastructure:
 * two independent gateway processes (integration/helpers/gatewayProcess.ts),
 * real socket.io-client connections, the isolated MongoDB replica set and
 * Redis. Outages are real container pauses.
 */
import { spawn, type ChildProcess } from "node:child_process";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "@hrms/db";
import { pause, unpause } from "./helpers/docker";

const A = 47101;
const B = 47102;
const TENANT = "700000000000000000000001";
const INACTIVE_TENANT = "700000000000000000000002";
const CAROL = "710000000000000000000001";
const DAVE = "710000000000000000000002";
const ERIN = "710000000000000000000003"; // never cached before the outage test
const FRED = "710000000000000000000004"; // member of the inactive org
const oid = (id: string) => ({ $oid: id });

const TTL_MS = 2000;
const REVALIDATE_MS = 1000;
const procs: ChildProcess[] = [];

function startGateway(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "integration/helpers/gatewayProcess.ts"],
      {
        env: {
          ...process.env,
          PORT: String(port),
          ACCOUNT_ACCESS_TTL_MS: String(TTL_MS),
          SOCKET_REVALIDATE_MS: String(REVALIDATE_MS),
          ACCOUNT_CHECK_TIMEOUT_MS: "1500",
          ACCOUNT_ACCESS_BREAKER_THRESHOLD: "3",
          ACCOUNT_ACCESS_BREAKER_MS: "3000",
          LOG_LEVEL: "error",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const timer = setTimeout(
      () => reject(new Error(`gateway ${port} did not start`)),
      90_000,
    );
    child.stdout!.on("data", (b) => {
      if (String(b).includes(`READY ${port}`)) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on(
      "exit",
      (code) => code && reject(new Error(`gateway ${port} exited ${code}`)),
    );
  });
}

async function seed() {
  for (const c of ["tenants", "users", "tenant_memberships"]) {
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Sock",
        slug: "it-sock",
        dbName: "hrms-it-acme",
        isActive: true,
      },
      {
        _id: oid(INACTIVE_TENANT),
        name: "IT Gone",
        slug: "it-gone",
        dbName: "hrms-it-beta",
        isActive: false,
      },
    ],
  });
  const user = (id: string, name: string, t = TENANT) => ({
    _id: oid(id),
    username: name,
    email: `${name}@example.test`,
    tenantId: oid(t),
    employeeStatus: "Active",
    isSuperUser: false,
    permissions: [],
    role: [],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      user(CAROL, "carol"),
      user(DAVE, "dave"),
      user(ERIN, "erin"),
      user(FRED, "fred", INACTIVE_TENANT),
    ],
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: [
      {
        _id: oid("720000000000000000000001"),
        tenantId: oid(TENANT),
        userId: oid(CAROL),
        role: "employee",
      },
      {
        _id: oid("720000000000000000000002"),
        tenantId: oid(TENANT),
        userId: oid(DAVE),
        role: "employee",
      },
      {
        _id: oid("720000000000000000000003"),
        tenantId: oid(TENANT),
        userId: oid(ERIN),
        role: "employee",
      },
      {
        _id: oid("720000000000000000000004"),
        tenantId: oid(INACTIVE_TENANT),
        userId: oid(FRED),
        role: "employee",
      },
    ],
  });
}

const token = (userId: string, tenantId = TENANT) =>
  jwt.sign(
    { userId, tenantId, tenantRole: "employee", dbName: "hrms-it-acme" },
    process.env.ACCESS_JWT_TOKEN!,
    {
      algorithm: "HS256",
      expiresIn: "1h",
    },
  );

async function get(port: number, path: string, bearer: string) {
  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  return {
    status: res.status,
    body: await res.json().catch(() => null),
    ms: Date.now() - t0,
  };
}

async function terminate(id: string) {
  await prisma.$runCommandRaw({
    update: "users",
    updates: [
      { q: { _id: oid(id) }, u: { $set: { employeeStatus: "Terminated" } } },
    ],
  });
}

function connect(port: number, bearer: string): Socket {
  return ioClient(`http://127.0.0.1:${port}`, {
    auth: { token: bearer },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
}

const once = <T = any>(s: Socket, ev: string, ms = 10_000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`no ${ev} within ${ms} ms`)),
      ms,
    );
    s.once(ev, (v: T) => {
      clearTimeout(t);
      resolve(v);
    });
  });

beforeAll(async () => {
  await seed();
  procs.push(await startGateway(A), await startGateway(B));
}, 200_000);
afterAll(async () => {
  unpause("praesto-it-mongo");
  procs.forEach((p) => p.kill("SIGTERM"));
  await prisma.$disconnect();
});
afterEach(() => unpause("praesto-it-mongo"));

describe("Revocation across two independent gateway processes (HTTP)", () => {
  it("a termination written by anyone is honoured by BOTH processes within the cache TTL", async () => {
    await seed();
    const t = token(CAROL);
    expect((await get(A, "/me", t)).status).toBe(200);
    expect((await get(B, "/me", t)).status).toBe(200);
    await terminate(CAROL); // e.g. the scheduler's last-working-day job
    const deadline = Date.now() + TTL_MS + 1500;
    let a = 0;
    let b = 0;
    while (Date.now() < deadline && (a !== 401 || b !== 401)) {
      a = (await get(A, "/me", t)).status;
      b = (await get(B, "/me", t)).status;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect([a, b]).toEqual([401, 401]);
  });
});

describe("Real Socket.IO clients", () => {
  it("an active person connects; a terminated one is REJECTED (not retryable)", async () => {
    await seed();
    const ok = connect(A, token(DAVE));
    await once(ok, "connect");
    ok.disconnect();
    await terminate(DAVE);
    await new Promise((r) => setTimeout(r, TTL_MS + 100));
    const refused = connect(A, token(DAVE));
    const err: any = await once(refused, "connect_error");
    expect(err.data).toEqual({ code: "AUTH_REJECTED", retryable: false });
    refused.close();
  });

  it("an inactive organisation is rejected", async () => {
    const s = connect(B, token(FRED, INACTIVE_TENANT));
    const err: any = await once(s, "connect_error");
    expect(err.data).toMatchObject({ code: "AUTH_REJECTED", retryable: false });
    s.close();
  });

  it("a CONNECTED socket is closed after termination, on the other process too", async () => {
    await seed();
    const s = connect(B, token(DAVE));
    await once(s, "connect");
    const expired = once(s, "session-expired", TTL_MS + REVALIDATE_MS + 4000);
    const gone = once(s, "disconnect", TTL_MS + REVALIDATE_MS + 4000);
    await terminate(DAVE);
    await expired;
    expect(await gone).toBe("io server disconnect");
  });

  it("MongoDB hung during the handshake → retryable AUTH_CHECK_UNAVAILABLE fast; connects after recovery", async () => {
    await seed();
    pause("praesto-it-mongo");
    const s = connect(A, token(ERIN)); // ERIN not cached on A
    const t0 = Date.now();
    const err: any = await once(s, "connect_error", 10_000);
    const tookMs = Date.now() - t0;
    expect(err.data).toEqual({
      code: "AUTH_CHECK_UNAVAILABLE",
      retryable: true,
    });
    expect(tookMs).toBeLessThan(4000);
    unpause("praesto-it-mongo");
    // The client policy retries (reconnectPolicy: retryable → backoff).
    await new Promise((r) => setTimeout(r, 3500)); // breaker window
    s.connect();
    await once(s, "connect", 15_000);
    s.disconnect();
  });

  it("reconnecting the SAME client instance does not duplicate deliveries", async () => {
    await seed();
    const s = connect(A, token(CAROL));
    await once(s, "connect");
    let received = 0;
    s.on("it:ping", () => received++);
    s.disconnect();
    s.connect();
    await once(s, "connect");
    await new Promise((r) => setTimeout(r, 300));
    await fetch(`http://127.0.0.1:${A}/push/${CAROL}?tenant=${TENANT}`, {
      method: "POST",
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(received).toBe(1);
    s.disconnect();
  });
});

describe("MongoDB outage on the HTTP path (real)", () => {
  it("an uncached person gets 503 AUTH_CHECK_UNAVAILABLE, bounded; the breaker then fails fast; recovery restores 200", async () => {
    await seed();
    // Force a cache miss on B for everyone: wait out the TTL.
    await new Promise((r) => setTimeout(r, TTL_MS + 100));
    pause("praesto-it-mongo");
    const first = await get(B, "/me", token(ERIN));
    expect(first.status).toBe(503);
    expect(first.body).toMatchObject({ code: "AUTH_CHECK_UNAVAILABLE" });
    expect(first.ms).toBeLessThan(4000);
    await get(B, "/me", token(DAVE));
    await get(B, "/me", token(CAROL)); // 3rd consecutive failure opens the breaker
    const fast = await get(B, "/me", token(ERIN));
    expect(fast.status).toBe(503);
    expect(fast.ms).toBeLessThan(300); // no database call while open
    const health = await (await fetch(`http://127.0.0.1:${B}/health`)).json();
    expect(health.breakerOpen).toBe(true);
    unpause("praesto-it-mongo");
    await new Promise((r) => setTimeout(r, 3500)); // breaker window
    const ok = await get(B, "/me", token(ERIN));
    expect(ok.status).toBe(200);
  });

  it("an outage never grants access to a person who was terminated just before it", async () => {
    await seed();
    await terminate(CAROL);
    await new Promise((r) => setTimeout(r, TTL_MS + 100));
    pause("praesto-it-mongo");
    const r = await get(A, "/me", token(CAROL));
    expect([401, 503]).toContain(r.status); // never 200
  });
});
