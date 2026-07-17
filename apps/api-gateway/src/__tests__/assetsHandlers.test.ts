import { prismaWithTenant as prisma } from "@hrms/db";
import { returnAsset } from "../handlers/assets";

jest.mock("@hrms/db", () => {
  const _db = {
    user: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn(), update: jest.fn() },
    assetAssignment: { findFirst: jest.fn(), update: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../utils/webhookEmitter", () => ({
  emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@hrms/queue", () => ({
  getNotificationQueue: jest.fn(),
}));

const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockAssetFindUnique = (prisma as any).asset.findUnique as jest.Mock;
const mockAssetUpdate = (prisma as any).asset.update as jest.Mock;
const mockAssignmentFindFirst = (prisma as any).assetAssignment
  .findFirst as jest.Mock;
const mockAssignmentUpdate = (prisma as any).assetAssignment
  .update as jest.Mock;

const makeRes = () => ({ json: jest.fn() }) as any;
const makeReq = (overrides: any = {}) =>
  ({
    body: { assetId: "a1", conditionIn: "good" },
    user: { userId: "u1", tenantRole: "employee" },
    ...overrides,
  }) as any;

describe("returnAsset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssetFindUnique.mockResolvedValue({
      id: "a1",
      status: "assigned",
      assetCode: "AST-1",
    });
    mockAssignmentFindFirst.mockResolvedValue({
      id: "assign1",
      assetId: "a1",
      userId: "someone-else",
    });
    mockAssetUpdate.mockResolvedValue({});
    mockAssignmentUpdate.mockResolvedValue({});
  });

  // Locks in the module's own documented design ("Create/update/assign/return
  // restricted to HR/admin/owner") server-side — the frontend hiding the
  // Return button isn't sufficient on its own, since a direct API call (curl,
  // Postman) bypasses the UI entirely.
  it("returns FORBIDDEN for a plain employee — including the asset's own current holder", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
    // Even when this employee IS the current holder of the asset, self-return
    // must still be rejected — only manage-assets/HR/admin/owner/superuser
    // may return any asset.
    mockAssignmentFindFirst.mockResolvedValue({
      id: "assign1",
      assetId: "a1",
      userId: "u1",
    });
    const res = makeRes();
    await returnAsset(
      makeReq({ user: { userId: "u1", tenantRole: "employee" } }),
      res,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    );
    expect(mockAssignmentUpdate).not.toHaveBeenCalled();
    expect(mockAssetUpdate).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "hr"])(
    "allows a caller with tenantRole=%s",
    async (tenantRole) => {
      const res = makeRes();
      await returnAsset(makeReq({ user: { userId: "u1", tenantRole } }), res);
      expect(mockAssignmentUpdate).toHaveBeenCalled();
      expect(mockAssetUpdate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    },
  );

  it("allows a superuser regardless of tenantRole", async () => {
    mockUserFindUnique.mockResolvedValue({ isSuperUser: true });
    const res = makeRes();
    await returnAsset(
      makeReq({ user: { userId: "u1", tenantRole: "employee" } }),
      res,
    );
    expect(mockAssignmentUpdate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
    );
  });

  it("allows a plain employee holding the Assets:manage permission grant", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: ["Assets:manage"],
    });
    const res = makeRes();
    await returnAsset(
      makeReq({ user: { userId: "u1", tenantRole: "employee" } }),
      res,
    );
    expect(mockAssignmentUpdate).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
    );
  });

  it("checks authorization before touching the asset/assignment records", async () => {
    mockUserFindUnique.mockResolvedValue({
      isSuperUser: false,
      permissions: [],
    });
    const res = makeRes();
    await returnAsset(
      makeReq({ user: { userId: "u1", tenantRole: "employee" } }),
      res,
    );
    expect(mockAssetFindUnique).not.toHaveBeenCalled();
    expect(mockAssignmentFindFirst).not.toHaveBeenCalled();
  });
});
