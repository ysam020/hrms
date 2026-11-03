import { prisma } from "@hrms/db";
import {
  getActiveSettings,
  writeVersionedSettings,
} from "../handlers/tenantSettings";

// Settings rows live in each tenant's own database; this fake keys them by
// tenantId so one tenant's row can't satisfy another tenant's query.
const rows = new Map<string, any[]>();

jest.mock("@hrms/db", () => {
  const byTenant = (where: any) =>
    (rows.get(where.tenantId) ?? []).filter((r) => {
      const at = r.effectiveFrom.getTime();
      const lte = where.effectiveFrom?.lte?.getTime();
      const gt = where.effectiveFrom?.gt?.getTime();
      if (lte !== undefined && at > lte) return false;
      if (gt !== undefined && at <= gt) return false;
      if (where.effectiveFrom instanceof Date)
        return at === where.effectiveFrom.getTime();
      return true;
    });
  const sorted = (list: any[], dir: string) =>
    [...list].sort((a, b) =>
      dir === "desc"
        ? b.effectiveFrom - a.effectiveFrom
        : a.effectiveFrom - b.effectiveFrom,
    );
  const _db = {
    tenantSettings: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const list = sorted(byTenant(where), orderBy?.effectiveFrom ?? "desc");
        return list[0] ? { ...list[0] } : null;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }: any) =>
        sorted(byTenant(where), orderBy?.effectiveFrom ?? "asc").slice(
          0,
          take ?? undefined,
        ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `s${Math.random()}`, createdAt: new Date(), ...data };
        rows.set(data.tenantId, [...(rows.get(data.tenantId) ?? []), row]);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        for (const list of rows.values()) {
          const row = list.find((r) => r.id === where.id);
          if (row) return Object.assign(row, data);
        }
        throw new Error("not found");
      }),
    },
  };
  return { prisma: _db, prismaWithTenant: _db, getTenantId: jest.fn() };
});

// A cache that, like Redis, stores JSON — so Date fields come back as
// strings unless the caller restores them.
jest.mock("@hrms/cache", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    cacheManager: {
      getOrSet: jest.fn(async (key: string, load: () => any, opts: any) => {
        if (!opts?.fresh && store.has(key)) return JSON.parse(store.get(key)!);
        const value = await load();
        store.set(key, JSON.stringify(value));
        return value;
      }),
      delete: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const findFirst = (prisma as any).tenantSettings.findFirst as jest.Mock;
const { __store: store } = jest.requireMock("@hrms/cache");

const DAY = 24 * 60 * 60 * 1000;
const seed = (tenantId: string, effectiveFrom: Date, extra: object = {}) => {
  const row = {
    id: `${tenantId}-${effectiveFrom.getTime()}`,
    tenantId,
    effectiveFrom,
    createdAt: new Date("2026-01-01"),
    ...extra,
  };
  rows.set(tenantId, [...(rows.get(tenantId) ?? []), row]);
  return row;
};

describe("getActiveSettings cache", () => {
  beforeEach(() => {
    rows.clear();
    store.clear();
    jest.clearAllMocks();
  });

  it("serves repeat reads from the cache", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });

    await getActiveSettings("t1");
    const again = await getActiveSettings("t1");

    expect(again.paidLeavesPerYear).toBe(12);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("restores Date fields and hands each caller its own copy", async () => {
    seed("t1", new Date(Date.now() - DAY), { workWeekPattern: { days: [1] } });
    await getActiveSettings("t1");

    const a = await getActiveSettings("t1");
    expect(a.effectiveFrom).toBeInstanceOf(Date);
    expect(a.createdAt).toBeInstanceOf(Date);
    a.workWeekPattern.days.push(2);

    expect((await getActiveSettings("t1")).workWeekPattern.days).toEqual([1]);
  });

  it("makes a saved change visible on the next read", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });
    expect((await getActiveSettings("t1")).paidLeavesPerYear).toBe(12);

    await writeVersionedSettings(
      "t1",
      "admin",
      { paidLeavesPerYear: 20 },
      new Date(),
    );

    expect((await getActiveSettings("t1")).paidLeavesPerYear).toBe(20);
  });

  it("never serves one tenant's settings to another", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });
    seed("t2", new Date(Date.now() - DAY), { paidLeavesPerYear: 30 });

    expect((await getActiveSettings("t1")).paidLeavesPerYear).toBe(12);
    expect((await getActiveSettings("t2")).paidLeavesPerYear).toBe(30);
    expect(await getActiveSettings("t3")).toBeNull();
    expect([...store.keys()].sort()).toEqual([
      "t:t1:settings:active",
      "t:t2:settings:active",
      "t:t3:settings:active",
    ]);
  });

  it("switches to a scheduled version once it takes effect, without a write", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });
    seed("t1", new Date(Date.now() + 60_000), { paidLeavesPerYear: 24 });
    expect((await getActiveSettings("t1")).paidLeavesPerYear).toBe(12);

    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    jest.setSystemTime(Date.now() + 2 * 60_000);
    try {
      expect((await getActiveSettings("t1")).paidLeavesPerYear).toBe(24);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a scheduled save drops the cached entry so its time is known", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });
    await getActiveSettings("t1");

    await writeVersionedSettings(
      "t1",
      "admin",
      { paidLeavesPerYear: 24 },
      new Date(Date.now() + DAY),
    );

    expect(store.has("t:t1:settings:active")).toBe(false);
  });

  it("fresh: true reads the database even when cached", async () => {
    seed("t1", new Date(Date.now() - DAY), { paidLeavesPerYear: 12 });
    await getActiveSettings("t1");

    await getActiveSettings("t1", { fresh: true });

    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
