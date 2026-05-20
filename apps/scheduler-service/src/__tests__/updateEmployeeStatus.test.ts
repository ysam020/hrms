import { prisma } from "@hrms/db";
import { updateEmployeeStatus } from "../jobs/updateEmployeeStatus";

jest.mock("@hrms/db", () => {
  const _db = {
    resignation: { findMany: jest.fn() },
    user: { update: jest.fn() },
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

const mockFindMany = (prisma as any).resignation.findMany as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;

describe("updateEmployeeStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ count: 1 });
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 5, 12, 0, 0)); // March 5, 2024 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when no resignations have yesterday as lastDate", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("queries resignations where lastWorkingDay is yesterday", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();

    // Yesterday = March 4
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2024-03-04T00:00:00.000Z"),
          lt: new Date("2024-03-05T00:00:00.000Z"),
        },
      },
    });
  });

  it("updates each employee with resignation lastDate to Resigned", async () => {
    mockFindMany.mockResolvedValue([
      { userId: "john-id", lastDate: "2024-03-04" },
      { userId: "jane-id", lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "john-id" },
      data: { employeeStatus: "Resigned" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "jane-id" },
      data: { employeeStatus: "Resigned" },
    });
  });

  it("skips resignations with null or missing userId", async () => {
    mockFindMany.mockResolvedValue([
      { userId: null, lastDate: "2024-03-04" },
      { userId: undefined, lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("correctly computes yesterday across a month boundary", async () => {
    jest.setSystemTime(new Date(2024, 3, 1, 12, 0, 0)); // April 1 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    // Yesterday = March 31
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2024-03-31T00:00:00.000Z"),
          lt: new Date("2024-04-01T00:00:00.000Z"),
        },
      },
    });
  });

  it("correctly computes yesterday across a year boundary", async () => {
    jest.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // January 1, 2024 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        lastWorkingDay: {
          gte: new Date("2023-12-31T00:00:00.000Z"),
          lt: new Date("2024-01-01T00:00:00.000Z"),
        },
      },
    });
  });

  it("throws when the database call fails", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateEmployeeStatus()).rejects.toThrow("DB error");
  });
});
