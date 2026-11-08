import { prisma } from "@hrms/db";
import { updateExpiredJobOpenings } from "../jobs/updateExpiredJobOpenings";

jest.mock("@hrms/db", () => {
  const _db = {
    jobOpening: { updateMany: jest.fn() },
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: "t1", dbName: "db-t1" }]),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
    runWithTenant: jest.fn((_id: string, _client: unknown, fn: () => unknown) =>
      fn(),
    ),
    getClientForDb: jest.fn(() => ({})),
    runForTenant: jest.fn((_id: string, fn: () => unknown) => fn()),
  };
});

jest.mock("@hrms/cache", () => ({
  cacheManager: { invalidatePattern: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).jobOpening.updateMany as jest.Mock;

describe("updateExpiredJobOpenings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 15, 12, 0, 0)); // March 15, 2024 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates Active job openings past their deadline to Expired", async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });
    await updateExpiredJobOpenings();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        status: "Active",
        applicationDeadline: { lte: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: "Expired",
        lastUpdateBy: "System",
        lastUpdatedOn: expect.any(Date),
      }),
    });
  });

  it("expires only deadlines a full day in the past (the deadline day stays open)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await updateExpiredJobOpenings();

    const deadlineFilter =
      mockUpdateMany.mock.calls[0][0].where.applicationDeadline.lte;
    expect(deadlineFilter).toBeInstanceOf(Date);
    expect(deadlineFilter.getTime()).toBe(
      new Date(2024, 2, 15, 12, 0, 0).getTime() - 24 * 60 * 60 * 1000,
    );
  });

  it("sets status to 'Expired' and lastUpdateBy to 'System'", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    await updateExpiredJobOpenings();

    const data = mockUpdateMany.mock.calls[0][0].data;
    expect(data.status).toBe("Expired");
    expect(data.lastUpdateBy).toBe("System");
    expect(data.lastUpdatedOn).toBeInstanceOf(Date);
  });

  it("completes successfully when no job openings need expiring", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(updateExpiredJobOpenings()).resolves.toBeUndefined();
  });

  it("only targets 'Active' status — not already Expired or Closed", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await updateExpiredJobOpenings();

    const where = mockUpdateMany.mock.calls[0][0].where;
    expect(where.status).toBe("Active");
  });

  it("throws when the database call fails", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB error"));
    await expect(updateExpiredJobOpenings()).rejects.toThrow("DB error");
  });
});
