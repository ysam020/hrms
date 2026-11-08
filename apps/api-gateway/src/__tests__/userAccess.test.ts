// Request-scoped user-access resolution (services/userAccess.ts): one lookup
// per request, no sharing across requests/tenants/users, failures never
// memoised or turned into access, and every authorisation decision identical
// to the pre-change implementation.
const mockScoped = jest.fn();
const mockMaster = jest.fn();
let mockTenant: string | null = "tenant-A";

jest.mock("@hrms/db", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockMaster(...a) },
    tenant: { findUnique: jest.fn() },
  },
  prismaWithTenant: {
    user: { findUnique: (...a: unknown[]) => mockScoped(...a) },
  },
  getTenantId: () => mockTenant,
  recordStage: jest.fn(),
  runWithTenant: jest.fn((_t: unknown, _c: unknown, fn: () => void) => fn()),
  getClientForDb: jest.fn(),
}));

import {
  invalidateUserAccess,
  loadUserAccess,
  withUserAccessScope,
} from "../services/userAccess";
import { isSuperUser } from "../utils/user";
import {
  requireHrPrivileged,
  requirePrivileged,
  requireSubscriptionManager,
  requireSuperUser,
} from "../middleware/authenticate";
import { hasPrivilegedRole, HR_ROLES } from "@hrms/common";
import { platformAdminGrants } from "../services/platformAccess";
import { hasSupportAccess } from "../services/supportStore";

const row = (o: Partial<Record<string, unknown>> = {}) => ({
  isSuperUser: false,
  permissions: [],
  role: [],
  tenantId: "tenant-A",
  username: "u",
  employeeStatus: "Active",
  ...o,
});

beforeEach(() => {
  mockScoped.mockReset();
  mockMaster.mockReset();
  mockTenant = "tenant-A";
});

