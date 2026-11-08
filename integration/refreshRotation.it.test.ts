/**
 * Refresh-token rotation against REAL Redis and a REAL MongoDB
 * replica set (isolated containers, see up.sh). No mocks: the auth-service
 * handler, @hrms/cache (ioredis + Lua) and @hrms/db (Prisma) are the real
 * modules. Outages are real container pauses.
 */
import { status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { getRedisClient, storeRefreshToken } from "@hrms/cache";
import jwt from "jsonwebtoken";
import { refreshToken } from "../apps/auth-service/src/handlers/refreshToken";
import { pause, unpause } from "./helpers/docker";

const TENANT = "6a0000000000000000000001";
const USER = "6b0000000000000000000001";
const DB = "hrms-it-acme";

const oid = (id: string) => ({ $oid: id });
async function reset(over: { status?: string; tenantActive?: boolean } = {}) {
  for (const c of ["tenants", "users", "tenant_memberships"]) {
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Acme",
        slug: "it-acme",
        dbName: DB,
        isActive: over.tenantActive ?? true,
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      {
        _id: oid(USER),
        username: "it-user",
        email: "it-user@example.test",
        tenantId: oid(TENANT),
        employeeStatus: over.status ?? "Active",
        isSuperUser: false,
        permissions: [],
        role: [],
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: [
      {
        _id: oid("6c0000000000000000000001"),
        tenantId: oid(TENANT),
        userId: oid(USER),
        role: "admin",
      },
    ],
  });
  await getRedisClient().del(`refresh:${USER}`, `refresh-prev:${USER}`);
}

function issue(): string {
  const t = jwt.sign(
    { userId: USER, jti: Math.random().toString(36) },
    process.env.REFRESH_TOKEN!,
    { expiresIn: "30d" },
  );
  return t;
}

function call(token: string): Promise<any> {
  return new Promise((resolve) =>
    refreshToken(
      { request: { refreshToken: token } } as any,
      (_e: unknown, r: any) => resolve(r),
    ),
  );
}

afterEach(() => {
  unpause("praesto-it-mongo");
  unpause("praesto-it-redis");
});
afterAll(async () => {
  await prisma.$disconnect();
  getRedisClient().disconnect();
});

describe("Refresh rotation (real Redis + Mongo replica set)", () => {
  it("happy path: rotates, signs the CURRENT role from the membership", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(
      USER,
      t0,
      TENANT,
      "owner" /* stale snapshot */,
      undefined,
      DB,
    );
    const r = await call(t0);
    expect(r.status).toBe(status.OK);
    expect(jwt.decode(r.accessToken)).toMatchObject({
      tenantId: TENANT,
      tenantRole: "admin",
      dbName: DB,
    });
    expect(r.refreshToken).not.toBe(t0);
  });

  it("Mongo hung BEFORE rotation → UNAVAILABLE fast; the SAME token works after recovery", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    pause("praesto-it-mongo");
    const started = Date.now();
    const r = await call(t0);
    const tookMs = Date.now() - started;
    unpause("praesto-it-mongo");
    expect(r.status).toBe(status.UNAVAILABLE);
    expect(tookMs).toBeLessThan(4000); // bounded by ACCOUNT_CHECK_TIMEOUT_MS
    // The Redis record still holds t0 — nothing was rotated.
    const stillCurrent = await call(t0);
    expect(stillCurrent.status).toBe(status.OK);
  });

  it("Redis hung → UNAVAILABLE (bounded peek); the SAME token works after recovery", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    pause("praesto-it-redis");
    const started = Date.now();
    const r = await call(t0);
    const tookMs = Date.now() - started;
    unpause("praesto-it-redis");
    expect(r.status).toBe(status.UNAVAILABLE);
    expect(tookMs).toBeLessThan(4000);
    await new Promise((res) => setTimeout(res, 500)); // ioredis flushes its queue
    const after = await call(t0);
    expect(after.status).toBe(status.OK);
  });

  it("Mongo hung AFTER the atomic rotation: the new token is still delivered within the gateway deadline", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    // Exercise the post-rotation step directly: rotation commits in Redis,
    // then the Mongo mirror write stalls.
    const { rotateRefreshToken } = await import("@hrms/cache");
    pause("praesto-it-mongo");
    const started = Date.now();
    const rotation = await rotateRefreshToken(USER, t0, issue());
    const tookMs = Date.now() - started;
    unpause("praesto-it-mongo");
    expect(rotation.ok).toBe(true);
    expect(tookMs).toBeLessThan(3000); // was up to the 30 s driver timeout (> 8 s gateway deadline)
  });

  it("20 concurrent refreshes with one token: one rotation, every caller gets the SAME new token, and it works", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => call(t0)),
    );
    const ok = results.filter((r) => r.status === status.OK);
    expect(ok).toHaveLength(20);
    const issued = new Set(ok.map((r) => r.refreshToken));
    expect(issued.size).toBe(1);
    const [next] = issued;
    const again = await call(next as string);
    expect(again.status).toBe(status.OK);
  });

  it("terminated employee: renewal refused and the refresh token revoked", async () => {
    await reset({ status: "Terminated" });
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    const r = await call(t0);
    expect(r.status).toBe(status.UNAUTHENTICATED);
    expect(await getRedisClient().get(`refresh:${USER}`)).toBeNull();
  });

  it("inactive organisation: renewal refused", async () => {
    await reset({ tenantActive: false });
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    expect((await call(t0)).status).toBe(status.UNAUTHENTICATED);
  });

  it("Redis record lost (flush): the Mongo mirror still lets the CURRENT token renew, with the real role", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    await getRedisClient().del(`refresh:${USER}`, `refresh-prev:${USER}`);
    const r = await call(t0);
    expect(r.status).toBe(status.OK);
    expect(jwt.decode(r.accessToken)).toMatchObject({ tenantRole: "admin" });
  });

  it("a superseded token is rejected", async () => {
    await reset();
    const t0 = issue();
    await storeRefreshToken(USER, t0, TENANT, "admin", undefined, DB);
    const r1 = await call(t0);
    expect(r1.status).toBe(status.OK);
    // Simulate the 60 s grace expiring.
    await getRedisClient().del(`refresh-prev:${USER}`);
    expect((await call(t0)).status).toBe(status.UNAUTHENTICATED);
  });
});
