// The gateway's cache in front of checkAccountAccess.
// The bound under test below (read at module load).
process.env.ACCOUNT_ACCESS_CACHE_MAX = "5000";
const mockCheck = jest.fn();
jest.mock("@hrms/db", () => {
  class AccountAccessUnavailableError extends Error {
    kind: string;
    constructor(kind: string) {
      super(kind);
      this.name = "AccountAccessUnavailableError";
      this.kind = kind;
    }
  }
  return {
    checkAccountAccess: (...a: unknown[]) => mockCheck(...a),
    AccountAccessUnavailableError,
    isAccountAccessUnavailable: (e: any) =>
      e?.name === "AccountAccessUnavailableError",
  };
});
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  resolveAccountAccess,
  invalidateAccountAccess,
  invalidateTenantAccess,
  flushAccountAccessDecisions,
  clearAccountAccessCache,
} from "../services/accountAccess";

const OK = {
  ok: true,
  tenantRole: "employee",
  dbName: "db",
  employeeStatus: "Active",
};
const realNow = Date.now;
let now = 1_000_000;

beforeEach(() => {
  clearAccountAccessCache();
  mockCheck.mockReset().mockResolvedValue(OK);
  now = 1_000_000;
  Date.now = () => now;
});
afterAll(() => (Date.now = realNow));

describe("Bounded-age decisions and wider invalidation", () => {
  it("maxAgeMs re-checks a decision older than the bound (but within the TTL)", async () => {
    await resolveAccountAccess("u", "t");
    now += 4_000;
    await resolveAccountAccess("u", "t", { maxAgeMs: 5_000 });
    expect(mockCheck).toHaveBeenCalledTimes(1); // 4 s old: still fresh enough
    now += 2_000;
    await resolveAccountAccess("u", "t", { maxAgeMs: 5_000 });
    expect(mockCheck).toHaveBeenCalledTimes(2); // 6 s old: re-checked
  });

  it("maxAgeMs: 0 always re-checks; the new decision then serves ordinary callers", async () => {
    await resolveAccountAccess("u", "t");
    await resolveAccountAccess("u", "t", { maxAgeMs: 0 });
    expect(mockCheck).toHaveBeenCalledTimes(2);
    await resolveAccountAccess("u", "t");
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });

  it("maxAgeMs can never extend a decision past the TTL", async () => {
    await resolveAccountAccess("u", "t");
    now += 31_000;
    await resolveAccountAccess("u", "t", { maxAgeMs: 600_000 });
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });

  it("invalidateTenantAccess drops every user of that tenant only", async () => {
    await resolveAccountAccess("u1", "t1");
    await resolveAccountAccess("u2", "t1");
    await resolveAccountAccess("u1", "t2");
    invalidateTenantAccess("t1");
    await resolveAccountAccess("u1", "t1");
    await resolveAccountAccess("u2", "t1");
    await resolveAccountAccess("u1", "t2");
    expect(mockCheck).toHaveBeenCalledTimes(5);
  });

  it("flushAccountAccessDecisions drops everything and reports how many", async () => {
    await resolveAccountAccess("u1", "t1");
    await resolveAccountAccess("u2", "t1");
    expect(flushAccountAccessDecisions()).toBe(2);
    await resolveAccountAccess("u1", "t1");
    expect(mockCheck).toHaveBeenCalledTimes(3);
  });
});

