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
jest.mock("../auditMiddleware", () => ({
  attachAuditLogging: (...args: unknown[]) => mockAttachAuditLogging(...args),
}));

describe("tenantClientPool", () => {
  let tenantClientPool: typeof import("../tenantClientPool");
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

    const tenant1Client = createdClients[1];
    expect(tenant1Client.$disconnect).toHaveBeenCalledTimes(1);

    // tenant-0 survives, still the same cached instance.
    const tenant0Again = tenantClientPool.getClientForDb("tenant-0");
    expect(tenant0Again).toBe(tenant0Client);

    // tenant-1 was evicted, so requesting it again creates a brand-new client.
    const clientsBefore = createdClients.length;
    tenantClientPool.getClientForDb("tenant-1");
    expect(createdClients.length).toBe(clientsBefore + 1);
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
});
