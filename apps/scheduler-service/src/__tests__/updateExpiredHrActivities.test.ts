import { prisma } from "@hrms/db";
import { updateExpiredHrActivities } from "../jobs/updateExpiredHrActivities";

jest.mock("@hrms/db", () => {
  const _db = {
    hrActivity: { findMany: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

const mockFindMany = (prisma as any).hrActivity.findMany as jest.Mock;
const mockUpdateMany = (prisma as any).hrActivity.updateMany as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;

const expiringActivity = {
  id: "a1",
  tenantId: "t1",
  title: "Team offsite",
  createdBy: "u1",
};

describe("updateExpiredHrActivities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15, 2024 noon
    mockFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("finds Active activities scheduled in the past, then updates just those by id", async () => {
    mockFindMany.mockResolvedValue([expiringActivity]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await updateExpiredHrActivities();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        status: "Active",
        scheduledAt: { lt: expect.any(Date) },
      },
      select: expect.any(Object),
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1"] } },
      data: expect.objectContaining({
        status: "Expired",
        lastUpdatedBy: "System",
        lastUpdatedOn: expect.any(Date),
      }),
    });
  });

  it("sets status to 'Expired' and lastUpdatedBy to 'System'", async () => {
    mockFindMany.mockResolvedValue([expiringActivity]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await updateExpiredHrActivities();

    const updateData = mockUpdateMany.mock.calls[0][0].data;
    expect(updateData.status).toBe("Expired");
    expect(updateData.lastUpdatedBy).toBe("System");
  });

  it("completes successfully when no activities need expiring", async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(updateExpiredHrActivities()).resolves.toBeUndefined();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("uses a Date object for the scheduledAt lt filter", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateExpiredHrActivities();

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.scheduledAt.lt).toBeInstanceOf(Date);
  });

  it("throws when the database call fails", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateExpiredHrActivities()).rejects.toThrow("DB error");
  });
});
