// These suites test the job's logic when it IS enabled (behind its off-by-default gate).
process.env.ATTENDANCE_RECONCILE_ENABLED = "true";
/**
 * Attendance reconciliation must never delete or overwrite leave
 * entitlements it doesn't own.
 *
 * Uses a small stateful store (in this file) that behaves like the parts of
 * Prisma the job relies on: rows keep an `updatedAt` that every write bumps
 * (Prisma's @updatedAt), and `updateMany({ where: { id, updatedAt } })` only
 * matches the row if it hasn't changed since it was read — so lost races and
 * concurrent debits are modelled faithfully.
 *
 * The "named balances survive" and "concurrent debit survives" tests FAIL on
 * the pre-fix code (364d2fb) — see REGRESSION_TESTS.md.
 */
type Row = Record<string, any>;
const store: Record<string, Row[]> = {};
let clock = 1;
const tick = () => new Date(Date.UTC(2026, 0, 1) + clock++ * 1000);
const table = (m: string) => (store[m] ??= []);
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("gte" in v || "lte" in v)
        return (
          (!("gte" in v) || row[k] >= v.gte) &&
          (!("lte" in v) || row[k] <= v.lte)
        );
      if ("in" in v) return v.in.includes(row[k]);
      return true;
    }
    if (v instanceof Date)
      return row[k] instanceof Date && row[k].getTime() === v.getTime();
    return row[k] === v;
  });

/** Hook to simulate a concurrent writer between the job's read and write. */
const beforeBalanceWrite: { fn: null | (() => void) } = { fn: null };

const model = (m: string) => ({
  findMany: async ({ where }: Row = {}) =>
    table(m)
      .filter((r) => matches(r, where))
      .map((r) => ({ ...r })),
  findFirst: async ({ where }: Row = {}) => {
    const r = table(m).find((x) => matches(x, where));
    return r
      ? JSON.parse(JSON.stringify(r), (k, v) =>
          k === "updatedAt" ? new Date(v) : v,
        )
      : null;
  },
  create: async ({ data }: Row) => {
    const row = {
      id: `${m}-${table(m).length + 1}`,
      ...data,
      updatedAt: tick(),
    };
    table(m).push(row);
    return { ...row };
  },
  createMany: async ({ data }: Row) => {
    for (const d of data)
      table(m).push({
        id: `${m}-${table(m).length + 1}`,
        ...d,
        updatedAt: tick(),
      });
    return { count: data.length };
  },
  updateMany: async ({ where, data }: Row) => {
    if (m === "leaveBalance" && beforeBalanceWrite.fn) {
      const fn = beforeBalanceWrite.fn;
      beforeBalanceWrite.fn = null;
      fn();
    }
    const rows = table(m).filter((r) => matches(r, where));
    for (const r of rows) Object.assign(r, data, { updatedAt: tick() });
    return { count: rows.length };
  },
  // Behaves like Prisma's upsert on (tenantId, userId) — what the pre-fix
  // code used — so a run against that code shows its real effect.
  upsert: async ({ where, update, create }: Row) => {
    const key = where.tenantId_userId ?? where;
    const row = table(m).find((r) => matches(r, key));
    if (row) {
      Object.assign(row, update, { updatedAt: tick() });
      return { ...row };
    }
    const created = {
      id: `${m}-${table(m).length + 1}`,
      ...create,
      updatedAt: tick(),
    };
    table(m).push(created);
    return { ...created };
  },
});

const mockDb: any = new Proxy(
  {
    $transaction: (fn: (tx: unknown) => unknown) => fn(mockDb),
  },
  { get: (t: any, p: string) => (p in t ? t[p] : model(p)) },
);

jest.mock("@hrms/db", () => ({
  prisma: mockDb,
  prismaWithTenant: mockDb,
  getClientForDb: () => ({}),
  getTenantId: () => "t1",
  runWithTenant: (_t: string, _c: unknown, fn: () => unknown) => fn(),
}));
jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn() },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  reconcileAttendance,
  mergeLedger,
  ledgerEntries,
} from "../jobs/reconcileAttendance";

const NAMED = { CL: 5, SL: 7, EL: 12 };

function seed(balances: unknown, accumulated = 0) {
  for (const k of Object.keys(store)) delete store[k];
  clock = 1;
  table("user").push({ id: "u1", tenantId: "t1", employeeStatus: "Active" });
  table("tenant").push({ id: "t1", dbName: "hrms-t1" });
  table("leaveBalance").push({
    id: "lb1",
    tenantId: "t1",
    userId: "u1",
    accumulatedPLBeforeCurrentMonth: accumulated,
    balances,
    updatedAt: tick(),
  });
}
const balanceRow = () => table("leaveBalance")[0];

