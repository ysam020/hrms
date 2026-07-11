import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";
import { writeVersionedSettings } from "../handlers/tenantSettings";

jest.mock("@hrms/db", () => {
  const _db = {
    tenantSettings: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { delete: jest.fn() },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockSettingsFindFirst = (prisma as any).tenantSettings
  .findFirst as jest.Mock;
const mockCreate = (prisma as any).tenantSettings.create as jest.Mock;
const mockUpdate = (prisma as any).tenantSettings.update as jest.Mock;
const mockCacheDelete = cacheManager.delete as jest.Mock;

describe("writeVersionedSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheDelete.mockResolvedValue(undefined);
    // getActiveSettings() call — no prior active row.
    mockSettingsFindFirst.mockResolvedValueOnce(null);
    // "does a same-effectiveFrom row already exist" check — no.
    mockSettingsFindFirst.mockResolvedValueOnce(null);
  });

  it("invalidates both the attendance and leave settings caches when the write takes effect immediately", async () => {
    mockCreate.mockResolvedValue({ id: "s1", leavePolicies: [] });
    const effectiveFrom = new Date(Date.now() - 1000); // already active

    await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(mockCacheDelete).toHaveBeenCalledWith(
      "tenantSettings:attendance:t1",
    );
    expect(mockCacheDelete).toHaveBeenCalledWith("tenantSettings:leave:t1");
  });

  it("does not invalidate the cache for a future-dated (pending) settings change", async () => {
    mockCreate.mockResolvedValue({ id: "s1", leavePolicies: [] });
    const effectiveFrom = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow

    await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(mockCacheDelete).not.toHaveBeenCalled();
  });

  it("still returns the write result even if cache invalidation fails", async () => {
    mockCreate.mockResolvedValue({ id: "s1", leavePolicies: [] });
    mockCacheDelete.mockRejectedValue(new Error("redis down"));
    const effectiveFrom = new Date(Date.now() - 1000);

    const result = await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(result.settings.id).toBe("s1");
  });

  it("updates instead of creating when a row with the same effectiveFrom already exists (double-submit)", async () => {
    const effectiveFrom = new Date(Date.now() - 1000);
    // Override the second findFirst call (same-effectiveFrom check) to hit.
    mockSettingsFindFirst.mockReset();
    mockSettingsFindFirst
      .mockResolvedValueOnce(null) // getActiveSettings
      .mockResolvedValueOnce({ id: "existing-1" }); // same-effectiveFrom row
    mockUpdate.mockResolvedValue({ id: "existing-1", leavePolicies: [] });

    await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "existing-1" } }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("updates the active row in place for an immediate save, instead of appending a new version", async () => {
    const effectiveFrom = new Date(Date.now() - 1000);
    mockSettingsFindFirst.mockReset();
    // getActiveSettings() — an active row already exists.
    mockSettingsFindFirst.mockResolvedValueOnce({
      id: "active-1",
      leavePolicies: [],
    });
    mockUpdate.mockResolvedValue({ id: "active-1", leavePolicies: [] });

    await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "active-1" } }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    // Only the getActiveSettings lookup should run — no separate
    // same-effectiveFrom check, since the active row is the target.
    expect(mockSettingsFindFirst).toHaveBeenCalledTimes(1);
  });

  it("still creates a new version for a forward-dated scheduled change even when an active version exists", async () => {
    const effectiveFrom = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow
    mockSettingsFindFirst.mockReset();
    mockSettingsFindFirst
      .mockResolvedValueOnce({ id: "active-1", leavePolicies: [] }) // getActiveSettings
      .mockResolvedValueOnce(null); // no same-effectiveFrom row yet
    mockCreate.mockResolvedValue({ id: "future-1", leavePolicies: [] });

    await writeVersionedSettings(
      "t1",
      "admin-1",
      { medicalCertRequired: true },
      effectiveFrom,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "t1", effectiveFrom }),
      }),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
