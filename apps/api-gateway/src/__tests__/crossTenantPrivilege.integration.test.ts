/**
 * Cross-organisation privilege escalation (API layer).
 *
 * Runs over HTTP: a real Express app with the REAL `authenticate` (real JWT
 * verification), the REAL authorisation guards, the REAL request-scoped
 * access resolver, and the REAL tenant handlers that check privileges
 * (`approveJoinRequest`, `selectTenant`). @hrms/db is the real package —
 * runWithTenant, the prismaWithTenant proxy and the tenant filter on master
 * `user` queries — over the in-memory PrismaClient (@hrms/db/testing), with
 * one database per organisation.
 *
 * The state after "user creates a second organisation" is seeded exactly as
 * buildTenant (handlers/tenant.ts) writes it: the creator's master record
 * gets `tenantId = <new org>` and `isSuperUser = true`, plus an `owner`
 * membership in the new org. (buildTenant itself also talks to Razorpay and
 * provisions a database, so it isn't driven end to end here.)
 *
 * Every "denied" expectation below FAILS on the pre-fix code (commit
 * 364d2fb): the guards read `isSuperUser`/`permissions` unscoped and admitted
 * the request — see REGRESSION_TESTS.md for the mutation run.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  apiRequestLogger: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));
jest.mock("../handlers/salary", () => ({ seedSalaryFromHire: jest.fn() }));
jest.mock("../handlers/payment", () => ({
  getRazorpay: jest.fn(),
  verifySubscriptionSignature: jest.fn(),
}));
jest.mock("../services/tenantTokenStore", () => ({
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
  markOrgSetupComplete: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../services/trial", () => ({}));
jest.mock("@hrms/cache", () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
    getOrSet: (_k: string, fn: () => unknown) => fn(),
  },
}));

const SECRET = "cross-tenant-privilege-test-secret";
process.env.ACCESS_JWT_TOKEN = SECRET;
process.env.REFRESH_TOKEN = "cross-tenant-privilege-refresh-secret";
process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";

import express, { Request, Response } from "express";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { MASTER_DB, resetDatabases, seedDatabase } from "@hrms/db/testing";
import {
  authenticate,
  requireSuperUser,
  requirePrivileged,
  requireHrPrivileged,
  requireSubscriptionManager,
} from "../middleware/authenticate";
import { withUserAccessScope } from "../services/userAccess";
import { approveJoinRequest, selectTenant } from "../handlers/tenant";

// Organisations
const ORG_A = "aaaaaaaaaaaaaaaaaaaaaaaa"; // Alice is admin here
const ORG_B = "bbbbbbbbbbbbbbbbbbbbbbbb"; // Alice creates this one
const ORG_E = "eeeeeeeeeeeeeeeeeeeeeeee"; // Eve's employer
const ORG_T = "ffffffffffffffffffffffff"; // Eve's free-trial org
const DB = (org: string) => `hrms-${org.slice(0, 4)}`;

// People
const ALICE = "a11ce0000000000000000001";
const EVE = "e7e000000000000000000001";
const OWEN = "0e0000000000000000000001"; // legitimate owner of ORG_E
const PAT = "9a7000000000000000000001"; // ordinary employee, single org

function seed() {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [ORG_A, ORG_B, ORG_E, ORG_T].map((id) => ({
      id,
      name: `Org ${id.slice(0, 1)}`,
      slug: `org-${id.slice(0, 1)}`,
      dbName: DB(id),
      isActive: true,
    })),
    user: [
      // Alice: admin of A, then created B → buildTenant moved her home
      // tenant to B and set isSuperUser (handlers/tenant.ts buildTenant).
      {
        id: ALICE,
        username: "alice",
        tenantId: ORG_B,
        isSuperUser: true,
        permissions: [],
        role: [],
        employeeStatus: "Active",
      },
      // Eve: employee of E, then started a free trial → home tenant T,
      // isSuperUser true, and (worst case) an admin-granted wildcard.
      {
        id: EVE,
        username: "eve",
        tenantId: ORG_T,
        isSuperUser: true,
        permissions: [
          "*:*:*",
          "Subscription:manage",
          "Organisation:approve_join_requests",
          "Organisation:edit_company_info",
        ],
        role: ["admin"],
        employeeStatus: "Active",
      },
      // Owen: the real owner of E (home E, superuser of E).
      {
        id: OWEN,
        username: "owen",
        tenantId: ORG_E,
        isSuperUser: true,
        permissions: [],
        role: [],
        employeeStatus: "Active",
      },
      // Pat: an employee of E with an explicit, legitimately granted
      // Subscription permission from E's admin.
      {
        id: PAT,
        username: "pat",
        tenantId: ORG_E,
        isSuperUser: false,
        permissions: ["Subscription:manage"],
        role: [],
        employeeStatus: "Active",
      },
    ],
    tenantMembership: [
      { id: "m1", tenantId: ORG_A, userId: ALICE, role: "admin" },
      { id: "m2", tenantId: ORG_B, userId: ALICE, role: "owner" },
      { id: "m3", tenantId: ORG_E, userId: EVE, role: "employee" },
      { id: "m4", tenantId: ORG_T, userId: EVE, role: "owner" },
      { id: "m5", tenantId: ORG_E, userId: OWEN, role: "owner" },
      { id: "m6", tenantId: ORG_E, userId: PAT, role: "employee" },
    ],
  });
}

function token(userId: string, tenantId: string, tenantRole: string) {
  return jwt.sign(
    {
      userId,
      tenantId,
      tenantRole,
      pendingSetup: false,
      orgSetupComplete: true,
      dbName: DB(tenantId),
    },
    SECRET,
    { algorithm: "HS256", expiresIn: "5m" },
  );
}

let server: http.Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use((_req, _res, next) => withUserAccessScope(next));
  app.use(express.json());
  const ok = (_req: Request, res: Response) => res.json({ ok: true });
  app.get("/probe/super", authenticate, requireSuperUser, ok);
  app.get("/probe/privileged", authenticate, requirePrivileged, ok);
  app.get("/probe/hr", authenticate, requireHrPrivileged, ok);
  app.get("/probe/subscription", authenticate, requireSubscriptionManager, ok);
  app.post(
    "/tenants/join-requests/:id/approve",
    authenticate,
    approveJoinRequest,
  );
  app.post("/tenants/select", authenticate, selectTenant);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(seed);

async function call(
  method: "GET" | "POST",
  path: string,
  bearer: string,
  body?: unknown,
): Promise<number> {
  const res = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

const GUARDS = ["super", "privileged", "hr", "subscription"] as const;

describe("Privileges never cross organisations", () => {
  describe("1–3. An admin of A who creates B gains nothing extra in A", () => {
    it("keeps exactly her admin-role privileges in A (owner-only superuser guard denied)", async () => {
      const t = token(ALICE, ORG_A, "admin");
      // Before the fix: B's isSuperUser was honoured in A → 200.
      expect(await call("GET", "/probe/super", t)).toBe(403);
      // Her real A membership (admin) still grants admin-level access.
      expect(await call("GET", "/probe/privileged", t)).toBe(200);
      expect(await call("GET", "/probe/hr", t)).toBe(200);
      expect(await call("GET", "/probe/subscription", t)).toBe(200);
    });

    it("is a full owner/superuser in the organisation she created (B)", async () => {
      const t = token(ALICE, ORG_B, "owner");
      for (const g of GUARDS)
        expect(await call("GET", `/probe/${g}`, t)).toBe(200);
    });
  });

  describe("4. A normal employee never gains admin rights by creating an organisation", () => {
    it("is denied by every admin guard in the employer's organisation", async () => {
      const t = token(EVE, ORG_E, "employee");
      for (const g of GUARDS) {
        expect({
          guard: g,
          status: await call("GET", `/probe/${g}`, t),
        }).toEqual({
          guard: g,
          status: 403,
        });
      }
    });

    it("cannot approve join requests in the employer's organisation", async () => {
      const t = token(EVE, ORG_E, "employee");
      expect(
        await call("POST", "/tenants/join-requests/jr1/approve", t, {}),
      ).toBe(403);
    });

    it("is a full owner in her own trial organisation", async () => {
      const t = token(EVE, ORG_T, "owner");
      for (const g of GUARDS)
        expect(await call("GET", `/probe/${g}`, t)).toBe(200);
    });
  });

  describe("5. Legitimate owners and grants keep working", () => {
    it("the real owner of E passes every guard", async () => {
      const t = token(OWEN, ORG_E, "owner");
      for (const g of GUARDS)
        expect(await call("GET", `/probe/${g}`, t)).toBe(200);
    });

    it("a superuser acting in their home organisation passes even with a non-admin role", async () => {
      // tenantRole not fast-pathed → falls back to isSuperUser, which is
      // honoured because E is Owen's home organisation.
      const t = token(OWEN, ORG_E, "employee");
      expect(await call("GET", "/probe/super", t)).toBe(200);
    });

    it("an explicit permission granted by the user's own organisation is honoured", async () => {
      const t = token(PAT, ORG_E, "employee");
      expect(await call("GET", "/probe/subscription", t)).toBe(200);
      expect(await call("GET", "/probe/super", t)).toBe(403);
    });
  });

  describe("6. Cross-tenant access stays denied", () => {
    it("cannot select an organisation the user has no membership in", async () => {
      const t = token(EVE, ORG_E, "employee");
      expect(
        await call("POST", "/tenants/select", t, { tenantId: ORG_A }),
      ).toBe(403);
    });

    it("rejects a forged token (role/organisation are not client-controllable)", async () => {
      const forged = jwt.sign(
        {
          userId: EVE,
          tenantId: ORG_E,
          tenantRole: "owner",
          dbName: DB(ORG_E),
        },
        "attacker-secret",
        { algorithm: "HS256" },
      );
      expect(await call("GET", "/probe/super", forged)).toBe(401);
    });
  });
});
