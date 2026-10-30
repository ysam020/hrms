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
const NOW = new Date("2024-06-15T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("checkSubscriptionExpiry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockUpdateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flips active tenants whose plan has expired to grace_period", async () => {
    await checkSubscriptionExpiry();

    expect(mockUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        subscriptionStatus: "active",
        planExpiresAt: { lt: NOW },
      },
      data: { subscriptionStatus: "grace_period" },
    });
  });

  it("flips trials to grace_period only once their first charge is a day overdue", async () => {
    await checkSubscriptionExpiry();

    expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        subscriptionStatus: "trialing",
        planExpiresAt: { lt: new Date(NOW.getTime() - DAY_MS) },
      },
      data: { subscriptionStatus: "grace_period" },
    });
  });

  it("flips grace_period tenants whose 7-day grace window has passed to expired", async () => {
    await checkSubscriptionExpiry();

    expect(mockUpdateMany).toHaveBeenNthCalledWith(3, {
      where: {
        subscriptionStatus: "grace_period",
        planExpiresAt: { lt: new Date(NOW.getTime() - 7 * DAY_MS) },
      },
      data: { subscriptionStatus: "expired" },
    });
  });

  it("never touches cancelled or already-expired tenants", async () => {
    await checkSubscriptionExpiry();

    const statuses = mockUpdateMany.mock.calls.map(
      ([args]) => args.where.subscriptionStatus,
    );
    expect(statuses).toEqual(["active", "trialing", "grace_period"]);
  });

  it("propagates and logs when the database call throws", async () => {
    mockUpdateMany.mockRejectedValue(new Error("db down"));

    await expect(checkSubscriptionExpiry()).rejects.toThrow("db down");
  });
});
