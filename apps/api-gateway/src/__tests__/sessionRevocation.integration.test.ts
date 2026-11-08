/**
 * Sessions end when access ends (API layer).
 *
 * A real Express app with the REAL `authenticate`, the REAL guards and the
 * REAL account check (@hrms/db checkAccountAccess + the gateway's cache), over
 * the real @hrms/db routing on the in-memory PrismaClient. Each test first
 * proves the token works, then changes the person's state in the database
 * exactly as the product does (status update, membership delete/role change,
 * tenant deactivation) and calls again with the SAME, still-valid token.
 *
 * Every "after" expectation FAILS on the pre-fix code (364d2fb): the token
 * kept working until expiry (and refresh kept renewing it).
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const SECRET = "session-revocation-test-secret";
process.env.ACCESS_JWT_TOKEN = SECRET;
process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";

import express, { Request, Response } from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { prisma } from "@hrms/db";
import { MASTER_DB, resetDatabases, seedDatabase } from "@hrms/db/testing";
import { authenticate, requirePrivileged } from "../middleware/authenticate";
import { withUserAccessScope } from "../services/userAccess";
import {
  clearAccountAccessCache,
  invalidateAccountAccess,
} from "../services/accountAccess";

const ORG = "aaaaaaaaaaaaaaaaaaaaaaaa";
const DB = "hrms-acme";
const EMP = "e00000000000000000000001";
const ADMIN = "a00000000000000000000001";

function seed() {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [{ id: ORG, name: "Acme", dbName: DB, isActive: true }],
    user: [
      { id: EMP, username: "emp", tenantId: ORG, employeeStatus: "Active" },
      { id: ADMIN, username: "adm", tenantId: ORG, employeeStatus: "Active" },
    ],
    tenantMembership: [
      { id: "m1", tenantId: ORG, userId: EMP, role: "employee" },
      { id: "m2", tenantId: ORG, userId: ADMIN, role: "admin" },
    ],
  });
}

const token = (userId: string, tenantRole: string) =>
  jwt.sign(
    { userId, tenantId: ORG, tenantRole, pendingSetup: false, dbName: DB },
    SECRET,
    { algorithm: "HS256", expiresIn: "24h" },
  );

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use((_q, _s, next) => withUserAccessScope(next));
  const ok = (req: Request, res: Response) =>
    res.json({ role: (req as any).user.tenantRole });
  app.get("/me", authenticate, ok);
  app.get("/admin", authenticate, requirePrivileged, ok);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  seed();
  clearAccountAccessCache();
});

async function get(path: string, bearer: string) {
  const res = await fetch(base + path, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// What the product does after a write: the writing process drops its cached
// decision (editEmployeeDetails → invalidateAccountAccess); other processes
// pick the change up within ACCOUNT_ACCESS_TTL_MS. The TTL bound is tested
// separately at the end.
const afterWrite = (userId: string) => invalidateAccountAccess(userId);

describe("A still-valid token stops working when access ends", () => {
  it.each(["Terminated", "Absconded", "Resigned"])(
    "%s employee: same token → 401 SESSION_REVOKED",
    async (status) => {
      const t = token(EMP, "employee");
      expect((await get("/me", t)).status).toBe(200);

      await prisma.user.update({
        where: { id: EMP },
        data: { employeeStatus: status },
      });
      afterWrite(EMP);

      const after = await get("/me", t);
      expect(after.status).toBe(401);
      expect(after.body).toMatchObject({ code: "SESSION_REVOKED" });
    },
  );

  it("removed from the organisation: same token → 401", async () => {
    const t = token(EMP, "employee");
    expect((await get("/me", t)).status).toBe(200);
    await (prisma as any).tenantMembership.updateMany({
      where: { tenantId: ORG, userId: EMP },
      data: { tenantId: "removed" }, // the fake has no delete; equivalent
    });
    afterWrite(EMP);
    expect((await get("/me", t)).status).toBe(401);
  });

  it("organisation deactivated: same token → 401", async () => {
    const t = token(EMP, "employee");
    expect((await get("/me", t)).status).toBe(200);
    await prisma.tenant.update({
      where: { id: ORG },
      data: { isActive: false },
    });
    afterWrite(EMP);
    expect((await get("/me", t)).status).toBe(401);
  });
});

describe("Role changes reach existing sessions", () => {
  it("a demoted admin loses admin access with the same token", async () => {
    const t = token(ADMIN, "admin");
    expect((await get("/admin", t)).status).toBe(200);

    await (prisma as any).tenantMembership.updateMany({
      where: { tenantId: ORG, userId: ADMIN },
      data: { role: "employee" },
    });
    afterWrite(ADMIN);

    expect((await get("/admin", t)).status).toBe(403);
    expect((await get("/me", t)).body).toEqual({ role: "employee" });
  });

  it("a token can't claim a higher role than the membership holds", async () => {
    const forgedClaims = token(EMP, "owner"); // validly signed, stale/elevated claim
    expect((await get("/admin", forgedClaims)).status).toBe(403);
  });
});

describe("legitimate sessions are unaffected", () => {
  it("an active employee keeps working, with their real role", async () => {
    const t = token(EMP, "employee");
    for (let i = 0; i < 3; i++) {
      const r = await get("/me", t);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ role: "employee" });
    }
  });
});

describe("cache bound: a change made by ANOTHER process is honoured within the TTL", () => {
  it("re-reads after ACCOUNT_ACCESS_TTL_MS without any invalidation", async () => {
    const t = token(EMP, "employee");
    const realNow = Date.now;
    try {
      let now = realNow();
      Date.now = () => now;
      expect((await get("/me", t)).status).toBe(200); // cached as allowed

      // Another process (e.g. the scheduler's LWD job) writes the status;
      // this process gets no invalidation.
      await prisma.user.update({
        where: { id: EMP },
        data: { employeeStatus: "Resigned" },
      });
      expect((await get("/me", t)).status).toBe(200); // within the TTL

      now += 30_001; // default ACCOUNT_ACCESS_TTL_MS = 30 s
      expect((await get("/me", t)).status).toBe(401);
    } finally {
      Date.now = realNow;
    }
  });
});