describe("loadUserAccess: request-scoped reuse", () => {
  it("queries once per request however many checks ask", async () => {
    mockScoped.mockResolvedValue(row({ isSuperUser: true }));
    await withUserAccessScope(async () => {
      const a = await loadUserAccess("u1", { tenantScoped: true });
      const b = await loadUserAccess("u1", { tenantScoped: true });
      expect(await isSuperUser("u1")).toBe(true);
      expect(a).toBe(b);
    });
    expect(mockScoped).toHaveBeenCalledTimes(1);
  });

  it("concurrent checks share one in-flight lookup", async () => {
    let release!: (v: unknown) => void;
    mockScoped.mockReturnValue(new Promise((r) => (release = r)));
    await withUserAccessScope(async () => {
      const p = Promise.all(
        [1, 2, 3, 4].map(() => loadUserAccess("u1", { tenantScoped: true })),
      );
      release(row());
      const results = await p;
      expect(new Set(results).size).toBe(1);
    });
    expect(mockScoped).toHaveBeenCalledTimes(1);
  });

  it("never shares between requests", async () => {
    mockScoped
      .mockResolvedValueOnce(row({ isSuperUser: true }))
      .mockResolvedValueOnce(row({ isSuperUser: false }));
    const first = await withUserAccessScope(() =>
      loadUserAccess("u1", { tenantScoped: true }),
    );
    // e.g. superuser revoked between the two requests
    const second = await withUserAccessScope(() =>
      loadUserAccess("u1", { tenantScoped: true }),
    );
    expect(first?.isSuperUser).toBe(true);
    expect(second?.isSuperUser).toBe(false);
    expect(mockScoped).toHaveBeenCalledTimes(2);
  });

  it("never shares between tenants, users, or scoped and unscoped lookups", async () => {
    mockScoped.mockImplementation(async ({ where }: any) =>
      row({ username: `${mockTenant}:${where.id}` }),
    );
    mockMaster.mockImplementation(async ({ where }: any) =>
      row({ username: `master:${where.id}` }),
    );
    await withUserAccessScope(async () => {
      const a = await loadUserAccess("u1", { tenantScoped: true });
      mockTenant = "tenant-B";
      const b = await loadUserAccess("u1", { tenantScoped: true });
      const c = await loadUserAccess("u2", { tenantScoped: true });
      const d = await loadUserAccess("u1", { tenantScoped: false });
      expect([a, b, c, d].map((x) => x?.username)).toEqual([
        "tenant-A:u1",
        "tenant-B:u1",
        "tenant-B:u2",
        "master:u1",
      ]);
    });
    expect(mockScoped).toHaveBeenCalledTimes(3);
    expect(mockMaster).toHaveBeenCalledTimes(1);
  });

  it("a missing user resolves to null (no access) and is reused", async () => {
    mockScoped.mockResolvedValue(null);
    await withUserAccessScope(async () => {
      expect(await loadUserAccess("gone", { tenantScoped: true })).toBeNull();
      expect(await isSuperUser("gone")).toBe(false);
    });
    expect(mockScoped).toHaveBeenCalledTimes(1);
  });

  it("a failed lookup is not memoised: it rejects, then the next call retries", async () => {
    mockScoped
      .mockRejectedValueOnce(new Error("atlas down"))
      .mockResolvedValueOnce(row({ isSuperUser: true }));
    await withUserAccessScope(async () => {
      await expect(
        loadUserAccess("u1", { tenantScoped: true }),
      ).rejects.toThrow("atlas down");
      expect(
        (await loadUserAccess("u1", { tenantScoped: true }))?.isSuperUser,
      ).toBe(true);
    });
    expect(mockScoped).toHaveBeenCalledTimes(2);
  });

  it("invalidateUserAccess makes a same-request re-check read the new state", async () => {
    mockScoped
      .mockResolvedValueOnce(row({ permissions: [] }))
      .mockResolvedValueOnce(row({ permissions: ["WFH:approve"] }));
    await withUserAccessScope(async () => {
      expect(
        (await loadUserAccess("u1", { tenantScoped: true }))?.permissions,
      ).toEqual([]);
      invalidateUserAccess("u1");
      expect(
        (await loadUserAccess("u1", { tenantScoped: true }))?.permissions,
      ).toEqual(["WFH:approve"]);
    });
  });

  it("outside a request scope every call queries (no hidden global cache)", async () => {
    mockScoped.mockResolvedValue(row());
    await loadUserAccess("u1", { tenantScoped: true });
    await loadUserAccess("u1", { tenantScoped: true });
    expect(mockScoped).toHaveBeenCalledTimes(2);
  });

  it("normalises malformed permission data to no permissions", async () => {
    mockScoped.mockResolvedValue({
      ...row(),
      permissions: null,
      role: "x",
      isSuperUser: null,
    });
    const a = await withUserAccessScope(() =>
      loadUserAccess("u1", { tenantScoped: true }),
    );
    expect(a).toMatchObject({ permissions: [], role: [], isSuperUser: false });
  });

  it("retains nothing after the request ends", async () => {
    mockScoped.mockResolvedValue(row());
    await withUserAccessScope(() =>
      loadUserAccess("u1", { tenantScoped: true }),
    );
    // A new scope starts empty; nothing module-level held the old result.
    await withUserAccessScope(() =>
      loadUserAccess("u1", { tenantScoped: true }),
    );
    expect(mockScoped).toHaveBeenCalledTimes(2);
  });
});

// ── Decision equivalence with the pre-change guards (verbatim logic from HEAD 64a67b8) ──
type Decision = "next" | 403 | 500;
const legacy = {
  async superUser(role: string, find: () => Promise<any>): Promise<Decision> {
    if (role === "owner") return "next";
    try {
      return (await find())?.isSuperUser ? "next" : 403;
    } catch {
      return 500;
    }
  },
  async privileged(
    role: string,
    find: () => Promise<any>,
    allowed?: readonly string[],
  ): Promise<Decision> {
    if (hasPrivilegedRole(role, allowed as any)) return "next";
    try {
      return (await find())?.isSuperUser ? "next" : 403;
    } catch {
      return 500;
    }
  },
  async subscriptionManager(
    role: string,
    tenantId: string | null,
    find: () => Promise<any>,
  ): Promise<Decision> {
    if (!tenantId || hasPrivilegedRole(role)) return "next";
    try {
      const u = await find();
      return u?.isSuperUser ||
        ((u?.permissions as string[] | undefined) ?? []).some((p) =>
          p.startsWith("Subscription:"),
        )
        ? "next"
        : 403;
    } catch {
      return 500;
    }
  },
};

