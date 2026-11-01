// In-memory stand-in for the master DB's scheduler_job_leases collection,
// reproducing the MongoDB semantics the lease relies on: _id is unique (a
// duplicate insert returns ok:1 + writeErrors code 11000) and findAndModify
// is atomic.
const store = new Map<string, any>();
const asDate = (v: any) => (v && v.$date ? new Date(v.$date) : v);

function matches(doc: any, q: any): boolean {
  if (q._id !== undefined && doc._id !== q._id) return false;
  if (q.holder !== undefined && doc.holder !== q.holder) return false;
  if (q.$or) {
    return q.$or.some((c: any) => {
      if (c.status !== undefined && doc.status !== c.status) return false;
      if (c.startedAt?.$lt && !(doc.startedAt < asDate(c.startedAt.$lt)))
        return false;
      return true;
    });
  }
  return true;
}

const runCommandRaw = jest.fn(async (cmd: any) => {
  await Promise.resolve(); // yield, so "simultaneous" callers interleave
  if (cmd.insert) {
    const d = cmd.documents[0];
    if (store.has(d._id)) {
      return {
        n: 0,
        ok: 1,
        writeErrors: [
          { index: 0, code: 11000, errmsg: "E11000 duplicate key" },
        ],
      };
    }
    store.set(d._id, { ...d, startedAt: asDate(d.startedAt) });
    return { n: 1, ok: 1 };
  }
  if (cmd.findAndModify) {
    const doc = store.get(cmd.query._id);
    if (!doc || !matches(doc, cmd.query)) return { value: null, ok: 1 };
    const set = cmd.update.$set;
    Object.assign(doc, set, { startedAt: asDate(set.startedAt) });
    doc.attempts += cmd.update.$inc?.attempts ?? 0;
    return { value: { ...doc }, ok: 1 };
  }
  if (cmd.update) {
    const { q, u } = cmd.updates[0];
    const doc = store.get(q._id);
    if (doc && matches(doc, q)) Object.assign(doc, u.$set);
    return { ok: 1 };
  }
  throw new Error("unexpected command");
});

jest.mock("@hrms/db", () => ({
  prisma: { $runCommandRaw: (c: any) => runCommandRaw(c) },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  acquireJobLease,
  releaseJobLease,
  leaseIdFor,
  STALE_LEASE_MS,
} from "../utils/jobLease";

beforeEach(() => {
  store.clear();
  runCommandRaw.mockClear();
});

describe("leaseIdFor", () => {
  const fire = new Date("2026-10-31T19:00:00.000Z"); // 2026-11-01 00:30 IST

  it("scopes the monthly accrual to the calendar month (IST)", () => {
    expect(leaseIdFor("updateLeaveBalance", fire)).toBe(
      "updateLeaveBalance:2026-11",
    );
  });

  it("scopes attendance reconciliation to the day (IST)", () => {
    expect(leaseIdFor("reconcileAttendance", fire)).toBe(
      "reconcileAttendance:2026-11-01",
    );
  });

  it("scopes other jobs to the cron fire minute", () => {
    expect(leaseIdFor("checkSubscriptionExpiry", fire)).toBe(
      "checkSubscriptionExpiry:2026-11-01T00:30",
    );
  });

  it("gives two schedulers firing the same cron the same lease id", () => {
    const a = leaseIdFor(
      "updateLeaveBalance",
      new Date("2026-10-31T19:00:00.038Z"),
    );
    const b = leaseIdFor(
      "updateLeaveBalance",
      new Date("2026-10-31T19:00:00.912Z"),
    );
    expect(a).toBe(b);
  });
});

describe("acquireJobLease", () => {
  it("lets exactly one of two simultaneous schedulers run", async () => {
    const id = "updateLeaveBalance:2026-11";
    const results = await Promise.all([
      acquireJobLease(id),
      acquireJobLease(id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("lets exactly one of many concurrent claimants run", async () => {
    const id = "reconcileAttendance:2026-11-01";
    const results = await Promise.all(
      Array.from({ length: 8 }, () => acquireJobLease(id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("skips a rerun after a completed run (idempotent per period)", async () => {
    const id = "updateLeaveBalance:2026-11";
    expect(await acquireJobLease(id)).toBe(true);
    await releaseJobLease(id, "done");
    expect(await acquireJobLease(id)).toBe(false);
    expect(store.get(id).status).toBe("done");
  });

  it("allows a retry after a failed run, and only one retrier wins", async () => {
    const id = "reconcileAttendance:2026-11-01";
    expect(await acquireJobLease(id)).toBe(true);
    await releaseJobLease(id, "failed", "partial failure");
    const retries = await Promise.all([
      acquireJobLease(id),
      acquireJobLease(id),
    ]);
    expect(retries.filter(Boolean)).toHaveLength(1);
    expect(store.get(id).attempts).toBe(2);
  });

  it("does not take over a lease that is still running (not stale)", async () => {
    const id = "updateLeaveBalance:2026-11";
    const t0 = new Date("2026-10-31T19:00:00Z");
    expect(await acquireJobLease(id, t0)).toBe(true);
    expect(await acquireJobLease(id, new Date(t0.getTime() + 60_000))).toBe(
      false,
    );
  });

  it("takes over an abandoned (stale) running lease", async () => {
    const id = "updateLeaveBalance:2026-11";
    const t0 = new Date("2026-10-31T19:00:00Z");
    expect(await acquireJobLease(id, t0)).toBe(true);
    expect(
      await acquireJobLease(id, new Date(t0.getTime() + STALE_LEASE_MS + 1)),
    ).toBe(true);
  });

  it("surfaces non-duplicate database errors instead of silently skipping", async () => {
    (runCommandRaw as jest.Mock).mockResolvedValueOnce({
      ok: 1,
      writeErrors: [{ code: 121, errmsg: "validation" }],
    });
    await expect(acquireJobLease("x:1")).rejects.toThrow(/insert failed/);
  });
});
