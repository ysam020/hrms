import { prisma } from "@hrms/db";
import {
  isCompOffLeaveType,
  getAvailableCompOffDays,
  consumeCompOffCredits,
  restoreCompOffCredits,
} from "../handlers/leaveBalanceHelpers";

jest.mock("@hrms/db", () => {
  const _db = {
    compOffCredit: {
      findMany: jest.fn(),
      update: jest.fn(),
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
const mockUpdate = (prisma as any).compOffCredit.update as jest.Mock;
const mockUpdateMany = (prisma as any).compOffCredit.updateMany as jest.Mock;

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
    mockUpdate.mockResolvedValue({});

    const covered = await consumeCompOffCredits("t1", "u1", 2, "leave-1");

    expect(covered).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "c1" },
      data: { status: "used", usedInLeaveApplicationId: "leave-1" },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "c2" },
      data: { status: "used", usedInLeaveApplicationId: "leave-1" },
    });
  });

  it("stops once enough credit is consumed, even if it slightly overshoots", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", earnedDays: 1, sourceDate: "2026-01-01" },
      { id: "c2", earnedDays: 1, sourceDate: "2026-01-05" },
    ]);
    mockUpdate.mockResolvedValue({});

    const covered = await consumeCompOffCredits("t1", "u1", 1.5, "leave-1");

    expect(covered).toBe(2); // consumed both whole credits to cover 1.5
    expect(mockUpdate).toHaveBeenCalledTimes(2);
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