beforeEach(() => {
  // Tuesday 2026-11-10 00:15 UTC → reconciles Monday 2026-11-09 (a working
  // day with no attendance record → one PL/LWP day charged).
  jest
    .useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] })
    .setSystemTime(new Date("2026-11-10T00:15:00Z"));
  beforeBalanceWrite.fn = null;
});
afterEach(() => jest.useRealTimers());

describe("Named leave entitlements survive reconciliation", () => {
  it("keeps CL, SL and EL exactly, and records the ledger alongside", async () => {
    seed({ ...NAMED });
    await reconcileAttendance();
    const b = balanceRow().balances;
    expect(b).toMatchObject(NAMED); // pre-fix: the row became an array → all three gone
    const ledger = ledgerEntries(b);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ month: 11, year: 2026 });
  });

  it("keeps named keys on a hybrid row (ledger entries + entitlements)", async () => {
    seed({
      "0": {
        month: 10,
        year: 2026,
        earnedPL: 1,
        usedPL: 1,
        usedLWP: 0,
        remainingPL: 0,
      },
      ...NAMED,
    });
    await reconcileAttendance();
    const b = balanceRow().balances;
    expect(b).toMatchObject(NAMED);
    expect(ledgerEntries(b).map((e) => e.month)).toEqual([10, 11]);
  });

  it("leaves a pure ledger (array) row an array", async () => {
    seed([]);
    await reconcileAttendance();
    expect(Array.isArray(balanceRow().balances)).toBe(true);
    expect(balanceRow().balances).toHaveLength(1);
  });

  it("does not lose a leave-approval debit that lands between its read and write", async () => {
    seed({ ...NAMED });
    // leave-service's adjustBalance debits CL while the job is mid-flight.
    beforeBalanceWrite.fn = () => {
      const row = balanceRow();
      row.balances = { ...row.balances, CL: 4 };
      row.updatedAt = tick();
    };
    await reconcileAttendance();
    expect(balanceRow().balances.CL).toBe(4); // pre-fix: overwritten (and deleted)
    expect(balanceRow().balances).toMatchObject({ SL: 7, EL: 12 });
    expect(ledgerEntries(balanceRow().balances)).toHaveLength(1);
  });

  it("is idempotent: a second run for the same day changes nothing", async () => {
    seed({ ...NAMED });
    await reconcileAttendance();
    const after1 = JSON.stringify(balanceRow().balances);
    const apps1 = table("leaveApplication").length;
    const recs1 = table("attendanceRecord").length;
    await reconcileAttendance();
    expect(JSON.stringify(balanceRow().balances)).toBe(after1);
    expect(table("leaveApplication").length).toBe(apps1);
    expect(table("attendanceRecord").length).toBe(recs1);
  });

  it("writes nothing for the employee when the balance row keeps changing (retried next run)", async () => {
    seed({ ...NAMED });
    // Every write attempt loses the race: the row changes before each one.
    let attempts = 0;
    const bump = () => {
      attempts++;
      balanceRow().updatedAt = tick();
      beforeBalanceWrite.fn = bump;
    };
    beforeBalanceWrite.fn = bump;
    await reconcileAttendance(); // the job logs the per-employee error and continues
    beforeBalanceWrite.fn = null;
    expect(attempts).toBe(5);
    expect(balanceRow().balances).toEqual(NAMED); // untouched
    expect(table("leaveApplication")).toHaveLength(0); // nothing half-written
    expect(table("attendanceRecord")).toHaveLength(0);
  });
});

describe("mergeLedger", () => {
  const e = {
    month: 1,
    year: 2026,
    earnedPL: 1,
    usedPL: 0,
    usedLWP: 0,
    remainingPL: 1,
  };
  it("keeps every non-ledger key and replaces only numbered ledger keys", () => {
    expect(
      mergeLedger({ CL: 2, "0": { stale: true }, "1": { stale: true } }, [e]),
    ).toEqual({
      CL: 2,
      "0": e,
    });
  });
  it("returns the ledger as an array for array / empty / missing rows", () => {
    expect(mergeLedger([], [e])).toEqual([e]);
    expect(mergeLedger({}, [e])).toEqual([e]);
    expect(mergeLedger(null, [e])).toEqual([e]);
  });
});
