import { prisma } from "@hrms/db";
import { updateExpiredJobOpenings } from "../jobs/updateExpiredJobOpenings";

jest.mock("@hrms/db", () => ({
  prisma: {
    jobOpening: { updateMany: jest.fn() },
  },
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
        applicationDeadline: { lt: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: "Expired",
        lastUpdateBy: "System",
        lastUpdatedOn: expect.any(Date),
      }),
    });
  });

  it("uses current Date for the deadline lt filter", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await updateExpiredJobOpenings();

    const deadlineFilter =
      mockUpdateMany.mock.calls[0][0].where.applicationDeadline.lt;
    // Should be a Date close to the mocked current time
    expect(deadlineFilter).toBeInstanceOf(Date);
    expect(deadlineFilter.getFullYear()).toBe(2024);
    expect(deadlineFilter.getMonth()).toBe(2); // March
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
