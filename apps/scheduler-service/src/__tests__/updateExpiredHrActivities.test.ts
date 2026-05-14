import { prisma } from "@hrms/db";
import { updateExpiredHrActivities } from "../jobs/updateExpiredHrActivities";

jest.mock("@hrms/db", () => ({
  prisma: {
    hrActivity: { updateMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).hrActivity.updateMany as jest.Mock;

describe("updateExpiredHrActivities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15, 2024 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls updateMany with correct where clause targeting past Active activities", async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });
    await updateExpiredHrActivities();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        status: "Active",
        scheduledAt: { lt: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: "Expired",
        lastUpdatedBy: "System",
        lastUpdatedOn: expect.any(Date),
      }),
    });
  });

  it("sets status to 'Expired' and lastUpdatedBy to 'System'", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    await updateExpiredHrActivities();

    const updateData = mockUpdateMany.mock.calls[0][0].data;
    expect(updateData.status).toBe("Expired");
    expect(updateData.lastUpdatedBy).toBe("System");
  });

  it("completes successfully when no activities need expiring (count 0)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(updateExpiredHrActivities()).resolves.toBeUndefined();
  });

  it("uses a Date object for the scheduledAt lt filter", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await updateExpiredHrActivities();

    const where = mockUpdateMany.mock.calls[0][0].where;
    expect(where.scheduledAt.lt).toBeInstanceOf(Date);
  });

  it("throws when the database call fails", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB error"));
    await expect(updateExpiredHrActivities()).rejects.toThrow("DB error");
  });
});
