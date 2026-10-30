import { prisma } from "@hrms/db";
import { getRedisClient } from "@hrms/cache";
import { getRazorpay, getOrCreatePlanId } from "../handlers/payment";
import { getActiveEmployeeCount } from "../utils/planLimits";
import { startSubscriptionReconciler } from "../services/subscriptionReconciler";

jest.mock("@hrms/db", () => ({
  prisma: { tenant: { findMany: jest.fn(), update: jest.fn() } },
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockRedisSet = jest.fn();
jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(() => ({ set: mockRedisSet })),
}));

const mockFetch = jest.fn();
const mockSubUpdate = jest.fn();
const mockSubCancel = jest.fn();
jest.mock("../handlers/payment", () => ({
  getRazorpay: jest.fn(() => ({
    subscriptions: {
      fetch: mockFetch,
      update: mockSubUpdate,
      cancel: mockSubCancel,
    },
  })),
  getOrCreatePlanId: jest.fn(),
}));

jest.mock("../utils/planLimits", () => ({
  getActiveEmployeeCount: jest.fn(),
}));

const db: any = prisma;
const mockGetActiveEmployeeCount = getActiveEmployeeCount as jest.Mock;
const mockGetOrCreatePlanId = getOrCreatePlanId as jest.Mock;

const BASE_TENANT = {
  id: "t1",
  razorpaySubscriptionId: "sub_1",
  planActivatedAt: new Date("2026-06-01T00:00:00Z"),
  planExpiresAt: new Date("2026-07-01T00:00:00Z"),
  planTier: "growth",
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
    mockRedisSet.mockResolvedValue("OK"); // lock acquired by default
    mockSubCancel.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing further when there are no subscribed tenants", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    await runReconcilerOnce();
    expect(getRazorpay).not.toHaveBeenCalled();
  });

  it("queries only tenants with a trialing/active/grace/cancelling subscription", async () => {
    db.tenant.findMany.mockResolvedValue([]);
    await runReconcilerOnce();
    expect(db.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          razorpaySubscriptionId: { not: null },
          subscriptionStatus: {
            in: ["trialing", "active", "grace_period", "cancelling"],
          },
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

  describe("free trials", () => {
    const TRIAL_TENANT = {
      ...BASE_TENANT,
      subscriptionStatus: "trialing",
      planActivatedAt: null,
      planExpiresAt: new Date("2026-07-01T00:00:00Z"),
    };

    it("leaves a trial alone while Razorpay still shows it authenticated (not yet charged)", async () => {
      db.tenant.findMany.mockResolvedValue([TRIAL_TENANT]);
      mockFetch.mockResolvedValue({
        status: "authenticated",
        current_end: null,
      });
      await runReconcilerOnce();
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("activates a trial whose first charge webhook was missed", async () => {
      db.tenant.findMany.mockResolvedValue([TRIAL_TENANT]);
      const cycleEnd = Math.floor(
        new Date("2026-08-01T00:00:00Z").getTime() / 1000,
      );
      mockFetch.mockResolvedValue({ status: "active", current_end: cycleEnd });
      await runReconcilerOnce();
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          subscriptionStatus: "active",
          planActivatedAt: expect.any(Date),
          planExpiresAt: new Date(cycleEnd * 1000),
        },
      });
    });

    it("marks a trial cancelled when its subscription was cancelled on Razorpay's side", async () => {
      db.tenant.findMany.mockResolvedValue([TRIAL_TENANT]);
      mockFetch.mockResolvedValue({ status: "cancelled", current_end: null });
      await runReconcilerOnce();
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "cancelled" },
      });
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

  it("finalizes a pending downgrade when headcount is within the new tier's limit", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, pendingPlanTier: "starter", pendingBilling: "monthly" },
    ]);
    const laterTs = Math.floor(
      new Date("2026-08-01T00:00:00Z").getTime() / 1000,
    );
    mockFetch.mockResolvedValue({ status: "active", current_end: laterTs });
    mockGetActiveEmployeeCount.mockResolvedValue(10); // within starter's limit of 25
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        planExpiresAt: new Date(laterTs * 1000),
        planTier: "starter",
        billing: "monthly",
        pendingPlanTier: null,
        pendingBilling: null,
        pendingPlanChangeAt: null,
      },
    });
    expect(mockSubUpdate).not.toHaveBeenCalled();
  });

  it("blocks a pending downgrade and reverts Razorpay's plan when headcount exceeds the new tier's limit", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, pendingPlanTier: "starter", pendingBilling: "monthly" },
    ]);
    const laterTs = Math.floor(
      new Date("2026-08-01T00:00:00Z").getTime() / 1000,
    );
    mockFetch.mockResolvedValue({ status: "active", current_end: laterTs });
    mockGetActiveEmployeeCount.mockResolvedValue(30); // exceeds starter's limit of 25
    mockGetOrCreatePlanId.mockResolvedValue("plan_growth_monthly");
    await runReconcilerOnce();

    expect(mockGetOrCreatePlanId).toHaveBeenCalledWith("growth", "monthly");
    expect(mockSubUpdate).toHaveBeenCalledWith("sub_1", {
      plan_id: "plan_growth_monthly",
      quantity: 1,
      schedule_change_at: "now",
    });
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        planExpiresAt: new Date(laterTs * 1000),
        pendingPlanTier: null,
        pendingBilling: null,
        pendingPlanChangeAt: null,
      },
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

  it.each(["cancelled", "completed"])(
    "marks the tenant cancelled when Razorpay reports %s and local status isn't already cancelled",
    async (rzpStatus) => {
      db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
      mockFetch.mockResolvedValue({ status: rzpStatus, current_end: null });
      await runReconcilerOnce();
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "cancelled" },
      });
    },
  );

  it("marks the tenant expired when Razorpay reports expired and local status isn't already expired", async () => {
    db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
    mockFetch.mockResolvedValue({ status: "expired", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "expired" },
    });
  });

  it("heals a legacy 'cancelling' tenant to 'cancelled' when Razorpay confirms cancellation", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, subscriptionStatus: "cancelling" },
    ]);
    mockFetch.mockResolvedValue({ status: "cancelled", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { subscriptionStatus: "cancelled" },
    });
  });

  it("does not double-write when local status is already cancelled", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...BASE_TENANT, subscriptionStatus: "cancelled" },
    ]);
    mockFetch.mockResolvedValue({ status: "cancelled", current_end: null });
    await runReconcilerOnce();
    expect(db.tenant.update).not.toHaveBeenCalled();
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

  // Coverage for confirmPaymentMethodChange's best-effort cancel of the old
  // subscription: if that call failed, previousRazorpaySubscriptionId is
  // left set as a retry queue of one, and the reconciler is the fallback
  // that keeps trying so the old mandate doesn't bill forever.
  describe("orphaned old subscription retry-cancel", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ status: "active", current_end: null });
    });

    it("does not attempt a cancel when previousRazorpaySubscriptionId is not set", async () => {
      db.tenant.findMany.mockResolvedValue([BASE_TENANT]);
      await runReconcilerOnce();
      expect(mockSubCancel).not.toHaveBeenCalled();
    });

    it("retries cancelling an orphaned previous subscription and clears the field on success", async () => {
      db.tenant.findMany.mockResolvedValue([
        { ...BASE_TENANT, previousRazorpaySubscriptionId: "sub_old" },
      ]);
      await runReconcilerOnce();
      expect(mockSubCancel).toHaveBeenCalledWith("sub_old", {
        cancel_at_cycle_end: 0,
      });
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { previousRazorpaySubscriptionId: null },
      });
    });

    it("leaves previousRazorpaySubscriptionId set when the retry-cancel fails", async () => {
      db.tenant.findMany.mockResolvedValue([
        { ...BASE_TENANT, previousRazorpaySubscriptionId: "sub_old" },
      ]);
      mockSubCancel.mockRejectedValue(new Error("Razorpay down"));
      await runReconcilerOnce();
      expect(db.tenant.update).not.toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { previousRazorpaySubscriptionId: null },
      });
    });
  });

  // Regression coverage for a real bug: with N gateway replicas, each ran
  // this reconciler independently on the same schedule, polling Razorpay
  // for every tenant N times over and racing writes to the same Tenant
  // rows. A Redis SET NX lease now ensures only one replica's run actually
  // executes per cycle.
  describe("distributed lock", () => {
    it("acquires the lock with the expected key, TTL, and NX flag before running", async () => {
      db.tenant.findMany.mockResolvedValue([]);
      await runReconcilerOnce();
      expect(mockRedisSet).toHaveBeenCalledWith(
        "lock:subscription-reconciler",
        "1",
        "EX",
        30 * 60,
        "NX",
      );
      expect(getRazorpay).not.toHaveBeenCalled(); // no tenants, but lock path exercised
    });

    it("skips the run entirely when another replica already holds the lock", async () => {
      mockRedisSet.mockResolvedValue(null); // NX: key already exists
      db.tenant.findMany.mockResolvedValue([{ ...BASE_TENANT }]);
      await runReconcilerOnce();
      expect(db.tenant.findMany).not.toHaveBeenCalled();
      expect(getRazorpay).not.toHaveBeenCalled();
    });

    it("fails closed (skips the run) when the lock check itself throws, rather than running unguarded", async () => {
      mockRedisSet.mockRejectedValue(new Error("Redis unavailable"));
      db.tenant.findMany.mockResolvedValue([{ ...BASE_TENANT }]);
      await runReconcilerOnce();
      expect(db.tenant.findMany).not.toHaveBeenCalled();
    });
  });
});
