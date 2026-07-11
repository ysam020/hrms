import { prisma, prismaWithTenant } from "@hrms/db";
import { updateLeaveBalance } from "../jobs/updateLeaveBalance";

jest.mock("@hrms/db", () => {
  const _master = {
    tenant: { findMany: jest.fn() },
  };
  const _tenantDb = {
    leaveBalance: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tenantSettings: {
      findFirst: jest.fn(),
    },
  };
  return {
    prisma: _master,
    prismaWithTenant: _tenantDb,
    getClientForDb: jest.fn().mockReturnValue({}),
    // Real runWithTenant uses AsyncLocalStorage; the unit test only cares
    // that the callback actually runs, so just invoke it directly.
    runWithTenant: jest.fn((_tenantId, _client, fn) => fn()),
  };
});

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockTenantFindMany = (prisma as any).tenant.findMany as jest.Mock;
const mockFindMany = (prismaWithTenant as any).leaveBalance
  .findMany as jest.Mock;
const mockUpdate = (prismaWithTenant as any).leaveBalance.update as jest.Mock;
const mockUpdateMany = (prismaWithTenant as any).leaveBalance
  .updateMany as jest.Mock;
const mockSettingsFindFirst = (prismaWithTenant as any).tenantSettings
  .findFirst as jest.Mock;

const ONE_TENANT = [{ id: "t1", dbName: "tenant_t1" }];

describe("updateLeaveBalance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockTenantFindMany.mockResolvedValue(ONE_TENANT);
    // No leavePolicies configured by default — falls back to the global
    // env-var carry-forward cap, matching pre-existing behavior.
    mockSettingsFindFirst.mockResolvedValue(null);
    // Default: non-April month
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 5, 15)); // June 15
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when there are no tenants", async () => {
    mockTenantFindMany.mockResolvedValue([]);
    await updateLeaveBalance();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("does nothing when a tenant has no leave balance records", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateLeaveBalance();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("scopes the balance lookup to each tenant", async () => {
    mockFindMany.mockResolvedValue([]);
    await updateLeaveBalance();
    expect(mockFindMany).toHaveBeenCalledWith({ where: { tenantId: "t1" } });
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

  it("uses the tenant's leavePolicies PL carryForward.maxDays instead of the global default", async () => {
    jest.setSystemTime(new Date(2024, 3, 1)); // April 1
    mockSettingsFindFirst.mockResolvedValue({
      leavePolicies: [
        {
          key: "PL",
          name: "Paid Leave",
          carryForward: { enabled: true, maxDays: 5 },
        },
      ],
    });
    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        accumulatedPLBeforeCurrentMonth: 10,
        balances: [],
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({ accumulatedPLBeforeCurrentMonth: 5 }),
    });
  });

  it("forfeits newly-freed PL (but keeps prior accumulation) when carryForward.enabled is false", async () => {
    mockSettingsFindFirst.mockResolvedValue({
      leavePolicies: [
        { key: "PL", name: "Paid Leave", carryForward: { enabled: false } },
      ],
    });
    mockFindMany.mockResolvedValue([
      {
        id: "lb-1",
        accumulatedPLBeforeCurrentMonth: 5,
        balances: [{ year: 2024, month: 4, remainingPL: 3 }],
      },
    ]);

    await updateLeaveBalance();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "lb-1" },
      data: expect.objectContaining({ accumulatedPLBeforeCurrentMonth: 5 }),
    });
  });

  it("continues processing other tenants when one tenant errors", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", dbName: "tenant_t1" },
      { id: "t2", dbName: "tenant_t2" },
    ]);
    mockFindMany
      .mockRejectedValueOnce(new Error("t1 DB unreachable"))
      .mockResolvedValueOnce([]);

    await expect(updateLeaveBalance()).resolves.toBeUndefined();
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  it("does not throw when a single tenant's database call fails", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    await expect(updateLeaveBalance()).resolves.toBeUndefined();
  });

  describe("monthly accrual", () => {
    it("credits daysPerYear/12 onto a tracked flat-map balance", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        leavePolicies: [
          {
            key: "SL",
            name: "Sick Leave",
            accrualMethod: "monthly",
            daysPerYear: 12,
          },
        ],
      });
      mockFindMany.mockResolvedValue([
        { id: "lb-1", updatedAt: new Date(), balances: { SL: 3 } },
      ]);

      await updateLeaveBalance();

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "lb-1" }),
          data: { balances: { SL: 4 } },
        }),
      );
    });

    it("caps accrual at daysPerYear", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        leavePolicies: [
          {
            key: "SL",
            name: "Sick Leave",
            accrualMethod: "monthly",
            daysPerYear: 12,
          },
        ],
      });
      mockFindMany.mockResolvedValue([
        { id: "lb-1", updatedAt: new Date(), balances: { SL: 11.5 } },
      ]);

      await updateLeaveBalance();

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balances: { SL: 12 } } }),
      );
    });

    it("skips a flat-map row where the policy's type isn't tracked yet", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        leavePolicies: [
          {
            key: "SL",
            name: "Sick Leave",
            accrualMethod: "monthly",
            daysPerYear: 12,
          },
        ],
      });
      mockFindMany.mockResolvedValue([
        { id: "lb-1", updatedAt: new Date(), balances: { PL: 8 } }, // no SL entry
      ]);

      await updateLeaveBalance();

      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("skips array-shaped rows entirely (they use PL carry-forward, not accrual)", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        leavePolicies: [
          {
            key: "SL",
            name: "Sick Leave",
            accrualMethod: "monthly",
            daysPerYear: 12,
          },
        ],
      });
      mockFindMany.mockResolvedValue([
        {
          id: "lb-1",
          accumulatedPLBeforeCurrentMonth: 0,
          balances: [{ year: 2024, month: 4, remainingPL: 3 }],
        },
      ]);

      await updateLeaveBalance();

      expect(mockUpdateMany).not.toHaveBeenCalled();
      // Carry-forward still runs normally for this array-shaped row.
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "lb-1" } }),
      );
    });

    it("does nothing when no leavePolicies use monthly accrual", async () => {
      mockSettingsFindFirst.mockResolvedValue({
        leavePolicies: [
          {
            key: "PL",
            name: "Paid Leave",
            accrualMethod: "lump_sum",
            daysPerYear: 12,
          },
        ],
      });
      mockFindMany.mockResolvedValue([
        { id: "lb-1", updatedAt: new Date(), balances: { PL: 8 } },
      ]);

      await updateLeaveBalance();

      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("flat-map balances safety (carry-forward step)", () => {
    it("does not touch a flat-map-shaped row's balances via the array-based carry-forward step", async () => {
      mockFindMany.mockResolvedValue([
        { id: "lb-1", updatedAt: new Date(), balances: { PL: 8 } },
      ]);

      await updateLeaveBalance();

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
