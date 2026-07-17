import { prisma } from "@hrms/db";
import { checkSubscriptionExpiry } from "../jobs/checkSubscriptionExpiry";

jest.mock("@hrms/db", () => ({
  prisma: {
    tenant: { updateMany: jest.fn() },
  },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateMany = (prisma as any).tenant.updateMany as jest.Mock;

describe("checkSubscriptionExpiry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flips active tenants whose plan has expired to grace_period", async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 0 });

    await checkSubscriptionExpiry();

    expect(mockUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        subscriptionStatus: "active",
        planExpiresAt: { lt: new Date("2024-06-15T12:00:00Z") },
      },
      data: { subscriptionStatus: "grace_period" },
    });
  });

  it("flips grace_period tenants whose 7-day grace window has passed to expired", async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });

    await checkSubscriptionExpiry();

    const sevenDaysAgo = new Date(
      new Date("2024-06-15T12:00:00Z").getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        subscriptionStatus: "grace_period",
        planExpiresAt: { lt: sevenDaysAgo },
      },
      data: { subscriptionStatus: "expired" },
    });
  });

  it("propagates and logs when the database call throws", async () => {
    mockUpdateMany.mockRejectedValue(new Error("db down"));

    await expect(checkSubscriptionExpiry()).rejects.toThrow("db down");
  });
});
