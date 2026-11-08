/**
 * Two-tenant integration test for the tenant-scoped scheduler jobs.
 *
 * Runs @hrms/db's real tenant routing (runWithTenant, prismaWithTenant, the
 * tenant filter on master `user` queries, the tenant client pool,
 * runForTenant) over an in-memory PrismaClient with one database per
 * tenant. The two tenants deliberately reuse the same record ids and ticket
 * numbers, and the master database holds decoy rows that a job reading the
 * master client (the previous behaviour) would have touched.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn().mockResolvedValue(undefined) },
  getRedisClient: () => require("./support/fakeRedis").fakeRedis,
}));

import { notify } from "@hrms/notifications";
import { cacheManager } from "@hrms/cache";
import {
  MASTER_DB,
  readTable,
  resetDatabases,
  seedDatabase,
} from "@hrms/db/testing";
import { checkTicketSla } from "../jobs/checkTicketSla";
import { updateExpiredHrActivities } from "../jobs/updateExpiredHrActivities";
import { updateExpiredJobOpenings } from "../jobs/updateExpiredJobOpenings";

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const TENANT_INACTIVE = "dddddddddddddddddddddddd";
const DB_A = "tenant_a_db";
const DB_B = "tenant_b_db";
const DB_INACTIVE = "tenant_inactive_db";

const USER_A = "a00000000000000000000001";
const USER_B = "b00000000000000000000001";

// Same ids in both tenants' databases — the overlap a master-DB or
// unscoped query would confuse.
const SHARED_TICKET_ID = "5ec000000000000000000001";
const SHARED_ACTIVITY_ID = "ac0000000000000000000001";
const SHARED_OPENING_ID = "0be000000000000000000001";

const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2099-01-01T00:00:00Z");
// Overdue recently enough to notify about — older ones are flagged
// silently (see backlogNotifications.ts), and these tests are about who
// gets notified.
const recent = new Date(Date.now() - 60 * 60 * 1000);

const overdueTicket = (assignedTo: string, raisedBy: string) => ({
  id: SHARED_TICKET_ID,
  ticketNo: "HD-0001",
  priority: "high",
  status: "open",
  slaBreached: false,
  slaDeadline: recent,
  assignedTo,
  raisedBy,
});

const mockNotify = notify as jest.Mock;

function seed() {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [
      { id: TENANT_A, isActive: true, dbName: DB_A },
      { id: TENANT_B, isActive: true, dbName: DB_B },
      { id: TENANT_INACTIVE, isActive: false, dbName: DB_INACTIVE },
    ],
    user: [
      { id: USER_A, tenantId: TENANT_A, username: "alice" },
      { id: USER_B, tenantId: TENANT_B, username: "bob" },
    ],
    // Decoys: business rows in the master database. Nothing may touch them.
    ticket: [{ ...overdueTicket(USER_A, USER_A), tenantId: TENANT_A }],
    hrActivity: [
      {
        id: SHARED_ACTIVITY_ID,
        status: "Active",
        scheduledAt: recent,
        title: "decoy",
        createdBy: USER_A,
      },
    ],
    jobOpening: [
      { id: SHARED_OPENING_ID, status: "Active", applicationDeadline: past },
    ],
  });
  seedDatabase(DB_A, {
    // Tenant A's ticket is (wrongly) assigned to tenant B's user — a
    // cross-tenant reference the notification must not follow.
    ticket: [overdueTicket(USER_B, USER_A)],
    hrActivity: [
      {
        id: SHARED_ACTIVITY_ID,
        status: "Active",
        scheduledAt: recent,
        title: "A offsite",
        createdBy: USER_A,
      },
    ],
    jobOpening: [
      { id: SHARED_OPENING_ID, status: "Active", applicationDeadline: past },
    ],
  });
  seedDatabase(DB_B, {
    ticket: [overdueTicket(USER_B, USER_B)],
    hrActivity: [
      {
        id: SHARED_ACTIVITY_ID,
        status: "Active",
        scheduledAt: future,
        title: "B later",
        createdBy: USER_B,
      },
    ],
    jobOpening: [
      { id: SHARED_OPENING_ID, status: "Active", applicationDeadline: future },
    ],
  });
  seedDatabase(DB_INACTIVE, {
    jobOpening: [
      { id: SHARED_OPENING_ID, status: "Active", applicationDeadline: past },
    ],
  });
}

const masterUntouched = () => {
  expect(readTable(MASTER_DB, "ticket")[0].slaBreached).toBe(false);
  expect(readTable(MASTER_DB, "hrActivity")[0].status).toBe("Active");
  expect(readTable(MASTER_DB, "jobOpening")[0].status).toBe("Active");
};

describe("scheduler jobs across two tenants (real tenant routing, in-memory databases)", () => {
  beforeAll(() => {
    process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";
  });
  beforeEach(() => {
    jest.clearAllMocks();
    seed();
  });

  describe("checkTicketSla sweep", () => {
    it("breaches each tenant's own overdue ticket and never the master decoy", async () => {
      await checkTicketSla();

      expect(readTable(DB_A, "ticket")[0].slaBreached).toBe(true);
      expect(readTable(DB_B, "ticket")[0].slaBreached).toBe(true);
      masterUntouched();
    });

    it("notifies only users of the ticket's own tenant, even when a ticket references another tenant's user", async () => {
      await checkTicketSla();

      const calls = mockNotify.mock.calls.map(([o]) => o);
      const forA = calls.find((o) => o.tenantId === TENANT_A);
      const forB = calls.find((o) => o.tenantId === TENANT_B);
      // Tenant A's ticket names USER_B as assignee; the tenant-scoped user
      // lookup drops them, leaving only tenant A's raiser.
      expect(forA.recipients).toEqual([USER_A]);
      expect(forB.recipients).toEqual([USER_B]);
      expect(calls).toHaveLength(2);
    });
  });

  describe("checkTicketSla targeted job", () => {
    it("with a tenantId, breaches only that tenant's ticket even though the other tenant has the same ticket id", async () => {
      await checkTicketSla({ ticketId: SHARED_TICKET_ID, tenantId: TENANT_B });

      expect(readTable(DB_B, "ticket")[0].slaBreached).toBe(true);
      expect(readTable(DB_A, "ticket")[0].slaBreached).toBe(false);
      masterUntouched();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify.mock.calls[0][0]).toMatchObject({
        tenantId: TENANT_B,
        recipients: [USER_B],
      });
    });

    it("a legacy job without tenantId is resolved to the tenant holding the ticket, not dropped", async () => {
      seedDatabase(DB_A, { ticket: [] });
      await checkTicketSla({ ticketId: SHARED_TICKET_ID });

      expect(readTable(DB_B, "ticket")[0].slaBreached).toBe(true);
      masterUntouched();
    });

    it("fails visibly for an unknown tenant and writes nothing", async () => {
      await expect(
        checkTicketSla({
          ticketId: SHARED_TICKET_ID,
          tenantId: "eeeeeeeeeeeeeeeeeeeeeeee",
        }),
      ).rejects.toMatchObject({ name: "TenantContextError" });

      expect(readTable(DB_A, "ticket")[0].slaBreached).toBe(false);
      expect(readTable(DB_B, "ticket")[0].slaBreached).toBe(false);
      masterUntouched();
    });

    it("fails visibly for a tenant without its own database instead of using the master database", async () => {
      seedDatabase(MASTER_DB, {
        tenant: [{ id: TENANT_A, isActive: true, dbName: null }],
      });
      await expect(
        checkTicketSla({ ticketId: SHARED_TICKET_ID, tenantId: TENANT_A }),
      ).rejects.toThrow(/has no resolvable database/);
      masterUntouched();
    });
  });

  describe("updateExpiredHrActivities", () => {
    it("expires only the tenant whose activity is past, with the same id present in both", async () => {
      await updateExpiredHrActivities();

      expect(readTable(DB_A, "hrActivity")[0].status).toBe("Expired");
      expect(readTable(DB_B, "hrActivity")[0].status).toBe("Active");
      masterUntouched();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify.mock.calls[0][0]).toMatchObject({
        tenantId: TENANT_A,
        recipients: [USER_A],
      });
      expect(cacheManager.invalidatePattern).toHaveBeenCalledWith(
        `t:${TENANT_A}:hrActivities:*`,
      );
      expect(cacheManager.invalidatePattern).not.toHaveBeenCalledWith(
        `t:${TENANT_B}:hrActivities:*`,
      );
    });

    it("does not notify an owner id that belongs to another tenant", async () => {
      seedDatabase(DB_A, {
        hrActivity: [
          {
            id: SHARED_ACTIVITY_ID,
            status: "Active",
            scheduledAt: recent,
            title: "x",
            createdBy: USER_B,
          },
        ],
      });
      await updateExpiredHrActivities();

      expect(readTable(DB_A, "hrActivity")[0].status).toBe("Expired");
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe("updateExpiredJobOpenings", () => {
    it("expires per tenant, skips inactive tenants, and leaves the master decoy alone", async () => {
      await updateExpiredJobOpenings();

      expect(readTable(DB_A, "jobOpening")[0].status).toBe("Expired");
      expect(readTable(DB_B, "jobOpening")[0].status).toBe("Active");
      expect(readTable(DB_INACTIVE, "jobOpening")[0].status).toBe("Active");
      masterUntouched();
      expect(cacheManager.invalidatePattern).toHaveBeenCalledWith(
        `t:${TENANT_A}:jobOpenings:*`,
      );
    });

    it("still processes the other tenants when one has no database, then fails the job visibly", async () => {
      seedDatabase(MASTER_DB, {
        tenant: [
          { id: TENANT_A, isActive: true, dbName: null },
          { id: TENANT_B, isActive: true, dbName: DB_B },
        ],
      });
      seedDatabase(DB_B, {
        jobOpening: [
          {
            id: SHARED_OPENING_ID,
            status: "Active",
            applicationDeadline: past,
          },
        ],
      });

      await expect(updateExpiredJobOpenings()).rejects.toMatchObject({
        name: "TenantJobError",
        failures: [{ tenantId: TENANT_A, error: "no tenant database" }],
      });
      expect(readTable(DB_B, "jobOpening")[0].status).toBe("Expired");
      masterUntouched();
    });
  });
});
