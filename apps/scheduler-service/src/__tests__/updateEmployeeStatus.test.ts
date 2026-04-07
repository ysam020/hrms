import { prisma } from "@hrms/db";
import { updateEmployeeStatus } from "../jobs/updateEmployeeStatus";

jest.mock("@hrms/db", () => ({
  prisma: {
    resignation: { findMany: jest.fn() },
    user: { updateMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFindMany = (prisma as any).resignation.findMany as jest.Mock;
const mockUpdateMany = prisma.user.updateMany as jest.Mock;

describe("updateEmployeeStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 2, 5, 12, 0, 0)); // March 5, 2024 noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when no resignations have yesterday as lastDate", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("queries resignations where lastDate is yesterday", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateEmployeeStatus();

    // Yesterday = March 4
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { lastDate: "2024-03-04" },
    });
  });

  it("updates each employee with resignation lastDate to Resigned", async () => {
    mockFindMany.mockResolvedValue([
      { username: "john", lastDate: "2024-03-04" },
      { username: "jane", lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();

    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { username: "john" },
      data: { employeeStatus: "Resigned" },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { username: "jane" },
      data: { employeeStatus: "Resigned" },
    });
  });

  it("skips resignations with null or missing username", async () => {
    mockFindMany.mockResolvedValue([
      { username: null, lastDate: "2024-03-04" },
      { username: undefined, lastDate: "2024-03-04" },
    ]);

    await updateEmployeeStatus();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("correctly computes yesterday across a month boundary", async () => {
    jest.setSystemTime(new Date(2024, 3, 1, 12, 0, 0)); // April 1 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    // Yesterday = March 31
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { lastDate: "2024-03-31" },
    });
  });

  it("correctly computes yesterday across a year boundary", async () => {
    jest.setSystemTime(new Date(2024, 0, 1, 12, 0, 0)); // January 1, 2024 noon
    mockFindMany.mockResolvedValue([]);

    await updateEmployeeStatus();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { lastDate: "2023-12-31" },
    });
  });

  it("throws when the database call fails", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateEmployeeStatus()).rejects.toThrow("DB error");
  });
});