describe("resolveAccountAccess cache", () => {
  it("serves repeats within the TTL from one lookup, shared by concurrent callers", async () => {
    await Promise.all([
      resolveAccountAccess("u", "t"),
      resolveAccountAccess("u", "t"),
    ]);
    await resolveAccountAccess("u", "t");
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("re-checks once the ABSOLUTE TTL has passed, even if used constantly", async () => {
    await resolveAccountAccess("u", "t");
    for (let i = 0; i < 10; i++) {
      now += 3_500; // touched every 3.5 s for 35 s — an idle TTL would never expire
      await resolveAccountAccess("u", "t");
    }
    expect(mockCheck.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps tenants apart", async () => {
    await resolveAccountAccess("u", "t1");
    await resolveAccountAccess("u", "t2");
    expect(mockCheck).toHaveBeenNthCalledWith(1, "u", "t1");
    expect(mockCheck).toHaveBeenNthCalledWith(2, "u", "t2");
  });

  it("never caches a failure", async () => {
    mockCheck.mockRejectedValueOnce(new Error("db down"));
    await expect(resolveAccountAccess("u", "t")).rejects.toThrow("db down");
    await expect(resolveAccountAccess("u", "t")).resolves.toEqual(OK);
    expect(mockCheck).toHaveBeenCalledTimes(2);
  });

  it("invalidateAccountAccess drops every tenant entry for that user only", async () => {
    await resolveAccountAccess("u", "t1");
    await resolveAccountAccess("u", "t2");
    await resolveAccountAccess("other", "t1");
    invalidateAccountAccess("u");
    await resolveAccountAccess("u", "t1");
    await resolveAccountAccess("u", "t2");
    await resolveAccountAccess("other", "t1");
    expect(mockCheck).toHaveBeenCalledTimes(5);
  });

  it("does not let user id prefixes collide on invalidation", async () => {
    await resolveAccountAccess("u1", "t");
    invalidateAccountAccess("u");
    await resolveAccountAccess("u1", "t");
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("stays bounded (oldest entry evicted)", async () => {
    for (let i = 0; i <= 5000; i++) await resolveAccountAccess(`u${i}`, "t");
    mockCheck.mockClear();
    await resolveAccountAccess("u0", "t"); // evicted → reloaded
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});

// During a database outage, misses fail fast instead of piling up.
describe("resolveAccountAccess breaker", () => {
  const { AccountAccessUnavailableError } = jest.requireMock("@hrms/db");
  const down = () => new AccountAccessUnavailableError("timeout");

  it("opens after 5 consecutive unavailable checks: further misses fail fast without a DB call", async () => {
    mockCheck.mockRejectedValue(down());
    for (let i = 0; i < 5; i++) {
      await expect(resolveAccountAccess(`u${i}`, "t")).rejects.toMatchObject({
        name: "AccountAccessUnavailableError",
      });
    }
    mockCheck.mockClear();
    await expect(resolveAccountAccess("u-new", "t")).rejects.toMatchObject({
      name: "AccountAccessUnavailableError",
    });
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("still serves FRESH cached decisions while open (no change to their TTL)", async () => {
    mockCheck.mockResolvedValueOnce(OK);
    await resolveAccountAccess("cached", "t");
    mockCheck.mockRejectedValue(down());
    for (let i = 0; i < 5; i++)
      await resolveAccountAccess(`x${i}`, "t").catch(() => {});
    await expect(resolveAccountAccess("cached", "t")).resolves.toEqual(OK);
    now += 30_001; // past the TTL: not served stale
    await expect(resolveAccountAccess("cached", "t")).rejects.toMatchObject({
      name: "AccountAccessUnavailableError",
    });
  });

  it("closes after the window when the probe succeeds", async () => {
    mockCheck.mockRejectedValue(down());
    for (let i = 0; i < 5; i++)
      await resolveAccountAccess(`y${i}`, "t").catch(() => {});
    now += 5_001;
    mockCheck.mockResolvedValue(OK);
    await expect(resolveAccountAccess("probe", "t")).resolves.toEqual(OK);
    await expect(resolveAccountAccess("other", "t")).resolves.toEqual(OK);
  });

  it("a DENIAL is a decision, not a failure: it never opens the breaker", async () => {
    mockCheck.mockResolvedValue({ ok: false, reason: "blocked_status" });
    for (let i = 0; i < 10; i++) await resolveAccountAccess(`d${i}`, "t");
    mockCheck.mockResolvedValue(OK);
    await expect(resolveAccountAccess("after", "t")).resolves.toEqual(OK);
  });
});
