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
  leaseClient: () => () => undefined,
  prisma: {
    tenant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  },
  runWithTenant: jest.fn((_tid, _client, fn) => fn()),
  getClientForDb: jest.fn().mockReturnValue({ __client: true }),
  recordStage: jest.fn(),
  isAccountAccessUnavailable: (e: any) =>
    e?.name === "AccountAccessUnavailableError",
}));

// authenticate consults the authoritative account check on
// every request. Default: allowed, keeping the token's role, with no dbName
// from the check — so the token/DB dbName resolution below is still what's
// exercised. Denial and the authoritative overrides have their own tests.
const mockResolveAccess = jest.fn();
jest.mock("../../services/accountAccess", () => ({
  resolveAccountAccess: (...a: unknown[]) => mockResolveAccess(...a),
}));
const allowAsToken = () =>
  mockResolveAccess.mockImplementation(async () => ({
    ok: true,
    tenantRole:
      (mockVerify.mock.results.at(-1)?.value ?? {}).tenantRole ?? null,
    dbName: null,
    employeeStatus: "Active",
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
  // Express responses are event emitters; the tenant-client lease is
  // released on "finish"/"close".
  res.once = jest.fn().mockReturnValue(res);
  return res;
}

describe("authenticate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithTenant.mockImplementation((_tid, _client, fn) => fn());
    process.env.ACCESS_JWT_TOKEN = "test-secret";
    allowAsToken();
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

  it("runs next() in a null tenant context when the token has no tenantId", async () => {
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
    // The person-level account check is awaited first.
    await flushPromises();

    expect(next).toHaveBeenCalled();
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", null);
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
      // authenticate hands runWithTenant a timing wrapper around next.
      expect.any(Function),
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
      // authenticate hands runWithTenant a timing wrapper around next.
      expect.any(Function),
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
    // A superuser of the organisation they're acting in (home tenant t1).
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true, tenantId: "t1" });
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

  // isSuperUser/permissions on the master record were granted by
  // the user's home organisation. In any other organisation they must not
  // count — only the membership role (tenantRole) does.
  it("denies a superuser of ANOTHER organisation (home tenant differs)", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: true,
      permissions: ["*:*:*", "Subscription:manage"],
      tenantId: "tenant-of-their-own-trial-org",
    });
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "employee",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("denies a superuser record with no home organisation at all", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true, tenantId: null });
    const req = makeReq({
      user: {
        userId: "u1",
        tenantId: "t1",
        tenantRole: "employee",
        pendingSetup: false,
        dbName: "db",
      },
    });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
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
      tenantId: "t1", // granted by the organisation being acted in
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

// A valid, unexpired token is not enough.
describe("authenticate — authoritative account check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithTenant.mockImplementation((_tid, _client, fn) => fn());
    process.env.ACCESS_JWT_TOKEN = "test-secret";
  });

  it.each([
    "blocked_status",
    "no_membership",
    "tenant_inactive",
    "user_not_found",
  ])(
    "refuses a valid token with 401 SESSION_REVOKED when the check says %s",
    async (reason) => {
      mockVerify.mockReturnValue({
        userId: "u1",
        tenantId: "t1",
        tenantRole: "owner",
        dbName: "db",
      });
      mockResolveAccess.mockResolvedValue({ ok: false, reason });
      const res = makeRes();
      const next = jest.fn();
      authenticate(
        makeReq({ headers: { authorization: "Bearer x" } as any }),
        res,
        next,
      );
      await flushPromises();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "SESSION_REVOKED" }),
      );
      expect(mockRunWithTenant).not.toHaveBeenCalled();
    },
  );

  it("refuses a terminated person's tenantless (org-setup) token too", async () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: null });
    mockResolveAccess.mockResolvedValue({
      ok: false,
      reason: "blocked_status",
    });
    const res = makeRes();
    const next = jest.fn();
    authenticate(
      makeReq({ headers: { authorization: "Bearer x" } as any }),
      res,
      next,
    );
    await flushPromises();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("replaces the token's role and database with the current ones (demotion takes effect)", async () => {
    mockVerify.mockReturnValue({
      userId: "u1",
      tenantId: "t1",
      tenantRole: "owner", // snapshot from login
      dbName: "old-db",
    });
    mockResolveAccess.mockResolvedValue({
      ok: true,
      tenantRole: "employee", // demoted since
      dbName: "current-db",
      employeeStatus: "Active",
    });
    mockUserFindUnique.mockResolvedValue({ username: "u" });
    const req = makeReq({ headers: { authorization: "Bearer x" } as any });
    const next = jest.fn();
    authenticate(req, makeRes(), next);
    await flushPromises();
    expect(next).toHaveBeenCalled();
    expect(req.user!.tenantRole).toBe("employee");
    expect(req.user!.dbName).toBe("current-db");
    expect(mockGetClientForDb).toHaveBeenCalledWith("current-db");
    expect(mockResolveAccess).toHaveBeenCalledWith("u1", "t1");
  });

  it("returns 500 (not access) when the account check itself fails", async () => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId: "t1", dbName: "db" });
    mockResolveAccess.mockRejectedValue(new Error("mongo down"));
    const res = makeRes();
    const next = jest.fn();
    authenticate(
      makeReq({ headers: { authorization: "Bearer x" } as any }),
      res,
      next,
    );
    await flushPromises();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// "Could not verify" is neither access nor a denial.
describe("authenticate — account check unavailable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ACCESS_JWT_TOKEN = "test-secret";
  });
  const unavailable = () =>
    Object.assign(new Error("account access check timed out"), {
      name: "AccountAccessUnavailableError",
      kind: "timeout",
    });

  it.each([
    ["with an organisation", "t1"],
    ["without one (org setup)", null],
  ])("answers 503 + Retry-After, not 401/500, %s", async (_l, tenantId) => {
    mockVerify.mockReturnValue({ userId: "u1", tenantId, dbName: "db" });
    mockResolveAccess.mockRejectedValue(unavailable());
    const res = makeRes();
    res.setHeader = jest.fn();
    const next = jest.fn();
    authenticate(
      makeReq({ headers: { authorization: "Bearer x" } as any }),
      res,
      next,
    );
    await flushPromises();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_CHECK_UNAVAILABLE" }),
    );
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "5");
  });
});
