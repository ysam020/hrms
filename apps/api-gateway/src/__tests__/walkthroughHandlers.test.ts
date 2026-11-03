import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import {
  getWalkthroughProgress,
  resetWalkthroughProgress,
  sanitizeWalkthroughState,
  saveWalkthroughProgress,
} from "../handlers/walkthrough";

jest.mock("@hrms/db", () => {
  const _db: any = {
    walkthroughProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("tenant-a"),
  };
});

// A cache that stores what loads produce, so hits, misses and invalidation
// can be observed.
jest.mock("@hrms/cache", () => {
  const store = new Map<string, unknown>();
  return {
    __store: store,
    cacheManager: {
      getOrSet: jest.fn(async (key: string, load: () => unknown) => {
        if (store.has(key)) return store.get(key);
        const value = await load();
        store.set(key, value);
        return value;
      }),
      delete: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: { SUCCESS: 200, BAD_REQUEST: 400 },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/handleError", () => ({
  handleError: jest.fn((res: any) => res.json({ status: 500 })),
}));

const db = prisma as any;

const req = (body: any = {}, user: any = {}) =>
  ({
    body,
    user: { userId: "user-1", tenantId: "tenant-a", ...user },
  }) as any;
const res = () => {
  const r: any = {};
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const valid = () => ({
  schema: 1,
  version: 1,
  active: "app",
  updatedAt: "2026-10-31T10:00:00.000Z",
  tours: {
    app: {
      status: "paused",
      stepId: "leave.form",
      seen: ["welcome.hello", "today.intro"],
      skipped: ["today.punch"],
      lastRoute: "/attendance/apply-leave",
      updatedAt: "2026-10-31T10:00:00.000Z",
    },
  },
});

beforeEach(() => jest.clearAllMocks());

describe("sanitizeWalkthroughState", () => {
  it("keeps a valid state", () => {
    const r = sanitizeWalkthroughState(valid());
    expect(r.ok).toBe(true);
    expect((r as any).state.tours.app.stepId).toBe("leave.form");
  });

  it("refuses things that aren't a state", () => {
    for (const bad of [null, "x", [], { schema: 2, tours: {} }, { schema: 1 }])
      expect(sanitizeWalkthroughState(bad).ok).toBe(false);
  });

  it("refuses oversized bodies", () => {
    const big = valid();
    (big.tours.app as any).seen = Array.from(
      { length: 5000 },
      (_, i) => `x.${i}`,
    );
    expect(sanitizeWalkthroughState(big)).toEqual({
      ok: false,
      message: "Walkthrough state is too large.",
    });
  });

  it("drops unknown fields and malformed values", () => {
    const raw: any = valid();
    raw.extra = "nope";
    raw.tours.app.employeeSalary = 100000;
    raw.tours.app.seen.push("<script>", 7);
    raw.tours.app.lastRoute = "//evil.example";
    raw.tours["bad key!"] = { status: "paused" };
    raw.tours.leave = { status: "exploded" };
    const r: any = sanitizeWalkthroughState(raw);
    expect(r.ok).toBe(true);
    expect(r.state.extra).toBeUndefined();
    expect(Object.keys(r.state.tours)).toEqual(["app"]);
    expect(r.state.tours.app.employeeSalary).toBeUndefined();
    expect(r.state.tours.app.seen).toEqual(["welcome.hello", "today.intro"]);
    expect(r.state.tours.app.lastRoute).toBeNull();
  });

  it("clears an active tour that isn't in the state", () => {
    const raw: any = valid();
    raw.active = "missing";
    expect((sanitizeWalkthroughState(raw) as any).state.active).toBeNull();
  });
});

const { __store: cacheStore } = jest.requireMock("@hrms/cache");
const { cacheManager } = jest.requireMock("@hrms/cache");

describe("walkthrough progress handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
  });

  it("GET returns null before the first save", async () => {
    db.walkthroughProgress.findUnique.mockResolvedValue(null);
    const r = res();
    await getWalkthroughProgress(req(), r);
    expect(db.walkthroughProgress.findUnique).toHaveBeenCalledWith({
      where: { tenantId_userId: { tenantId: "tenant-a", userId: "user-1" } },
      select: { state: true },
    });
    expect(r.json).toHaveBeenCalledWith({ status: 200, data: { state: null } });
  });

  it("PUT stores the sanitized state under the caller's own identity", async () => {
    const r = res();
    const body = {
      state: valid(),
      userId: "someone-else",
      tenantId: "tenant-b",
    };
    await saveWalkthroughProgress(req(body), r);
    const call = db.walkthroughProgress.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      tenantId_userId: { tenantId: "tenant-a", userId: "user-1" },
    });
    expect(call.create).toMatchObject({
      tenantId: "tenant-a",
      userId: "user-1",
    });
    expect(r.json.mock.calls[0][0].status).toBe(200);
  });

  it("PUT uses the bound tenant over the token's when they differ", async () => {
    (getTenantId as jest.Mock).mockReturnValueOnce("tenant-bound");
    await saveWalkthroughProgress(req({ state: valid() }), res());
    expect(db.walkthroughProgress.upsert.mock.calls[0][0].where).toEqual({
      tenantId_userId: { tenantId: "tenant-bound", userId: "user-1" },
    });
  });

  it("PUT refuses an invalid state without writing", async () => {
    const r = res();
    await saveWalkthroughProgress(req({ state: { schema: 9 } }), r);
    expect(db.walkthroughProgress.upsert).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].status).toBe(400);
  });

  it("DELETE removes only the caller's progress", async () => {
    const r = res();
    await resetWalkthroughProgress(req(), r);
    expect(db.walkthroughProgress.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", userId: "user-1" },
    });
  });

  it("reports storage failures through handleError", async () => {
    db.walkthroughProgress.findUnique.mockRejectedValue(new Error("db down"));
    const r = res();
    await getWalkthroughProgress(req(), r);
    expect(r.json).toHaveBeenCalledWith({ status: 500 });
  });
});

