/**
 * First-run backlog protection for the notifying scheduler jobs, through
 * @hrms/db's real tenant routing over the in-memory PrismaClient: records
 * that became due long ago change state silently, recent ones notify, at
 * most a per-tenant cap per run, and records over the cap are left for the
 * next run instead of being lost.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);

const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
jest.mock("@hrms/logger", () => ({ logger: mockLogger }));

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
import { fakeRedis, resetFakeRedis } from "./support/fakeRedis";
import { checkTicketSla } from "../jobs/checkTicketSla";
import { updateExpiredHrActivities } from "../jobs/updateExpiredHrActivities";
import { backlogNotificationSettings } from "../utils/backlogNotifications";

const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const DB_A = "tenant_a_db";
const DB_B = "tenant_b_db";
const USER_A = "a00000000000000000000001";
const USER_B = "b00000000000000000000001";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-07T04:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

const mockNotify = notify as jest.Mock;
const ticketId = (tenant: string, n: number) =>
  `${tenant.slice(0, 4)}${String(n).padStart(20, "0")}`;

function ticket(tenant: string, n: number, deadline: Date, user: string) {
  return {
    id: ticketId(tenant, n),
    ticketNo: `HD-${n}`,
    priority: "medium",
    status: "open",
    slaBreached: false,
    slaDeadline: deadline,
    raisedBy: user,
    assignedTo: null,
  };
}

function activity(n: number, scheduledAt: Date, owner: string) {
  return {
    id: `ac${String(n).padStart(22, "0")}`,
    title: `Activity ${n}`,
    status: "Active",
    scheduledAt,
    createdBy: owner,
  };
}

function seedTenants(a: Record<string, any[]>, b: Record<string, any[]> = {}) {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [
      { id: TENANT_A, isActive: true, dbName: DB_A },
      { id: TENANT_B, isActive: true, dbName: DB_B },
    ],
    user: [
      { id: USER_A, tenantId: TENANT_A, username: "alice" },
      { id: USER_B, tenantId: TENANT_B, username: "bob" },
    ],
  });
  seedDatabase(DB_A, { ticket: [], hrActivity: [], ...a });
  seedDatabase(DB_B, { ticket: [], hrActivity: [], ...b });
}

const breached = (db: string) =>
  readTable(db, "ticket")
    .filter((t) => t.slaBreached)
    .map((t) => t.id);
const notifiedFor = (tenant: string) =>
  mockNotify.mock.calls.filter(([o]) => o.tenantId === tenant).length;
const runLog = (job: string, tenant: string) =>
  [...mockLogger.info.mock.calls, ...mockLogger.warn.mock.calls]
    .filter(([line]) => String(line).startsWith(`${job}: tenant ${tenant}`))
    .map(([, meta]) => meta);

describe("scheduler backlog notification limits", () => {
  beforeAll(() => {
    process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";
  });
  beforeEach(() => {
    jest.clearAllMocks();
    resetFakeRedis();
    delete process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT;
    delete process.env.SCHEDULER_NOTIFY_WINDOW_HOURS;
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("SLA sweep", () => {
    it("flags historical overdue tickets silently and notifies only those overdue within 48 hours", async () => {
      seedTenants({
        ticket: [
          ticket(TENANT_A, 1, hoursAgo(24 * 30), USER_A),
          ticket(TENANT_A, 2, hoursAgo(49), USER_A),
          ticket(TENANT_A, 3, hoursAgo(47), USER_A),
          ticket(TENANT_A, 4, hoursAgo(1), USER_A),
        ],
      });

      await checkTicketSla();

      expect(breached(DB_A)).toHaveLength(4);
      expect(mockNotify.mock.calls.map(([o]) => o.inApp.message)).toEqual([
        expect.stringContaining("HD-3"),
        expect.stringContaining("HD-4"),
      ]);
      expect(runLog("checkTicketSla", TENANT_A)).toEqual([
        expect.objectContaining({
          examined: 4,
          silentlyUpdated: 2,
          notified: 2,
          deferred: 0,
          notNotified: 0,
        }),
      ]);
    });

    it("caps notifications per tenant, leaves the rest unchanged for the next run, and never lets one tenant use another's allowance", async () => {
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "2";
      seedTenants(
        {
          ticket: [1, 2, 3, 4, 5].map((n) =>
            ticket(TENANT_A, n, hoursAgo(10 - n), USER_A),
          ),
        },
        { ticket: [ticket(TENANT_B, 1, hoursAgo(1), USER_B)] },
      );

      await checkTicketSla();

      // Oldest first; the three over the cap keep their state.
      expect(breached(DB_A)).toEqual([
        ticketId(TENANT_A, 1),
        ticketId(TENANT_A, 2),
      ]);
      expect(notifiedFor(TENANT_A)).toBe(2);
      // Tenant A's backlog doesn't reduce tenant B's allowance.
      expect(breached(DB_B)).toEqual([ticketId(TENANT_B, 1)]);
      expect(notifiedFor(TENANT_B)).toBe(1);
      expect(runLog("checkTicketSla", TENANT_A)[0]).toMatchObject({
        examined: 5,
        notified: 2,
        deferred: 3,
      });
      expect(
        await fakeRedis.smembers(
          `scheduler:notify-owed:checkTicketSla:${TENANT_A}`,
        ),
      ).toHaveLength(3);
      expect(
        await fakeRedis.smembers(
          `scheduler:notify-owed:checkTicketSla:${TENANT_B}`,
        ),
      ).toHaveLength(0);
    });

    it("still notifies deferred tickets on later runs after they have aged out of the window — none are lost", async () => {
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "2";
      seedTenants({
        ticket: [1, 2, 3, 4, 5].map((n) =>
          ticket(TENANT_A, n, hoursAgo(10 - n), USER_A),
        ),
      });

      await checkTicketSla();
      // Next daily runs: by now the deferred tickets are > 48 h overdue.
      jest.setSystemTime(new Date(NOW.getTime() + 72 * HOUR));
      await checkTicketSla();
      jest.setSystemTime(new Date(NOW.getTime() + 96 * HOUR));
      await checkTicketSla();

      expect(breached(DB_A)).toHaveLength(5);
      const messages = mockNotify.mock.calls.map(([o]) => o.inApp.message);
      expect(messages).toHaveLength(5);
      for (const n of [1, 2, 3, 4, 5]) {
        expect(
          messages.filter((m: string) => m.includes(`HD-${n} `)),
        ).toHaveLength(1);
      }
    });

    it("drops a deferred ticket from the owed list once it is no longer overdue", async () => {
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "1";
      seedTenants({
        ticket: [1, 2].map((n) =>
          ticket(TENANT_A, n, hoursAgo(10 - n), USER_A),
        ),
      });
      await checkTicketSla();
      expect(breached(DB_A)).toEqual([ticketId(TENANT_A, 1)]);

      // Resolved by a person before the next run.
      seedDatabase(DB_A, {
        ticket: [
          { ...ticket(TENANT_A, 1, hoursAgo(9), USER_A), slaBreached: true },
          { ...ticket(TENANT_A, 2, hoursAgo(8), USER_A), status: "resolved" },
        ],
      });
      mockNotify.mockClear();
      await checkTicketSla();

      expect(mockNotify).not.toHaveBeenCalled();
      expect(
        await fakeRedis.smembers(
          `scheduler:notify-owed:checkTicketSla:${TENANT_A}`,
        ),
      ).toEqual([]);
    });

    it("fails the tenant visibly and changes nothing when the owed list can't be read", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(1), USER_A)] });
      const spy = jest
        .spyOn(fakeRedis, "smembers")
        .mockRejectedValueOnce(new Error("redis down"));

      await expect(checkTicketSla()).rejects.toMatchObject({
        name: "TenantJobError",
      });
      expect(breached(DB_A)).toEqual([]);
      expect(mockNotify).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("records changed by a person while the job runs", () => {
    // The planner's Redis read happens between the job's read and its
    // writes — the window in which a person can resolve or complete a record.
    const duringRun = (change: () => void) => {
      const original = fakeRedis.smembers;
      jest.spyOn(fakeRedis, "smembers").mockImplementationOnce(async (key) => {
        change();
        return original(key);
      });
    };

    it("does not flag or notify a ticket resolved after the sweep read it", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(1), USER_A)] });
      duringRun(() =>
        seedDatabase(DB_A, {
          ticket: [
            { ...ticket(TENANT_A, 1, hoursAgo(1), USER_A), status: "resolved" },
          ],
        }),
      );

      await checkTicketSla();

      expect(breached(DB_A)).toEqual([]);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("does not flag a ticket whose deadline was extended after the sweep read it", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(1), USER_A)] });
      duringRun(() =>
        seedDatabase(DB_A, {
          ticket: [ticket(TENANT_A, 1, new Date(NOW.getTime() + HOUR), USER_A)],
        }),
      );

      await checkTicketSla();

      expect(breached(DB_A)).toEqual([]);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("does not expire or notify an activity completed after the job read it", async () => {
      seedTenants({ hrActivity: [activity(1, hoursAgo(2), USER_A)] });
      duringRun(() =>
        seedDatabase(DB_A, {
          hrActivity: [
            { ...activity(1, hoursAgo(2), USER_A), status: "Completed" },
          ],
        }),
      );

      await updateExpiredHrActivities();

      expect(readTable(DB_A, "hrActivity")[0].status).toBe("Completed");
      expect(mockNotify).not.toHaveBeenCalled();
      expect(cacheManager.invalidatePattern).not.toHaveBeenCalled();
    });
  });

  describe("concurrent executions", () => {
    const notifiedTickets = () =>
      mockNotify.mock.calls.map(([o]) => /HD-(\d+)/.exec(o.inApp.message)![1]);

    it("two sweeps running at once notify each overdue ticket exactly once", async () => {
      seedTenants({
        ticket: [1, 2, 3].map((n) => ticket(TENANT_A, n, hoursAgo(n), USER_A)),
      });

      await Promise.all([checkTicketSla(), checkTicketSla()]);

      expect(breached(DB_A)).toHaveLength(3);
      expect(notifiedTickets().sort()).toEqual(["1", "2", "3"]);
    });

    it("concurrent sweeps stay within the per-tenant cap between them, and the rest stay deferred", async () => {
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "2";
      seedTenants({
        ticket: [1, 2, 3, 4, 5].map((n) =>
          ticket(TENANT_A, n, hoursAgo(10 - n), USER_A),
        ),
      });

      await Promise.all([checkTicketSla(), checkTicketSla()]);

      expect(mockNotify).toHaveBeenCalledTimes(2);
      expect(breached(DB_A)).toHaveLength(2);
      // The three over the cap are untouched and still owed.
      expect(
        await fakeRedis.smembers(
          `scheduler:notify-owed:checkTicketSla:${TENANT_A}`,
        ),
      ).toHaveLength(3);
    });

    it("the sweep and a ticket's own SLA job racing each other notify once", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(0), USER_A)] });

      await Promise.all([
        checkTicketSla(),
        checkTicketSla({ ticketId: ticketId(TENANT_A, 1), tenantId: TENANT_A }),
      ]);

      expect(breached(DB_A)).toHaveLength(1);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("two HR-activity runs at once expire and notify each activity once", async () => {
      seedTenants({
        hrActivity: [1, 2].map((n) => activity(n, hoursAgo(n), USER_A)),
      });

      await Promise.all([
        updateExpiredHrActivities(),
        updateExpiredHrActivities(),
      ]);

      expect(
        readTable(DB_A, "hrActivity").every((a) => a.status === "Expired"),
      ).toBe(true);
      expect(mockNotify).toHaveBeenCalledTimes(2);
    });

    it("logs what was selected, what was actually changed, and what was notified as separate counts", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(1), USER_A)] });
      await Promise.all([checkTicketSla(), checkTicketSla()]);

      const runs = runLog("checkTicketSla", TENANT_A);
      // Both runs selected the ticket; only one changed and notified it,
      // and the other reports it as already changed.
      expect(runs.map((r) => r.examined)).toEqual([1, 1]);
      expect(runs.map((r) => r.notified).sort()).toEqual([0, 1]);
      expect(runs.map((r) => r.alreadyChanged).sort()).toEqual([0, 1]);
    });
  });

  describe("targeted SLA job", () => {
    it("notifies a breach at its deadline", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(0), USER_A)] });
      await checkTicketSla({
        ticketId: ticketId(TENANT_A, 1),
        tenantId: TENANT_A,
      });
      expect(breached(DB_A)).toEqual([ticketId(TENANT_A, 1)]);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("flags without notifying when the job fires long after the deadline", async () => {
      seedTenants({ ticket: [ticket(TENANT_A, 1, hoursAgo(24 * 10), USER_A)] });
      await checkTicketSla({
        ticketId: ticketId(TENANT_A, 1),
        tenantId: TENANT_A,
      });
      expect(breached(DB_A)).toEqual([ticketId(TENANT_A, 1)]);
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe("HR activity expiry", () => {
    it("expires historical activities silently, notifies recent ones, defers over the cap, and invalidates the cache", async () => {
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "1";
      seedTenants({
        hrActivity: [
          activity(1, hoursAgo(24 * 60), USER_A),
          activity(2, hoursAgo(5), USER_A),
          activity(3, hoursAgo(2), USER_A),
        ],
      });

      await updateExpiredHrActivities();

      const status = Object.fromEntries(
        readTable(DB_A, "hrActivity").map((a) => [a.title, a.status]),
      );
      expect(status).toEqual({
        "Activity 1": "Expired", // historical: silent
        "Activity 2": "Expired", // recent, within the cap: notified
        "Activity 3": "Active", // recent, over the cap: deferred
      });
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify.mock.calls[0][0].inApp.message).toContain("Activity 2");
      expect(cacheManager.invalidatePattern).toHaveBeenCalledWith(
        `t:${TENANT_A}:hrActivities:*`,
      );
      expect(runLog("updateExpiredHrActivities", TENANT_A)[0]).toMatchObject({
        examined: 3,
        silentlyUpdated: 1,
        notified: 1,
        deferred: 1,
      });

      jest.setSystemTime(new Date(NOW.getTime() + 72 * HOUR));
      await updateExpiredHrActivities();
      expect(
        readTable(DB_A, "hrActivity").every((a) => a.status === "Expired"),
      ).toBe(true);
      expect(mockNotify).toHaveBeenCalledTimes(2);
      expect(mockNotify.mock.calls[1][0].inApp.message).toContain("Activity 3");
    });
  });

  describe("settings", () => {
    it("defaults to a 48-hour window and 100 notifications per tenant", () => {
      expect(backlogNotificationSettings()).toEqual({
        windowMs: 48 * HOUR,
        capPerTenant: 100,
      });
    });

    it("uses configured values and falls back to the defaults for invalid ones", () => {
      process.env.SCHEDULER_NOTIFY_WINDOW_HOURS = "24";
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "25";
      expect(backlogNotificationSettings()).toEqual({
        windowMs: 24 * HOUR,
        capPerTenant: 25,
      });
      process.env.SCHEDULER_NOTIFY_WINDOW_HOURS = "-1";
      process.env.SCHEDULER_NOTIFY_CAP_PER_TENANT = "lots";
      expect(backlogNotificationSettings()).toEqual({
        windowMs: 48 * HOUR,
        capPerTenant: 100,
      });
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });
});
