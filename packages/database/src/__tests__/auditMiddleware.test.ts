import {
  attachAuditLogging,
  attachMasterAuditLogging,
} from "../auditMiddleware";
import { getAuditActor, getTenantClient, getTenantId } from "../tenantContext";

jest.mock("../tenantContext", () => ({
  getAuditActor: jest.fn(),
  getTenantClient: jest.fn(),
  getTenantId: jest.fn(),
}));

const mockGetAuditActor = getAuditActor as jest.Mock;
const mockGetTenantClient = getTenantClient as jest.Mock;
const mockGetTenantId = getTenantId as jest.Mock;

const ACTOR = {
  userId: "u1",
  username: "alice",
  ipAddress: "1.2.3.4",
  userAgent: "jest",
};

function makeClient(modelDelegates: Record<string, any> = {}) {
  const middlewares: Array<(params: any, next: any) => Promise<unknown>> = [];
  const client: any = {
    $use: jest.fn((fn: any) => middlewares.push(fn)),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    ...modelDelegates,
  };
  return { client, middlewares };
}

async function flush() {
  // Let the fire-and-forget auditLog.create().catch() microtask settle.
  await new Promise((r) => setImmediate(r));
}

describe("attachAuditLogging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuditActor.mockReturnValue(ACTOR);
    mockGetTenantId.mockReturnValue("t1");
  });

  it("passes through untouched when the action isn't in ACTION_MAP (e.g. findMany)", async () => {
    const { client, middlewares } = makeClient();
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue([{ id: "e1" }]);

    const result = await middlewares[0](
      { model: "Employee", action: "findMany", args: {} },
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(result).toEqual([{ id: "e1" }]);
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("skips instrumentation for SKIP_MODELS (e.g. Notification)", async () => {
    const { client, middlewares } = makeClient({
      notification: { findUnique: jest.fn() },
    });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue({});

    await middlewares[0](
      { model: "Notification", action: "create", args: { data: {} } },
      next,
    );
    await flush();

    expect(client.auditLog.create).not.toHaveBeenCalled();
    expect(client.notification.findUnique).not.toHaveBeenCalled();
  });

  it("logs a CREATE with no before-snapshot", async () => {
    const employeeDelegate = { findUnique: jest.fn() };
    const { client, middlewares } = makeClient({ employee: employeeDelegate });
    attachAuditLogging(client);
    const created = { id: "e1", name: "Bob" };
    const next = jest.fn().mockResolvedValue(created);

    await middlewares[0](
      { model: "Employee", action: "create", args: { data: created } },
      next,
    );
    await flush();

    expect(employeeDelegate.findUnique).not.toHaveBeenCalled();
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        userId: "u1",
        username: "alice",
        action: "CREATE",
        entityType: "Employee",
        oldValue: undefined,
        newValue: created,
        description: "CREATE Employee",
      }),
    });
  });

  it("snapshots the before-state for update/upsert/delete via findUnique", async () => {
    const before = { id: "e1", name: "Old Name" };
    const after = { id: "e1", name: "New Name" };
    const employeeDelegate = {
      findUnique: jest.fn().mockResolvedValue(before),
    };
    const { client, middlewares } = makeClient({ employee: employeeDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue(after);

    await middlewares[0](
      {
        model: "Employee",
        action: "update",
        args: { where: { id: "e1" }, data: { name: "New Name" } },
      },
      next,
    );
    await flush();

    expect(employeeDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: "e1" },
    });
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        entityType: "Employee",
        oldValue: before,
        newValue: after,
      }),
    });
  });

  it("does not fail the request when the before-snapshot lookup throws", async () => {
    const employeeDelegate = {
      findUnique: jest.fn().mockRejectedValue(new Error("db hiccup")),
    };
    const { client, middlewares } = makeClient({ employee: employeeDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue({ id: "e1" });

    const result = await middlewares[0](
      { model: "Employee", action: "update", args: { where: { id: "e1" } } },
      next,
    );
    await flush();

    expect(result).toEqual({ id: "e1" });
    expect(client.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldValue: undefined }),
      }),
    );
  });

  it("forces newValue to undefined for delete (result is not the deleted shape)", async () => {
    const before = { id: "e1", name: "Bob" };
    const employeeDelegate = {
      findUnique: jest.fn().mockResolvedValue(before),
    };
    const { client, middlewares } = makeClient({ employee: employeeDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue(before);

    await middlewares[0](
      { model: "Employee", action: "delete", args: { where: { id: "e1" } } },
      next,
    );
    await flush();

    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        oldValue: before,
        newValue: undefined,
      }),
    });
  });

  it("does not snapshot for updateMany/deleteMany (unbounded where) but still logs the action", async () => {
    const employeeDelegate = { findUnique: jest.fn() };
    const { client, middlewares } = makeClient({ employee: employeeDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue({ count: 5 });

    await middlewares[0](
      {
        model: "Employee",
        action: "updateMany",
        args: { where: { active: true } },
      },
      next,
    );
    await flush();

    expect(employeeDelegate.findUnique).not.toHaveBeenCalled();
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        oldValue: undefined,
        newValue: { count: 5 },
      }),
    });
  });

  it("redacts sensitive fields in both oldValue and newValue, alongside a genuine change", async () => {
    // password alone changing would be filtered out entirely by
    // hasMeaningfulChange (see the "skips... redacted/bookkeeping fields"
    // test below) — pair it with a real field change so the entry is
    // actually logged, to observe redaction in the logged payload.
    const before = { id: "u1", password: "old-hash", name: "Bob" };
    const after = { id: "u1", password: "new-hash", name: "Bobby" };
    const userDelegate = { findUnique: jest.fn().mockResolvedValue(before) };
    const { client, middlewares } = makeClient({ user: userDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue(after);

    await middlewares[0](
      { model: "User", action: "update", args: { where: { id: "u1" } } },
      next,
    );
    await flush();

    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValue: { id: "u1", password: "[REDACTED]", name: "Bob" },
        newValue: { id: "u1", password: "[REDACTED]", name: "Bobby" },
      }),
    });
  });

  it("skips logging an update whose only differences are in redacted/bookkeeping fields", async () => {
    const before = {
      id: "u1",
      fcmTokens: ["a"],
      updatedAt: new Date("2024-01-01"),
    };
    const after = {
      id: "u1",
      fcmTokens: ["b"],
      updatedAt: new Date("2024-01-02"),
    };
    const userDelegate = { findUnique: jest.fn().mockResolvedValue(before) };
    const { client, middlewares } = makeClient({ user: userDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue(after);

    await middlewares[0](
      { model: "User", action: "update", args: { where: { id: "u1" } } },
      next,
    );
    await flush();

    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it("still logs an update when a non-redacted field actually changed alongside a bookkeeping field", async () => {
    const before = { id: "u1", name: "Old", updatedAt: new Date("2024-01-01") };
    const after = { id: "u1", name: "New", updatedAt: new Date("2024-01-02") };
    const userDelegate = { findUnique: jest.fn().mockResolvedValue(before) };
    const { client, middlewares } = makeClient({ user: userDelegate });
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue(after);

    await middlewares[0](
      { model: "User", action: "update", args: { where: { id: "u1" } } },
      next,
    );
    await flush();

    expect(client.auditLog.create).toHaveBeenCalled();
  });

  it("swallows a failure writing the audit entry itself without throwing", async () => {
    const { client, middlewares } = makeClient({
      employee: { findUnique: jest.fn() },
    });
    client.auditLog.create.mockRejectedValue(new Error("audit write failed"));
    attachAuditLogging(client);
    const next = jest.fn().mockResolvedValue({ id: "e1" });

    await expect(
      middlewares[0](
        { model: "Employee", action: "create", args: { data: {} } },
        next,
      ),
    ).resolves.toEqual({ id: "e1" });
    await flush();
  });
});

describe("attachMasterAuditLogging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuditActor.mockReturnValue(ACTOR);
    mockGetTenantId.mockReturnValue("t1");
  });

  it("ignores writes to models other than User", async () => {
    const { client, middlewares } = makeClient();
    attachMasterAuditLogging(client);
    const next = jest.fn().mockResolvedValue({});

    await middlewares[0]({ model: "Tenant", action: "update", args: {} }, next);
    await flush();

    expect(client.auditLog.create).not.toHaveBeenCalled();
    expect(mockGetTenantClient).not.toHaveBeenCalled();
  });

  it("writes the audit entry to the tenant-specific client, not the master client", async () => {
    const before = { id: "u1", name: "Old" };
    const after = { id: "u1", name: "New" };
    const masterUserDelegate = {
      findUnique: jest.fn().mockResolvedValue(before),
    };
    const { client: masterClient, middlewares } = makeClient({
      user: masterUserDelegate,
    });
    const tenantAuditLog = { create: jest.fn().mockResolvedValue({}) };
    mockGetTenantClient.mockReturnValue({ auditLog: tenantAuditLog });
    attachMasterAuditLogging(masterClient);
    const next = jest.fn().mockResolvedValue(after);

    await middlewares[0](
      { model: "User", action: "update", args: { where: { id: "u1" } } },
      next,
    );
    await flush();

    expect(masterUserDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
    });
    expect(tenantAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "User",
        oldValue: before,
        newValue: after,
      }),
    });
    expect(masterClient.auditLog.create).not.toHaveBeenCalled();
  });

  it("no-ops gracefully when there is no bound tenant client (e.g. mid-signup, tenant not yet resolved)", async () => {
    const masterUserDelegate = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const { client: masterClient, middlewares } = makeClient({
      user: masterUserDelegate,
    });
    mockGetTenantClient.mockReturnValue(null);
    attachMasterAuditLogging(masterClient);
    const next = jest.fn().mockResolvedValue({ id: "u1" });

    await expect(
      middlewares[0](
        { model: "User", action: "create", args: { data: {} } },
        next,
      ),
    ).resolves.toEqual({ id: "u1" });
    await flush();
  });
});