async function runGuard(
  mw: any,
  role: string,
  tenantId: string | null = "tenant-A",
): Promise<Decision> {
  let decision: Decision | null = null;
  const res: any = {
    status: (c: number) => {
      decision = c as Decision;
      return res;
    },
    json: () => res,
  };
  await withUserAccessScope(() =>
    mw(
      { user: { userId: "u1", tenantId, tenantRole: role } },
      res,
      () => (decision = "next"),
    ),
  );
  return decision!;
}

const STATES: Record<string, () => Promise<any>> = {
  missing: async () => null,
  superuser: async () => row({ isSuperUser: true }),
  subscriptionPerm: async () => row({ permissions: ["Subscription:manage"] }),
  noPerms: async () => row(),
  deactivatedSuperuser: async () =>
    row({ isSuperUser: true, employeeStatus: "Terminated" }),
  dbError: async () => {
    throw new Error("down");
  },
};
const ROLES = ["owner", "admin", "hr", "manager", "employee", ""];

describe("authorisation decisions are unchanged", () => {
  for (const [state, find] of Object.entries(STATES)) {
    for (const role of ROLES) {
      it(`${state} as ${role || "(no role)"}`, async () => {
        mockMaster.mockImplementation(find);
        expect(await runGuard(requireSuperUser, role)).toBe(
          await legacy.superUser(role, find),
        );
        expect(await runGuard(requirePrivileged, role)).toBe(
          await legacy.privileged(role, find),
        );
        expect(await runGuard(requireHrPrivileged, role)).toBe(
          await legacy.privileged(role, find, HR_ROLES),
        );
        expect(await runGuard(requireSubscriptionManager, role)).toBe(
          await legacy.subscriptionManager(role, "tenant-A", find),
        );
        expect(await runGuard(requireSubscriptionManager, role, null)).toBe(
          await legacy.subscriptionManager(role, null, find),
        );
        mockScoped.mockImplementation(find);
        const legacyIsSU = await find().then(
          (u) => u?.isSuperUser === true,
          () => "throws",
        );
        const newIsSU = await withUserAccessScope(() => isSuperUser("u1")).then(
          (v) => v,
          () => "throws",
        );
        expect(newIsSU).toBe(legacyIsSU);
      });
    }
  }

  it("stacked guards in one request share one lookup", async () => {
    mockMaster.mockResolvedValue(row({ isSuperUser: true }));
    const res: any = { status: () => res, json: () => res };
    await withUserAccessScope(async () => {
      const req = {
        user: { userId: "u1", tenantId: "tenant-A", tenantRole: "employee" },
      };
      await requirePrivileged(req as any, res, () => {});
      await requireHrPrivileged(req as any, res, () => {});
      await requireSubscriptionManager(req as any, res, () => {});
    });
    expect(mockMaster).toHaveBeenCalledTimes(1);
  });
});

