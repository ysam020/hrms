/**
 * The HTTP layer over encrypted data: real authenticate middleware and real
 * handlers, isolated MongoDB/Redis, synthetic people. Response shapes must
 * be what they were before encryption; access rules must be unchanged.
 */
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import {
  prisma,
  getClientForDb,
  ensureMasterIndexes,
  runWithTenant,
} from "@hrms/db";
import { isEncrypted } from "@hrms/crypto";
import { authenticate } from "../apps/api-gateway/src/middleware/authenticate";
import { withUserAccessScope } from "../apps/api-gateway/src/services/userAccess";
import { getProfile } from "../apps/api-gateway/src/handlers/auth";
import {
  viewAllKycs,
  getKycInsights,
} from "../apps/api-gateway/src/handlers/employee";

const DB = "hrms-it-acme";
const raw = (cmd: Record<string, unknown>) =>
  (prisma.$runCommandRaw as any)(cmd);
let server: http.Server;
let port = 0;
let tenantId = "";
const ids: Record<string, string> = {};

const token = (userId: string, tenantRole: string) =>
  jwt.sign(
    { userId, tenantId, tenantRole, dbName: DB },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: "1h" },
  );

async function get(path: string, bearer: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text || "null") };
}

beforeAll(async () => {
  for (const c of ["tenants", "users", "tenant_memberships"]) {
    await raw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  }
  await ensureMasterIndexes();
  const tenant = await prisma.tenant.create({
    data: {
      name: "IT API",
      slug: `it-api-${Date.now()}`,
      dbName: DB,
      helpEmail: "help@it-api.test",
    },
  });
  tenantId = tenant.id;
  const person = (
    username: string,
    first: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.user.create({
      data: {
        tenantId,
        username,
        first_name: first,
        last_name: "Rao",
        email: `${username}@it-api.test`,
        mobile: "+919812300000",
        aadhar_no: "999911112222",
        pan_no: "ABCDE1234F",
        dob: new Date("1991-04-05T00:00:00.000Z"),
        employeeStatus: "Active",
        kyc_approval: "Approved",
        permissions: [],
        role: [],
        ...extra,
      } as any,
    });
  ids.asha = (await person("asha_api", "Asha")).id;
  ids.ravi = (await person("ravi_api", "Ravi")).id;
  ids.hr = (await person("hr_api", "Hema")).id;
  for (const [u, role] of [
    [ids.asha, "employee"],
    [ids.ravi, "employee"],
    [ids.hr, "admin"],
  ]) {
    await prisma.tenantMembership.create({
      data: { tenantId, userId: u, role },
    });
  }

  const app = express();
  app.use((_q, _s, next) => withUserAccessScope(next));
  // The gateway binds the tenant database per request; the same here.
  app.use((req: any, _res, next) => {
    const t = getClientForDb(DB);
    runWithTenant(
      tenantId,
      t,
      () =>
        new Promise<void>((done) => {
          next();
          req.on("close", done);
        }),
    );
  });
  app.get("/auth/profile", authenticate, getProfile);
  app.get("/employee/view-all-kycs", authenticate, viewAllKycs);
  app.get("/employee/get-kyc-insights", authenticate, getKycInsights);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as any).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

it("the database holds only ciphertext for these people", async () => {
  const doc = (
    await raw({
      find: "users",
      filter: { username_bidx: { $exists: true } },
      limit: 1,
      singleBatch: true,
    })
  ).cursor.firstBatch[0];
  for (const f of [
    "first_name",
    "email",
    "mobile",
    "aadhar_no",
    "pan_no",
    "dob",
    "username",
  ])
    expect(isEncrypted(doc[f])).toBe(true);
});

it("an employee's own profile comes back decrypted, in the same shape and types", async () => {
  const { status, body, text } = await get(
    "/auth/profile",
    token(ids.asha, "employee"),
  );
  expect(status).toBe(200);
  const p = body.data.user;
  expect(p).toMatchObject({
    username: "asha_api",
    email: "asha_api@it-api.test",
    mobile: "+919812300000",
    aadhar_no: "999911112222",
    pan_no: "ABCDE1234F",
  });
  expect(typeof p.dob).toBe("string");
  expect(new Date(p.dob).toISOString()).toBe("1991-04-05T00:00:00.000Z");
  expect(text).not.toMatch(/enc:v2:|_bidx|hmac:/);
});

it("a non-privileged employee sees only their own KYC row, whatever they search for", async () => {
  const { status, body, text } = await get(
    "/employee/view-all-kycs?search=ravi",
    token(ids.asha, "employee"),
  );
  expect(status).toBe(200);
  expect(body.data.kycs.map((k: any) => k.username)).toEqual(["asha_api"]);
  expect(text).not.toContain("Ravi");
  expect(text).not.toMatch(/enc:v2:|hmac:/);
});

it("an admin searches names across the tenant, decrypted and sorted by name", async () => {
  const { status, body } = await get(
    "/employee/view-all-kycs?search=ra",
    token(ids.hr, "admin"),
  );
  expect(status).toBe(200);
  expect(body.data.kycs.map((k: any) => k.first_name)).toEqual([
    "Asha",
    "Hema",
    "Ravi",
  ]);
  expect(body.data.pagination.totalCount).toBe(3);
  const one = await get(
    "/employee/view-all-kycs?search=RAVI",
    token(ids.hr, "admin"),
  );
  expect(one.body.data.kycs.map((k: any) => k.username)).toEqual(["ravi_api"]);
});

it("KYC insights stay forbidden to an employee, and carry no personal data for an admin", async () => {
  expect(
    (await get("/employee/get-kyc-insights", token(ids.asha, "employee")))
      .status,
  ).toBe(403);
  const hr = await get("/employee/get-kyc-insights", token(ids.hr, "admin"));
  expect(hr.status).toBe(200);
  expect(hr.body.data.overview.approvedKyc).toBe(3);
  expect(hr.text).not.toMatch(/Asha|999911112222|ABCDE1234F/);
});

it("a token for one tenant can't read another tenant's people", async () => {
  const other = jwt.sign(
    {
      userId: ids.asha,
      tenantId: "65f000000000000000000abc",
      tenantRole: "hr",
      dbName: "hrms-it-beta",
    },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: "1h" },
  );
  const r = await get("/employee/view-all-kycs", other);
  expect([401, 403]).toContain(r.status);
  expect(r.text).not.toContain("Asha");
});
