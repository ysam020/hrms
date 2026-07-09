import { prisma } from "@hrms/db";
import {
  isCompOffLeaveType,
  getAvailableCompOffDays,
  consumeCompOffCredits,
  restoreCompOffCredits,
  adjustBalance,
} from "../handlers/leaveBalanceHelpers";

jest.mock("@hrms/db", () => {
  const _db = {
    compOffCredit: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    leaveBalance: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return {
    prisma: _db,
    prismaWithTenant: _db,
    getTenantId: jest.fn().mockReturnValue("t1"),
  };
});

const mockFindMany = (prisma as any).compOffCredit.findMany as jest.Mock;
const mockUpdateMany = (prisma as any).compOffCredit.updateMany as jest.Mock;
const mockBalanceFindFirst = (prisma as any).leaveBalance
  .findFirst as jest.Mock;
const mockBalanceUpdateMany = (prisma as any).leaveBalance
  .updateMany as jest.Mock;

describe("isCompOffLeaveType", () => {
  it("matches COMP_OFF case-insensitively", () => {
    expect(isCompOffLeaveType("COMP_OFF")).toBe(true);
    expect(isCompOffLeaveType("comp_off")).toBe(true);
  });
  it("returns false for other leave types and empty input", () => {
    expect(isCompOffLeaveType("PL")).toBe(false);
    expect(isCompOffLeaveType(undefined)).toBe(false);
    expect(isCompOffLeaveType(null)).toBe(false);
  });
});

describe("getAvailableCompOffDays", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sums earnedDays across available credits", async () => {
    mockFindMany.mockResolvedValue([{ earnedDays: 1 }, { earnedDays: 0.5 }]);
    const total = await getAvailableCompOffDays("t1", "u1");
    expect(total).toBe(1.5);
  });

  it("returns 0 when there are no available credits", async () => {
    mockFindMany.mockResolvedValue([]);
    expect(await getAvailableCompOffDays("t1", "u1")).toBe(0);
  });
});

describe("consumeCompOffCredits", () => {
  beforeEach(() => jest.clearAllMocks());

  it("consumes the oldest credits first until the requested days are covered", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", earnedDays: 1, sourceDate: "2026-01-01" },
      { id: "c2", earnedDays: 1, sourceDate: "2026-01-05" },
      { id: "c3", earnedDays: 1, sourceDate: "2026-01-10" },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const covered = await consumeCompOffCredits("t1", "u1", 2, "leave-1");

    expect(covered).toBe(2);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "c1", status: "available" },
      data: { status: "used", usedInLeaveApplicationId: "leave-1" },
    });
    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "c2", status: "available" },
      data: { status: "used", usedInLeaveApplicationId: "leave-1" },
    });
  });

  it("stops once enough credit is consumed, even if it slightly overshoots", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", earnedDays: 1, sourceDate: "2026-01-01" },
      { id: "c2", earnedDays: 1, sourceDate: "2026-01-05" },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const covered = await consumeCompOffCredits("t1", "u1", 1.5, "leave-1");

    expect(covered).toBe(2); // consumed both whole credits to cover 1.5
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("skips a credit that a concurrent consumer already claimed", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", earnedDays: 1, sourceDate: "2026-01-01" },
      { id: "c2", earnedDays: 1, sourceDate: "2026-01-05" },
    ]);
    // First credit lost the race (already claimed elsewhere); second succeeds.
    mockUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const covered = await consumeCompOffCredits("t1", "u1", 1, "leave-1");

    expect(covered).toBe(1); // only c2's day counted
  });
});

describe("restoreCompOffCredits", () => {
  it("reverts every credit consumed by the given leave application", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    await restoreCompOffCredits("leave-1");
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { usedInLeaveApplicationId: "leave-1", status: "used" },
      data: { status: "available", usedInLeaveApplicationId: null },
    });
  });
});

describe("adjustBalance", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when the user has no balance row", async () => {
    mockBalanceFindFirst.mockResolvedValue(null);
    await adjustBalance("t1", "u1", "PL", -1);
    expect(mockBalanceUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when this leave type isn't balance-tracked", async () => {
    mockBalanceFindFirst.mockResolvedValue({
      id: "b1",
      balances: { SL: 5 },
      updatedAt: new Date("2026-01-01"),
    });
    await adjustBalance("t1", "u1", "PL", -1);
    expect(mockBalanceUpdateMany).not.toHaveBeenCalled();
  });

  it("debits the tracked balance conditioned on the row's updatedAt", async () => {
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    mockBalanceFindFirst.mockResolvedValue({
      id: "b1",
      balances: { PL: 10 },
      updatedAt,
    });
    mockBalanceUpdateMany.mockResolvedValue({ count: 1 });

    await adjustBalance("t1", "u1", "PL", -2);

    expect(mockBalanceUpdateMany).toHaveBeenCalledWith({
      where: { id: "b1", updatedAt },
      data: { balances: { PL: 8 } },
    });
  });

  it("retries with a fresh read when a concurrent writer wins the race", async () => {
    const staleUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    const freshUpdatedAt = new Date("2026-01-01T00:00:05.000Z");
    mockBalanceFindFirst
      .mockResolvedValueOnce({
        id: "b1",
        balances: { PL: 10 },
        updatedAt: staleUpdatedAt,
      })
      .mockResolvedValueOnce({
        id: "b1",
        balances: { PL: 9 }, // another writer already debited 1
        updatedAt: freshUpdatedAt,
      });
    mockBalanceUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // lost the race on the first attempt
      .mockResolvedValueOnce({ count: 1 }); // wins on retry

    await adjustBalance("t1", "u1", "PL", -1);

    expect(mockBalanceUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockBalanceUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "b1", updatedAt: freshUpdatedAt },
      data: { balances: { PL: 8 } },
    });
  });
});
