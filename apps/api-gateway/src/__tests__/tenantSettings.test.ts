import { prismaWithTenant as prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import {
  getTenantSettings,
  updateTenantSettings,
  cancelPendingSettings,
  toPublic,
  SETTINGS_DEFAULTS,
} from "../handlers/tenantSettings";

jest.mock("@hrms/db", () => {
  const _db: any = {
    tenantSettings: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  return { prismaWithTenant: _db };
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
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/cache", () => ({
  cacheManager: { delete: jest.fn().mockResolvedValue(undefined) },
}));

const mockFindFirst = (prisma as any).tenantSettings.findFirst as jest.Mock;
const mockFindMany = (prisma as any).tenantSettings.findMany as jest.Mock;
const mockUpdate = (prisma as any).tenantSettings.update as jest.Mock;
const mockCreate = (prisma as any).tenantSettings.create as jest.Mock;
const mockDelete = (prisma as any).tenantSettings.delete as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

function makeReq(overrides: any = {}) {
  return {
    user: { userId: "u1", tenantId: "t1", tenantRole: "owner" },
    body: {},
    params: {},
    ...overrides,
  } as any;
}
function makeRes() {
  return { json: jest.fn() } as any;
}

describe("tenantSettings handlers", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getTenantSettings", () => {
    it("returns FORBIDDEN without an active tenant", async () => {
      const req = makeReq({ user: { userId: "u1", tenantId: null } });
      const res = makeRes();
      await getTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns schema defaults when no active settings row exists yet", async () => {
      mockFindFirst.mockResolvedValue(null);
      mockFindMany.mockResolvedValue([]);
      const req = makeReq();
      const res = makeRes();
      await getTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            active: expect.objectContaining({
              paidLeavesPerYear: SETTINGS_DEFAULTS.paidLeavesPerYear,
              effectiveFrom: null,
              id: null,
            }),
            pending: [],
          }),
        }),
      );
    });

    it("returns the mapped active row and pending rows", async () => {
      mockFindFirst.mockResolvedValue({
        id: "s1",
        effectiveFrom: new Date("2024-01-01"),
        paidLeavesPerYear: 15,
      });
      mockFindMany.mockResolvedValue([
        {
          id: "s2",
          effectiveFrom: new Date("2025-01-01"),
          paidLeavesPerYear: 20,
        },
      ]);
      const req = makeReq();
      const res = makeRes();
      await getTenantSettings(req, res);
      const data = (res.json.mock.calls[0][0] as any).data;
      expect(data.active.id).toBe("s1");
      expect(data.active.paidLeavesPerYear).toBe(15);
      expect(data.pending).toHaveLength(1);
      expect(data.pending[0].id).toBe("s2");
    });
  });

  describe("updateTenantSettings", () => {
    it("returns FORBIDDEN without an active tenant", async () => {
      const req = makeReq({ user: { userId: "u1", tenantId: null } });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns FORBIDDEN for a plain member with no explicit grant", async () => {
      mockUserFindUnique.mockResolvedValue({ permissions: [] });
      const req = makeReq({
        user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
        body: { settings: {} },
      });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("allows a member with the explicit Organisation:edit_organisation_settings grant", async () => {
      mockUserFindUnique.mockResolvedValue({
        permissions: ["Organisation:edit_organisation_settings"],
      });
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "s1", effectiveFrom: new Date() });
      const req = makeReq({
        user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
        body: { settings: { paidLeavesPerYear: 18 } },
      });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(mockCreate).toHaveBeenCalled();
    });

    it("returns BAD_REQUEST for an invalid effectiveFrom date", async () => {
      const req = makeReq({
        body: { settings: {}, effectiveFrom: "not-a-date" },
      });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns BAD_REQUEST for a malformed workWeekPattern", async () => {
      const req = makeReq({
        body: { settings: { workWeekPattern: { type: "bogus" } } },
      });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("workWeekPattern"),
        }),
      );
    });

    it("returns BAD_REQUEST for a negative numeric field", async () => {
      const req = makeReq({ body: { settings: { paidLeavesPerYear: -5 } } });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("returns BAD_REQUEST for workStartHour out of range", async () => {
      const req = makeReq({ body: { settings: { workStartHour: 25 } } });
      const res = makeRes();
      await updateTenantSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("updates the existing active row in place for an immediate save", async () => {
      const currentActive = { id: "s1", paidLeavesPerYear: 12 };
      mockFindFirst.mockResolvedValue(currentActive);
      mockUpdate.mockResolvedValue({ id: "s1", paidLeavesPerYear: 18 });
      const req = makeReq({ body: { settings: { paidLeavesPerYear: 18 } } });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: expect.objectContaining({
          paidLeavesPerYear: 18,
          createdBy: "u1",
        }),
      });
      expect(mockCreate).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Settings applied immediately." }),
      );
    });

    it("creates a new version when there is no active settings row yet", async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ id: "s1", paidLeavesPerYear: 18 });
      const req = makeReq({ body: { settings: { paidLeavesPerYear: 18 } } });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: "t1",
          paidLeavesPerYear: 18,
          createdBy: "u1",
        }),
      });
    });

    it("creates a separate forward-dated row without touching the current active row", async () => {
      const currentActive = { id: "s1", paidLeavesPerYear: 12 };
      mockFindFirst
        .mockResolvedValueOnce(currentActive) // getActiveSettings, inside writeVersionedSettings
        .mockResolvedValueOnce(null); // no existing row at that future effectiveFrom
      mockCreate.mockResolvedValue({ id: "s2", paidLeavesPerYear: 20 });
      const futureDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const req = makeReq({
        body: {
          settings: { paidLeavesPerYear: 20 },
          effectiveFrom: futureDate,
        },
      });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Settings scheduled for"),
        }),
      );
    });

    it("overwrites an existing same-effectiveFrom pending row instead of duplicating it", async () => {
      const currentActive = { id: "s1", paidLeavesPerYear: 12 };
      const existingPending = { id: "s2", paidLeavesPerYear: 15 };
      mockFindFirst
        .mockResolvedValueOnce(currentActive)
        .mockResolvedValueOnce(existingPending);
      mockUpdate.mockResolvedValue({ id: "s2", paidLeavesPerYear: 20 });
      const futureDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const req = makeReq({
        body: {
          settings: { paidLeavesPerYear: 20 },
          effectiveFrom: futureDate,
        },
      });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "s2" },
        data: expect.objectContaining({ paidLeavesPerYear: 20 }),
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("invalidates the leave/attendance settings cache on an immediate save", async () => {
      mockFindFirst.mockResolvedValue({ id: "s1" });
      mockUpdate.mockResolvedValue({ id: "s1" });
      const req = makeReq({ body: { settings: { paidLeavesPerYear: 18 } } });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockCacheDelete).toHaveBeenCalledWith(
        "tenantSettings:attendance:t1",
      );
      expect(mockCacheDelete).toHaveBeenCalledWith("tenantSettings:leave:t1");
    });

    it("does not invalidate the cache for a forward-dated (not-yet-active) save", async () => {
      mockFindFirst
        .mockResolvedValueOnce({ id: "s1" })
        .mockResolvedValueOnce(null);
      mockCreate.mockResolvedValue({ id: "s2" });
      const futureDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const req = makeReq({
        body: {
          settings: { paidLeavesPerYear: 18 },
          effectiveFrom: futureDate,
        },
      });
      const res = makeRes();

      await updateTenantSettings(req, res);

      expect(mockCacheDelete).not.toHaveBeenCalled();
    });
  });

  describe("cancelPendingSettings", () => {
    it("returns FORBIDDEN without an active tenant", async () => {
      const req = makeReq({ user: { userId: "u1", tenantId: null } });
      const res = makeRes();
      await cancelPendingSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns FORBIDDEN for a non-privileged member", async () => {
      mockUserFindUnique.mockResolvedValue({ isSuperUser: false });
      const req = makeReq({
        user: { userId: "u1", tenantId: "t1", tenantRole: "member" },
        params: { id: "s2" },
      });
      const res = makeRes();
      await cancelPendingSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 }),
      );
    });

    it("returns NOT_FOUND when the pending version doesn't exist", async () => {
      mockFindFirst.mockResolvedValue(null);
      const req = makeReq({ params: { id: "missing" } });
      const res = makeRes();
      await cancelPendingSettings(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
      );
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("deletes the pending version on success", async () => {
      mockFindFirst.mockResolvedValue({ id: "s2" });
      mockDelete.mockResolvedValue({});
      const req = makeReq({ params: { id: "s2" } });
      const res = makeRes();
      await cancelPendingSettings(req, res);
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "s2" } });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Pending settings change cancelled.",
        }),
      );
    });
  });

  describe("toPublic", () => {
    it("fills in defaults for fields absent on the row", () => {
      const result = toPublic({ id: "s1", effectiveFrom: null });
      expect(result.workWeekPattern).toEqual(SETTINGS_DEFAULTS.workWeekPattern);
      expect(result.customLeaveTypes).toEqual([]);
      expect(result.geofenceRadiusMeters).toBe(200);
    });
  });
});
