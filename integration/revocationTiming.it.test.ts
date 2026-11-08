/**
 * Measured revocation time with PRODUCTION DEFAULTS
 * (ACCOUNT_ACCESS_TTL_MS = 30 s, SOCKET_REVALIDATE_MS = 60 s) across two
 * independent gateway processes, real authenticated HTTP clients and real
 * socket.io clients. Users warm their cache entries at staggered times so
 * their cache ages at the moment of termination differ.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "@hrms/db";

const A = 47111;
const B = 47112;
const TENANT = "740000000000000000000001";
const USERS = Array.from(
  { length: 6 },
  (_, i) => `75000000000000000000000${i + 1}`,
);
const oid = (id: string) => ({ $oid: id });
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
          ACCOUNT_ACCESS_TTL_MS: "30000",
          SOCKET_REVALIDATE_MS: "60000",
          ACCOUNT_CHECK_TIMEOUT_MS: "2000",
          LOG_LEVEL: "error",
        },
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
  });
}

const token = (u: string) =>
  jwt.sign(
    {
      userId: u,
      tenantId: TENANT,
      tenantRole: "employee",
      dbName: "hrms-it-acme",
    },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: "1h" },
  );
const status = async (port: number, u: string) =>
  (
    await fetch(`http://127.0.0.1:${port}/me`, {
      headers: { authorization: `Bearer ${token(u)}` },
    })
  ).status;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  for (const c of ["tenants", "users", "tenant_memberships"])
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Rev",
        slug: "it-rev",
        dbName: "hrms-it-acme",
        isActive: true,
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: USERS.map((u, i) => ({
      _id: oid(u),
      username: `rev${i}`,
      email: `rev${i}@example.test`,
      tenantId: oid(TENANT),
      employeeStatus: "Active",
      isSuperUser: false,
      permissions: [],
      role: [],
    })),
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: USERS.map((u, i) => ({
      _id: oid(`76000000000000000000000${i + 1}`),
      tenantId: oid(TENANT),
      userId: oid(u),
      role: "employee",
    })),
  });
  procs.push(await startGateway(A), await startGateway(B));
}, 200_000);
afterAll(async () => {
  procs.forEach((p) => p.kill("SIGTERM"));
  await prisma.$disconnect();
});

it("measures HTTP and socket revocation time with production defaults", async () => {
  const sockets: Socket[] = [];
  // Warm caches at staggered times (0, 5, 10, 15, 20, 25 s before termination).
  for (const u of USERS) {
    expect(await status(A, u)).toBe(200);
    expect(await status(B, u)).toBe(200);
    const s = ioClient(`http://127.0.0.1:${B}`, {
      auth: { token: token(u) },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    await new Promise((r) => s.once("connect", r));
    sockets.push(s);
    await sleep(5000);
  }

  const t0 = Date.now();
  const socketClosedAt: Array<number | null> = USERS.map(() => null);
  sockets.forEach((s, i) =>
    s.once("session-expired", () => (socketClosedAt[i] = Date.now() - t0)),
  );
  await prisma.$runCommandRaw({
    update: "users",
    updates: [
      {
        q: { _id: { $in: USERS.map(oid) } },
        u: { $set: { employeeStatus: "Terminated" } },
        multi: true,
      },
    ],
  });

  const httpA: Array<number | null> = USERS.map(() => null);
  const httpB: Array<number | null> = USERS.map(() => null);
  while (Date.now() - t0 < 100_000) {
    await Promise.all(
      USERS.map(async (u, i) => {
        if (httpA[i] == null && (await status(A, u)) === 401)
          httpA[i] = Date.now() - t0;
        if (httpB[i] == null && (await status(B, u)) === 401)
          httpB[i] = Date.now() - t0;
      }),
    );
    if (
      httpA.every((x) => x != null) &&
      httpB.every((x) => x != null) &&
      socketClosedAt.every((x) => x != null)
    )
      break;
    await sleep(250);
  }
  sockets.forEach((s) => s.close());

  const out = { httpA, httpB, socketClosedAt };
  writeFileSync(
    process.env.REVOCATION_RESULTS_FILE || "/dev/null",
    JSON.stringify(out, null, 2),
  );
  for (const v of [...httpA, ...httpB]) expect(v).not.toBeNull();
  for (const v of socketClosedAt) expect(v).not.toBeNull();
  expect(
    Math.max(...(httpA as number[]), ...(httpB as number[])),
  ).toBeLessThanOrEqual(30_000 + 1_000);
  expect(Math.max(...(socketClosedAt as number[]))).toBeLessThanOrEqual(
    90_000 + 1_000,
  );
}, 240_000);
