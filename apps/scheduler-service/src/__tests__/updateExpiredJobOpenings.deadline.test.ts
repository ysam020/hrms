/**
 * Deadline-day semantics of the job-opening expiry job, run through @hrms/db's
 * real tenant routing over the in-memory PrismaClient. "Apply by D" must keep
 * the opening open through all of D, exactly like the careers page and
 * applyForJob, for deadlines stored as IST midnight and as UTC midnight.
 */
jest.mock(
  "@prisma/client",
  () => require("@hrms/db/testing").prismaClientModule,
);

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn().mockResolvedValue(undefined) },
}));

import {
  MASTER_DB,
  readTable,
  resetDatabases,
  seedDatabase,
} from "@hrms/db/testing";
import {
  updateExpiredJobOpenings,
  jobOpeningExpiryCutoff,
} from "../jobs/updateExpiredJobOpenings";
// The careers page's own rule — the expiry job must never disagree with it.
// Required at runtime rather than imported: it lives outside this
// package's rootDir, which the service's tsc build would reject.
const { isPastDeadline } = jest.requireActual(
  "../../../api-gateway/src/utils/jobDeadline",
) as { isPastDeadline: (deadline: Date) => boolean };

const TENANT = "aaaaaaaaaaaaaaaaaaaaaaaa";
const DB = "tenant_a_db";
const OPENING_ID = "0be000000000000000000001";

// "Apply by 10 Mar 2026", stored the two ways the form sends it.
const IST_MIDNIGHT = new Date("2026-03-09T18:30:00Z"); // 10 Mar 00:00 IST
const UTC_MIDNIGHT = new Date("2026-03-10T00:00:00Z"); // 10 Mar 05:30 IST

// Wall-clock instants, written in IST (the container's TZ and the cron's).
const at = (ist: string) => new Date(`${ist}+05:30`);

async function statusAfterRun(deadline: Date, now: Date): Promise<string> {
  resetDatabases();
  seedDatabase(MASTER_DB, {
    tenant: [{ id: TENANT, isActive: true, dbName: DB }],
  });
  seedDatabase(DB, {
    jobOpening: [
      { id: OPENING_ID, status: "Active", applicationDeadline: deadline },
    ],
  });
  jest.setSystemTime(now);
  await updateExpiredJobOpenings();
  return readTable(DB, "jobOpening")[0].status;
}

describe("job-opening expiry deadline boundary", () => {
  beforeAll(() => {
    process.env.DEV_MONGODB_URI = "mongodb://fake-host/master";
  });
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("deadline stored as IST midnight", () => {
    it("stays open at the 01:00 IST cron on the deadline day", async () => {
      expect(
        await statusAfterRun(IST_MIDNIGHT, at("2026-03-10T01:00:00")),
      ).toBe("Active");
    });

    it("stays open through the last minute of the deadline day", async () => {
      expect(
        await statusAfterRun(IST_MIDNIGHT, at("2026-03-10T23:59:59")),
      ).toBe("Active");
    });

    it("closes at the 01:00 IST cron on the following day", async () => {
      expect(
        await statusAfterRun(IST_MIDNIGHT, at("2026-03-11T01:00:00")),
      ).toBe("Expired");
    });
  });

  describe("deadline stored as UTC midnight (05:30 IST)", () => {
    it("stays open at the 01:00 IST cron on the deadline day and the day after", async () => {
      expect(
        await statusAfterRun(UTC_MIDNIGHT, at("2026-03-10T01:00:00")),
      ).toBe("Active");
      // 24 h after the stored instant is 05:30 IST on 11 Mar — the careers
      // page still lists it at 01:00, so the job must not close it yet.
      expect(
        await statusAfterRun(UTC_MIDNIGHT, at("2026-03-11T01:00:00")),
      ).toBe("Active");
    });

    it("closes exactly when the careers page stops listing it, and at the next cron after", async () => {
      expect(
        await statusAfterRun(UTC_MIDNIGHT, at("2026-03-11T05:29:59")),
      ).toBe("Active");
      expect(
        await statusAfterRun(UTC_MIDNIGHT, at("2026-03-11T05:30:00")),
      ).toBe("Expired");
      expect(
        await statusAfterRun(UTC_MIDNIGHT, at("2026-03-12T01:00:00")),
      ).toBe("Expired");
    });
  });

  it("agrees with the careers page's isPastDeadline at every boundary instant", () => {
    const instants = [
      at("2026-03-10T00:00:00"),
      at("2026-03-10T01:00:00"),
      at("2026-03-10T23:59:59"),
      at("2026-03-11T00:00:00"),
      at("2026-03-11T01:00:00"),
      at("2026-03-11T05:29:59"),
      at("2026-03-11T05:30:00"),
      at("2026-03-12T01:00:00"),
    ];
    for (const deadline of [IST_MIDNIGHT, UTC_MIDNIGHT]) {
      for (const now of instants) {
        jest.setSystemTime(now);
        const expiredByJob =
          deadline.getTime() <= jobOpeningExpiryCutoff(now).getTime();
        expect([
          deadline.toISOString(),
          now.toISOString(),
          expiredByJob,
        ]).toEqual([
          deadline.toISOString(),
          now.toISOString(),
          isPastDeadline(deadline),
        ]);
      }
    }
  });
});
