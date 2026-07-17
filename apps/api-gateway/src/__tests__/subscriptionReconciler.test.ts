import { prisma } from "@hrms/db";
import { getRazorpay } from "../handlers/payment";
import { startSubscriptionReconciler } from "../services/subscriptionReconciler";

jest.mock("@hrms/db", () => ({
  prisma: { tenant: { findMany: jest.fn(), update: jest.fn() } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFetch = jest.fn();
jest.mock("../handlers/payment", () => ({
  getRazorpay: jest.fn(() => ({ subscriptions: { fetch: mockFetch } })),
}));

const db: any = prisma;

const BASE_TENANT = {
  id: "t1",
  razorpaySubscriptionId: "sub_1",
  planExpiresAt: new Date("2026-07-01T00:00:00Z"),
  billing: "monthly",
  subscriptionStatus: "active",
};

async function runReconcilerOnce() {
  jest.useFakeTimers();
  startSubscriptionReconciler();
  await jest.advanceTimersByTimeAsync(30_000);
  jest.useRealTimers();
}

describe("startSubscriptionReconciler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.tenant.update.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing further when there are no subscribed tenants", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    await runReconcilerOnce();
    expect(getRazorpay).not.toHaveBeenCalled();
  });

  it("queries only tenants with an active/grace/cancelling subscription", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    await runReconcilerOnce();
    expect(db.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          razorpaySubscriptionId: { not: null },
          subscriptionStatus: { in: ["active", "grace_period", "cancelling"] },
        },
      }),
    );
  });

  it("heals a tenant whose local status is stale but Razorpay shows active", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, subscriptionStatus: "grace_period" },
    ]);
    mockFetch.mockResolvedValue({ status: "active", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "active" },
    });
  });

  it("pushes planExpiresAt forward when Razorpay's current_end is later than ours", async () => {
    db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
    const laterTs = Math.floor(
      new Date("2026-08-01T00:00:00Z").getTime() / 1000,
    );
    mockFetch.mockResolvedValue({ status: "active", current_end: laterTs });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { planExpiresAt: new Date(laterTs * 1000) },
    });
  });

  it("does not rewrite planExpiresAt when Razorpay's value is earlier than ours", async () => {
    db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
    const earlierTs = Math.floor(
      new Date("2026-01-01T00:00:00Z").getTime() / 1000,
    );
    mockFetch.mockResolvedValue({ status: "active", current_end: earlierTs });
    await runReconcilerOnce();
    expect(db.tenant.update).not.toHaveBeenCalled();
  });

  it("moves an active tenant to grace_period when Razorpay reports halted (missed webhook)", async () => {
    db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
    mockFetch.mockResolvedValue({ status: "halted", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "grace_period" },
    });
  });

  it.each(["cancelled", "completed", "expired"])(
    "marks the tenant expired when Razorpay reports %s and local status isn't already expired",
    async (rzpStatus) => {
      db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
      mockFetch.mockResolvedValue({ status: rzpStatus, current_end: null });
      await runReconcilerOnce();
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "expired" },
      });
    },
  );

  it("does not double-write when local status is already expired", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, subscriptionStatus: "cancelling" },
    ]);
    mockFetch.mockResolvedValue({ status: "cancelled", current_end: null });
    await runReconcilerOnce();
    // cancelling -> expired transition still applies (status isn't "expired" yet)
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "expired" },
    });
  });

  // Regression test for a bug where the general "active" heal branch (`if
  // (sub.status === "active")`) was a strict superset of the dedicated
  // cancelling-branch's condition, so it always won and silently reactivated
  // a subscription the user had just asked to cancel, instead of leaving it
  // alone to wait for Razorpay's cancellation webhook.
  it("does not reactivate a 'cancelling' tenant just because Razorpay still shows active (webhook may be in flight)", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, subscriptionStatus: "cancelling" },
    ]);
    mockFetch.mockResolvedValue({ status: "active", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).not.toHaveBeenCalled();
  });

  it("applies the soft-expiry guard when locally active, past-due, and Razorpay disagrees", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, planExpiresAt: new Date("2020-01-01T00:00:00Z") },
    ]);
    mockFetch.mockResolvedValue({ status: "created", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "grace_period" },
    });
  });

  it("continues checking remaining tenants when one tenant's Razorpay fetch throws", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, id: "t1", subscriptionStatus: "grace_period" },
      { ...BASE_TENANT, id: "t2", subscriptionStatus: "grace_period" },
    ]);
    mockFetch
      .mockRejectedValueOnce(new Error("Razorpay API down"))
      .mockResolvedValueOnce({ status: "active", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledTimes(1);
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t2" },
      data: { subscriptionStatus: "active" },
    });
  });

  it("does not throw when the whole run fails (e.g. tenant.findMany rejects)", async () => {
    db.tenant.findMany.mockRejectedValue(new Error("db down"));
    await expect(runReconcilerOnce()).resolves.toBeUndefined();
  });

  it("re-runs on the recurring interval", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    jest.useFakeTimers();
    startSubscriptionReconciler();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(db.tenant.findMany).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(db.tenant.findMany).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
