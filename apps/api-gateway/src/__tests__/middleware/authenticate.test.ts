import jwt from "jsonwebtoken";
import { prisma, runWithTenant, getClientForDb } from "@hrms/db";
import {
  authenticate,
  requireTenant,
  authorize,
  requireSuperUser,
  requirePrivileged,
  requireHrPrivileged,
  requireSubscriptionManager,
  type AuthRequest,
} from "../../middleware/authenticate";
import { gatewayTenantStorage } from "../../middleware/tenantContext";

jest.mock("jsonwebtoken");

jest.mock("@hrms/db", () => ({
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
  runWithTenant: jest.fn((_tid, _client, fn) => fn()),
  getClientForDb: jest.fn().mockReturnValue({ __client: true }),
}));

const mockVerify = jwt.verify as jest.Mock;
const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockRunWithTenant = runWithTenant as jest.Mock;
const mockGetClientForDb = getClientForDb as jest.Mock;

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    headers: {},
    cookies: {},
    ip: "1.2.3.4",
    socket: { remoteAddress: "1.2.3.4" } as any,
    ...overrides,
  } as AuthRequest;
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("authenticate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithTenant.mockImplementation((_tid, _client, fn) => fn());
    process.env.ACCESS_JWT_TOKEN = "test-secret";
  });

  it("returns 401 when no token is present", () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reads the token from the Authorization header", () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: null });
    const req = makeReq({ headers: { authorization: "Bearer abc123" } as any });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(mockVerify).toHaveBeenCalledWith("abc123", "test-secret", {
      algorithms: ["HS256"],
    });
  });

  it("falls back to the access_token cookie when no Authorization header is present", () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: null });
    const req = makeReq({ cookies: { access_token: "cookie-token" } });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(mockVerify).toHaveBeenCalledWith(
      "cookie-token",
      "test-secret",
      expect.anything(),
    );
  });

  it("returns 401 when the token is invalid or expired", () => {
    mockVerify.mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const req = makeReq({ headers: { authorization: "Bearer bad" } as any });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid or expired token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("runs next() in a null tenant context when the token has no tenantId", () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: null });
    const req = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const res = makeRes();
    const next = jest.fn(() => {
      expect(gatewayTenantStorage.getStore()).toEqual({
        tenantId: null,
        dbName: null,
      });
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("uses the dbName embedded in the token without a DB lookup", async () => {
    mockVerify.mockReturnValue({
      userId: "u1",
      tenantId: "tenant-A",
      dbName: "db-from-token",
    });
    mockUserFindUnique.mockResolvedValue({ username: "alice" });
    const req = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const res = makeRes();
    let storeDuringNext: any = null;
    const next = jest.fn(() => {
      storeDuringNext = gatewayTenantStorage.getStore();
    });

    authenticate(req, res, next);
    await flushPromises();

    expect(mockTenantFindUnique).not.toHaveBeenCalled();
    expect(mockGetClientForDb).toHaveBeenCalledWith("db-from-token");
    expect(next).toHaveBeenCalled();
    expect(storeDuringNext).toEqual(
      expect.objectContaining({
        tenantId: "tenant-A",
        dbName: "db-from-token",
      }),
    );
    expect(mockRunWithTenant).toHaveBeenCalledWith(
      "tenant-A",
      { __client: true },
      next,
      expect.objectContaining({ userId: "u1", username: "alice" }),
    );
  });

  it("falls back to a DB lookup and caches dbName when the token has none", async () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: "tenant-B" });
    mockTenantFindUnique.mockResolvedValue({ dbName: "db-from-db" });
    mockUserFindUnique.mockResolvedValue({ username: "bob" });
    const req = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flushPromises();

    expect(mockTenantFindUnique).toHaveBeenCalledTimes(1);
    expect(mockGetClientForDb).toHaveBeenCalledWith("db-from-db");

    // Second request for the same tenant should hit the in-memory cache, not the DB again.
    mockVerify.mockReturnValue({ userId: "u1", tenantId: "tenant-B" });
    const req2 = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const next2 = jest.fn();
    authenticate(req2, makeRes(), next2);
    await flushPromises();

    expect(mockTenantFindUnique).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalled();
  });

  it("resolves username as null when the user lookup throws, without failing the request", async () => {
    mockVerify.mockReturnValue({
      userId: "u-missing",
      tenantId: "tenant-C",
      dbName: "db-c",
    });
    mockUserFindUnique.mockRejectedValue(new Error("not found"));
    const req = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flushPromises();

    expect(next).toHaveBeenCalled();
    expect(mockRunWithTenant).toHaveBeenCalledWith(
      "tenant-C",
      { __client: true },
      next,
      expect.objectContaining({ username: null }),
    );
  });

  it("returns 500 when resolving dbName/username rejects", async () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: "tenant-D" });
    mockTenantFindUnique.mockRejectedValue(new Error("db down"));
    mockUserFindUnique.mockResolvedValue({ username: "carol" });
    const req = makeReq({ headers: { authorization: "Bearer abc" } as any });
    const res = makeRes();
    const next = jest.fn();

    authenticate(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal Server Error" });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireTenant", () => {
  it("returns 401 when there is no authenticated user", () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    requireTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with PENDING_TENANT_SETUP when pendingSetup is true", () => {
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: null,
        pendingSetup: true,
        dbName: null,
      },
    });
    const res = makeRes();
    const next = jest.fn();
    requireTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PENDING_TENANT_SETUP" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when tenantId is missing", () => {
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: null,
        tenantRole: null,
        pendingSetup: false,
        dbName: null,
      },
    });
    const res = makeRes();
    const next = jest.fn();
    requireTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the user has a resolved tenant", () => {
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "member",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    requireTenant(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("authorize", () => {
  it("returns 403 when the user's tenantRole is not in the allowed list", () => {
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "member",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    authorize("owner", "admin")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when there is no authenticated user", () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    authorize("owner")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("calls next when the user's tenantRole is allowed", () => {
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "admin",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    authorize("owner", "admin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe.each([
  ["requireSuperUser", requireSuperUser, ["owner"]],
  ["requirePrivileged", requirePrivileged, ["owner", "admin"]],
  ["requireHrPrivileged", requireHrPrivileged, ["owner", "admin", "hr"]],
  [
    "requireSubscriptionManager",
    requireSubscriptionManager,
    ["owner", "admin"],
  ],
] as const)("%s", (_name, middleware, fastPathRoles) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when there is no authenticated user", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(fastPathRoles)(
    "admits tenantRole %s without a DB lookup",
    async (role) => {
      const req = makeReq({
        user: {
          userId: "u1",
          tenantId: "t1",
          tenantRole: role,
          pendingSetup: false,
          dbName: "db",
        },
      });
      const res = makeRes();
      const next = jest.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    },
  );

  it("falls back to isSuperUser DB check when tenantRole is not fast-pathed, and admits when true", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "member",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 when tenantRole is not fast-pathed and isSuperUser is false", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "member",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 500 when the isSuperUser DB check throws", async () => {
    mockUserFindUnique.mockRejectedValue(new Error("db down"));
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "member",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("requireSubscriptionManager — beyond owner/admin", () => {
  const employee = {
    userId: "u1",
    tenantId: "t1",
    tenantRole: "employee",
    pendingSetup: false,
    dbName: "db",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("admits a user with a Subscription:* permission", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Subscription:manage"],
    });
    const res = makeRes();
    const next = jest.fn();
    await requireSubscriptionManager(makeReq({ user: employee }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("refuses an ordinary employee (e.g. calling cancel-subscription directly)", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Leave:apply"],
    });
    const res = makeRes();
    const next = jest.fn();
    await requireSubscriptionManager(makeReq({ user: employee }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes a signup with no tenant yet (org setup) without a lookup", async () => {
    const res = makeRes();
    const next = jest.fn();
    await requireSubscriptionManager(
      makeReq({
        user: { userId: "u1", pendingSetup: true } as any,
      }),
      res,
      next,
    );
    expect(next).toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});
