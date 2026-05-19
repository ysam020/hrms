import { prisma } from "@hrms/db";
import { updateLeaveBalance } from "../jobs/updateLeaveBalance";

jest.mock("@hrms/db", () => {
  const _db = {
    leaveBalance: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
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

const mockFindMany = (prisma as any).leaveBalance.findMany as jest.Mock;
const mockUpdate = (prisma as any).leaveBalance.update as jest.Mock;

describe("updateLeaveBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    // Default: non-April month
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 5, 15)); // June 15
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when there are no leave balance records", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateLeaveBalance();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accumulates remainingPL from past months into accumulatedPLBeforeCurrentMonth", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 0,
        balances: [
          { year: 2024, month: 4, remainingPL: 3 }, // past month
          { year: 2024, month: 5, remainingPL: 2 }, // past month
          { year: 2024, month: 6, remainingPL: 1 }, // current month — NOT accumulated
        ],
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({
        accumulatedPLBeforeCurrentMonth: 5, // 3 + 2 from past months
      }),
    });
  });

  it("zeroes out remainingPL for past months after accumulating", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 0,
        balances: [{ year: 2024, month: 4, remainingPL: 3 }],
      },
    ]);

    await updateLeaveBalance();

    const updatedBalances = mockUpdate.mock.calls[0][0].data.balances;
    expect(updatedBalances[0].remainingPL).toBe(0);
  });

  it("caps accumulated PL at carryForwardLeaves (default 15) in April", async () => {
    jest.setSystemTime(new Date(2024, 3, 1)); // April 1
    process.env.CARRY_FORWARD_LEAVES = "15";

    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 10,
        balances: [
          { year: 2024, month: 1, remainingPL: 4 },
          { year: 2024, month: 2, remainingPL: 4 },
          { year: 2024, month: 3, remainingPL: 4 }, // total would be 22, capped at 15
        ],
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({
        accumulatedPLBeforeCurrentMonth: 15,
      }),
    });

    delete process.env.CARRY_FORWARD_LEAVES;
  });

  it("does not cap accumulated PL in non-April months even if over limit", async () => {
    jest.setSystemTime(new Date(2024, 5, 15)); // June — not April
    process.env.CARRY_FORWARD_LEAVES = "15";

    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 10,
        balances: [
          { year: 2024, month: 3, remainingPL: 4 },
          { year: 2024, month: 4, remainingPL: 4 },
          { year: 2024, month: 5, remainingPL: 4 },
        ],
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({
        accumulatedPLBeforeCurrentMonth: 22, // 10 + 12, not capped
      }),
    });

    delete process.env.CARRY_FORWARD_LEAVES;
  });

  it("adds existing accumulatedPLBeforeCurrentMonth to accumulated past PL", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 5, // existing carry
        balances: [{ year: 2024, month: 4, remainingPL: 3 }], // past month
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({
        accumulatedPLBeforeCurrentMonth: 8, // 5 + 3
      }),
    });
  });

  it("skips current and future months when accumulating", async () => {
    jest.setSystemTime(new Date(2024, 5, 15)); // June 2024

    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        username: "john",
        accumulatedPLBeforeCurrentMonth: 0,
        balances: [
          { year: 2024, month: 6, remainingPL: 5 }, // current month
          { year: 2024, month: 7, remainingPL: 5 }, // future month
          { year: 2024, month: 12, remainingPL: 5 }, // future month
        ],
      },
    ]);

    await updateLeaveBalance();

    // No past months to accumulate — update still runs but accumulated stays 0
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({
        accumulatedPLBeforeCurrentMonth: 0,
      }),
    });
  });

  it("throws when the database call fails", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateLeaveBalance()).rejects.toThrow("DB error");
  });
});