describe("walkthrough progress cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
  });

  it("reads the database once, then serves the cached state (null included)", async () => {
    db.walkthroughProgress.findUnique.mockResolvedValue(null);
    await getWalkthroughProgress(req(), res());
    const r = res();
    await getWalkthroughProgress(req(), r);

    expect(db.walkthroughProgress.findUnique).toHaveBeenCalledTimes(1);
    expect(r.json).toHaveBeenCalledWith({ status: 200, data: { state: null } });
    expect([...cacheStore.keys()]).toEqual([
      "t:tenant-a:walkthrough:v1:user-1",
    ]);
  });

  it("a save makes the new state visible on the next read", async () => {
    db.walkthroughProgress.findUnique.mockResolvedValueOnce(null);
    await getWalkthroughProgress(req(), res());

    const state = valid();
    await saveWalkthroughProgress(req({ state }), res());
    expect(cacheManager.delete).toHaveBeenCalledWith(
      "t:tenant-a:walkthrough:v1:user-1",
    );
    // Called after the write, never before it.
    expect(cacheManager.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
      db.walkthroughProgress.upsert.mock.invocationCallOrder[0],
    );

    db.walkthroughProgress.findUnique.mockResolvedValueOnce({ state });
    const r = res();
    await getWalkthroughProgress(req(), r);
    expect(r.json.mock.calls[0][0].data.state).toEqual(state);
  });

  it("a reset drops the cached state", async () => {
    db.walkthroughProgress.findUnique.mockResolvedValueOnce({ state: valid() });
    await getWalkthroughProgress(req(), res());

    await resetWalkthroughProgress(req(), res());

    expect(cacheStore.has("t:tenant-a:walkthrough:v1:user-1")).toBe(false);
  });

  it("does not drop the cache when a save is refused", async () => {
    await saveWalkthroughProgress(req({ state: { schema: 9 } }), res());
    expect(cacheManager.delete).not.toHaveBeenCalled();
  });

  it("keeps each person's progress under their own key", async () => {
    db.walkthroughProgress.findUnique
      .mockResolvedValueOnce({ state: { mine: 1 } })
      .mockResolvedValueOnce({ state: { mine: 2 } });
    await getWalkthroughProgress(req(), res());
    const r = res();
    await getWalkthroughProgress(req({}, { userId: "user-2" }), r);

    expect(r.json.mock.calls[0][0].data.state).toEqual({ mine: 2 });
  });
});