describe("deactivated users stay denied on the platform guards", () => {
  const saved = process.env.PLATFORM_TENANT_ID;
  const PLATFORM = "aaaaaaaaaaaaaaaaaaaaaaaa"; // must be an ObjectId (fails closed otherwise)
  beforeAll(() => (process.env.PLATFORM_TENANT_ID = PLATFORM));
  afterAll(() => (process.env.PLATFORM_TENANT_ID = saved));
  const user = { userId: "u1", tenantId: PLATFORM, tenantRole: "employee" };
  // authenticate binds the token's tenant for the request (this also
  // checks privileges against the bound tenant).
  beforeEach(() => (mockTenant = PLATFORM));
  afterEach(() => (mockTenant = "tenant-A"));

  it.each([
    [
      "active superuser",
      row({ isSuperUser: true, tenantId: "aaaaaaaaaaaaaaaaaaaaaaaa" }),
      true,
    ],
    [
      "deactivated superuser",
      row({
        isSuperUser: true,
        tenantId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        employeeStatus: "Terminated",
      }),
      false,
    ],
    [
      "user from another tenant",
      row({ isSuperUser: true, tenantId: "tenant-B" }),
      false,
    ],
    ["missing user", null, false],
  ])("%s", async (_label, record, allowed) => {
    mockMaster.mockResolvedValue(record);
    await withUserAccessScope(async () => {
      expect((await platformAdminGrants(user)).length > 0).toBe(allowed);
      expect(await hasSupportAccess(user)).toBe(allowed);
    });
    // both platform checks shared one lookup
    expect(mockMaster).toHaveBeenCalledTimes(1);
  });
});

// isSuperUser / permissions / role on the master record were
// granted by the user's home organisation and count only there.
describe("loadUserAccess: privileges are scoped to the home organisation", () => {
  const privileged = (tenantId: string | null) =>
    row({
      isSuperUser: true,
      permissions: ["*:*:*"],
      role: ["admin"],
      tenantId,
    });

  it("unscoped: drops privileges when the record's home differs from the bound tenant", async () => {
    mockTenant = "tenant-A";
    mockMaster.mockResolvedValue(privileged("tenant-B"));
    const a = await loadUserAccess("u1", { tenantScoped: false });
    expect(a).toMatchObject({ isSuperUser: false, permissions: [], role: [] });
    // Identity fields survive (support/platform guards read them).
    expect(a).toMatchObject({ tenantId: "tenant-B", employeeStatus: "Active" });
  });

  it("unscoped: keeps privileges in the home organisation", async () => {
    mockTenant = "tenant-A";
    mockMaster.mockResolvedValue(privileged("tenant-A"));
    const a = await loadUserAccess("u1", { tenantScoped: false });
    expect(a).toMatchObject({ isSuperUser: true, permissions: ["*:*:*"] });
  });

  it("scoped with NO tenant bound: drops privileges (prismaWithTenant applies no filter then)", async () => {
    mockTenant = null;
    mockScoped.mockResolvedValue(privileged("tenant-B"));
    expect(await isSuperUser("u1")).toBe(false);
    const a = await loadUserAccess("u1", { tenantScoped: true });
    expect(a).toMatchObject({ isSuperUser: false, permissions: [], role: [] });
  });

  it("does not reuse a lookup across tenants within one request (memo keys include the tenant)", async () => {
    mockMaster.mockImplementation(async () => privileged("tenant-A"));
    await withUserAccessScope(async () => {
      mockTenant = "tenant-A";
      const inHome = await loadUserAccess("u1", { tenantScoped: false });
      mockTenant = "tenant-B";
      const elsewhere = await loadUserAccess("u1", { tenantScoped: false });
      expect(inHome?.isSuperUser).toBe(true);
      expect(elsewhere?.isSuperUser).toBe(false);
    });
    expect(mockMaster).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["requireSuperUser", requireSuperUser],
    ["requirePrivileged", requirePrivileged],
    ["requireHrPrivileged", requireHrPrivileged],
    ["requireSubscriptionManager", requireSubscriptionManager],
  ] as const)(
    "%s compares against the TOKEN's tenant even when no tenant is bound",
    async (_n, guard) => {
      mockTenant = null; // e.g. a code path that forgot runWithTenant
      mockMaster.mockResolvedValue(privileged("tenant-B"));
      const req: any = {
        user: { userId: "u1", tenantId: "tenant-A", tenantRole: "employee" },
      };
      const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      await guard(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    },
  );
});
