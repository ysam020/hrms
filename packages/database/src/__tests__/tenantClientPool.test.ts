const createdClients: any[] = [];

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation((opts: any) => {
    const client = {
      __opts: opts,
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
    createdClients.push(client);
    return client;
  }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockAttachAuditLogging = jest.fn();
jest.mock("../queryTiming", () => ({ attachQueryTiming: jest.fn() }));
jest.mock("../auditMiddleware", () => ({
  attachAuditLogging: (...args: unknown[]) => mockAttachAuditLogging(...args),
}));
const mockAttachFieldProtection = jest.fn();
jest.mock("../fieldProtection", () => ({
  attachFieldProtection: (...args: unknown[]) =>
    mockAttachFieldProtection(...args),
}));

describe("tenantClientPool", () => {
  let tenantClientPool: typeof import("../tenantClientPool");
  let tenantContext: typeof import("../tenantContext");
  let leases: typeof import("../clientLeases");
  let nowSpy: jest.SpyInstance;
  let now: number;

  beforeEach(() => {
    jest.resetModules();
    createdClients.length = 0;
    mockAttachAuditLogging.mockClear();
    process.env.DEV_MONGODB_URI =
      "mongodb://host:27017/masterdb?retryWrites=true";
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    tenantClientPool = require("../tenantClientPool");
    tenantContext = require("../tenantContext");
    leases = require("../clientLeases");
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it("creates a new client with a dbName-substituted datasource URL plus a bounded maxPoolSize, and audit-instruments it", () => {
    const client = tenantClientPool.getClientForDb("tenant-a");

    expect((client as any).__opts.datasourceUrl).toBe(
      "mongodb://host:27017/tenant-a?retryWrites=true&maxPoolSize=50",
    );
    expect(mockAttachAuditLogging).toHaveBeenCalledWith(client);
    // Field encryption under this tenant's own data keys.
    expect(mockAttachFieldProtection).toHaveBeenCalledWith(client, "tenant-a");
  });

  it("appends maxPoolSize with a leading '?' when the base URI has no existing query string", () => {
    process.env.DEV_MONGODB_URI = "mongodb://host:27017/masterdb";
    jest.resetModules();
    tenantClientPool = require("../tenantClientPool");

    const client = tenantClientPool.getClientForDb("tenant-a");

    expect((client as any).__opts.datasourceUrl).toBe(
      "mongodb://host:27017/tenant-a?maxPoolSize=50",
    );
  });

  it("returns the same cached client instance on a repeat call for the same dbName", () => {
    const first = tenantClientPool.getClientForDb("tenant-a");
    const second = tenantClientPool.getClientForDb("tenant-a");

    expect(second).toBe(first);
    expect(createdClients).toHaveLength(1);
  });

  it("evicts the least-recently-used client once the pool reaches MAX_POOL_SIZE, and refreshing lastUsed protects an entry from eviction", () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    // Fill the pool to its cap (50).
    for (let i = 0; i < 50; i++) {
      now += 1;
      tenantClientPool.getClientForDb(`tenant-${i}`);
    }
    expect(createdClients).toHaveLength(50);

    // Touch tenant-0 again so it's no longer the least-recently-used entry.
    now += 1;
    const tenant0Client = tenantClientPool.getClientForDb("tenant-0");
    expect(createdClients).toHaveLength(50); // cache hit, no new client

    // Adding one more tenant should now evict tenant-1 (the new LRU), not tenant-0.
    now += 1;
    tenantClientPool.getClientForDb("tenant-50");

    // An evicted client may still be serving a request that took it a
    // moment ago: it is disconnected only after the grace period.
    const tenant1Client = createdClients[1];
    jest.advanceTimersByTime(59_999);
    expect(tenant1Client.$disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(tenant1Client.$disconnect).toHaveBeenCalledTimes(1);

    // tenant-0 survives, still the same cached instance.
    const tenant0Again = tenantClientPool.getClientForDb("tenant-0");
    expect(tenant0Again).toBe(tenant0Client);

    // tenant-1 was evicted and disconnected, so requesting it again creates
    // a brand-new client.
    const clientsBefore = createdClients.length;
    tenantClientPool.getClientForDb("tenant-1");
    expect(createdClients.length).toBe(clientsBefore + 1);
    jest.useRealTimers();
  });

  it("puts an evicted client back, undisconnected, if its tenant is asked for within the grace period", () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    for (let i = 0; i <= 50; i++) {
      now += 1;
      tenantClientPool.getClientForDb(`tenant-${i}`);
    }
    const evicted = createdClients[0];
    const created = createdClients.length;
    jest.advanceTimersByTime(59_000);

    now += 1;
    expect(tenantClientPool.getClientForDb("tenant-0")).toBe(evicted);
    expect(createdClients).toHaveLength(created);
    jest.advanceTimersByTime(60_000);
    expect(evicted.$disconnect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("closeAllTenantClients also disconnects clients still in their grace period", async () => {
    for (let i = 0; i <= 50; i++) {
      now += 1;
      tenantClientPool.getClientForDb(`tenant-${i}`);
    }
    await tenantClientPool.closeAllTenantClients();
    for (const client of createdClients) {
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it("closeAllTenantClients disconnects every pooled client and clears the pool", async () => {
    const a = tenantClientPool.getClientForDb("tenant-a");
    const b = tenantClientPool.getClientForDb("tenant-b");

    await tenantClientPool.closeAllTenantClients();

    expect(a.$disconnect).toHaveBeenCalledTimes(1);
    expect(b.$disconnect).toHaveBeenCalledTimes(1);

    // Pool is empty now, so requesting tenant-a again creates a fresh client.
    const clientsBefore = createdClients.length;
    tenantClientPool.getClientForDb("tenant-a");
    expect(createdClients.length).toBe(clientsBefore + 1);
  });

  describe("eviction never disconnects a client in use", () => {
    // Fills the pool so that tenant-0 is evicted, returning its client.
    const evictTenant0 = () => {
      const client = tenantClientPool.getClientForDb("tenant-0");
      for (let i = 1; i <= 50; i++) {
        now += 1;
        tenantClientPool.getClientForDb(`tenant-${i}`);
      }
      return client as any;
    };
    beforeEach(() => jest.useFakeTimers({ doNotFake: ["Date"] }));
    afterEach(() => jest.useRealTimers());

    it("keeps an evicted client connected past the grace period while an operation holds it, and disconnects on release", async () => {
      let finish!: () => void;
      const client = tenantClientPool.getClientForDb("tenant-0") as any;
      const running = tenantContext.runWithTenant(
        "t0",
        client,
        () => new Promise<void>((r) => (finish = r)),
      );
      evictTenant0();

      jest.advanceTimersByTime(10 * 60_000); // a long-running operation
      expect(client.$disconnect).not.toHaveBeenCalled();
      expect(leases.activeLeases(client)).toBe(1);

      finish();
      await running;
      await Promise.resolve();
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("disconnects once the grace period passes when the operation already finished", async () => {
      const client = tenantClientPool.getClientForDb("tenant-0") as any;
      await tenantContext.runWithTenant("t0", client, async () => "done");
      evictTenant0();
      jest.advanceTimersByTime(60_000);
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("releases the client when the operation fails (rejected or thrown)", async () => {
      const client = tenantClientPool.getClientForDb("tenant-0") as any;
      await expect(
        tenantContext.runWithTenant("t0", client, async () => {
          throw new Error("query failed");
        }),
      ).rejects.toThrow("query failed");
      expect(() =>
        tenantContext.runWithTenant("t0", client, () => {
          throw new Error("sync failure");
        }),
      ).toThrow("sync failure");
      await Promise.resolve();
      expect(leases.activeLeases(client)).toBe(0);

      evictTenant0();
      jest.advanceTimersByTime(60_000);
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("hands concurrent requests for the same tenant one client", async () => {
      const clients = await Promise.all(
        Array.from({ length: 10 }, async () =>
          tenantClientPool.getClientForDb("tenant-x"),
        ),
      );
      expect(new Set(clients).size).toBe(1);
      expect(createdClients).toHaveLength(1);
    });

    it("reuses a retiring client that is still in use, and never disconnects it", async () => {
      let finish!: () => void;
      const client = tenantClientPool.getClientForDb("tenant-0") as any;
      const running = tenantContext.runWithTenant(
        "t0",
        client,
        () => new Promise<void>((r) => (finish = r)),
      );
      evictTenant0();
      jest.advanceTimersByTime(90_000);

      now += 1;
      expect(tenantClientPool.getClientForDb("tenant-0")).toBe(client);
      finish();
      await running;
      await Promise.resolve();
      expect(client.$disconnect).not.toHaveBeenCalled();
    });

    it("on shutdown, closes retiring clients even if still leased (work has drained by then)", async () => {
      const client = tenantClientPool.getClientForDb("tenant-0") as any;
      void tenantContext.runWithTenant(
        "t0",
        client,
        () => new Promise(() => {}),
      );
      evictTenant0();
      await tenantClientPool.closeAllTenantClients();
      expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("a lease release is idempotent", () => {
      const client = {};
      const release = leases.leaseClient(client);
      leases.leaseClient(client);
      release();
      release();
      expect(leases.activeLeases(client)).toBe(1);
    });
  });
});
