/**
 * The authoritative account check, over the
 * in-memory PrismaClient (real @hrms/db code, separate databases).
 */
jest.mock(
  "@prisma/client",
  () => require("../testing/fakePrismaClient").prismaClientModule,
);
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";

import {
  MASTER_DB,
  resetDatabases,
  seedDatabase,
} from "../testing/fakePrismaClient";
import { checkAccountAccess, isBlockedEmployeeStatus } from "../accountAccess";

const T1 = "aaaaaaaaaaaaaaaaaaaaaaaa";
const T2 = "bbbbbbbbbbbbbbbbbbbbbbbb";
const U = "c00000000000000000000001";

function seed(
  over: {
    status?: string;
    tenantActive?: boolean;
    dbName?: string | null;
    membership?: string | null;
  } = {},
) {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    user: [{ id: U, employeeStatus: over.status ?? "Active", tenantId: T1 }],
    tenant: [
      {
        id: T1,
        isActive: over.tenantActive ?? true,
        dbName: over.dbName === undefined ? "hrms-t1" : over.dbName,
      },
      { id: T2, isActive: true, dbName: "hrms-t2" },
    ],
    tenantMembership:
      over.membership === null
        ? []
        : [
            {
              id: "m",
              tenantId: T1,
              userId: U,
              role: over.membership ?? "admin",
            },
          ],
  });
}

describe("checkAccountAccess", () => {
  it("returns the CURRENT membership role and tenant database", async () => {
    seed({ membership: "hr" });
    await expect(checkAccountAccess(U, T1)).resolves.toEqual({
      ok: true,
      tenantRole: "hr",
      dbName: "hrms-t1",
      employeeStatus: "Active",
    });
  });

  it.each(["Terminated", "Absconded", "Resigned"])(
    "denies %s",
    async (status) => {
      seed({ status });
      await expect(checkAccountAccess(U, T1)).resolves.toMatchObject({
        ok: false,
        reason: "blocked_status",
      });
      // Even with no organisation (org-setup token).
      await expect(checkAccountAccess(U, null)).resolves.toMatchObject({
        ok: false,
        reason: "blocked_status",
      });
    },
  );

  it("denies a tenant the user holds no membership in (cross-tenant)", async () => {
    seed();
    await expect(checkAccountAccess(U, T2)).resolves.toEqual({
      ok: false,
      reason: "no_membership",
    });
  });

  it("denies a removed member", async () => {
    seed({ membership: null });
    await expect(checkAccountAccess(U, T1)).resolves.toEqual({
      ok: false,
      reason: "no_membership",
    });
  });

  it.each([
    ["deactivated", { tenantActive: false }],
    ["without a database", { dbName: null }],
  ])("denies an organisation %s", async (_l, over) => {
    seed(over as any);
    await expect(checkAccountAccess(U, T1)).resolves.toEqual({
      ok: false,
      reason: "tenant_inactive",
    });
  });

  it("denies a deleted user", async () => {
    seed();
    await expect(
      checkAccountAccess("d00000000000000000000009", T1),
    ).resolves.toEqual({
      ok: false,
      reason: "user_not_found",
    });
  });

  it("allows Pending (onboarding) and Active, with no organisation", async () => {
    for (const status of ["Pending", "Active"]) {
      seed({ status });
      await expect(checkAccountAccess(U, null)).resolves.toMatchObject({
        ok: true,
        tenantRole: null,
      });
    }
  });

  it("isBlockedEmployeeStatus matches the shared list", () => {
    expect(
      ["Terminated", "Absconded", "Resigned"].every(isBlockedEmployeeStatus),
    ).toBe(true);
    expect(isBlockedEmployeeStatus("Active")).toBe(false);
    expect(isBlockedEmployeeStatus(null)).toBe(false);
  });
});
