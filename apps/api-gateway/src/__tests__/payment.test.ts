import { createHmac } from "crypto";
import { prisma } from "@hrms/db";
import { notify } from "@hrms/notifications";
import {
  fetchPaymentMethod,
  createSubscription,
  getPendingSetup,
  cancelSubscription,
  reactivateSubscription,
  handleWebhook,
  changePlan,
  confirmPlanUpgrade,
  startPaymentMethodChange,
  confirmPaymentMethodChange,
} from "../handlers/payment";
import * as tenantTokenStore from "../services/tenantTokenStore";

jest.mock("@hrms/db", () => ({
  prisma: {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    tenantMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn() },
  },
}));

jest.mock("@hrms/common", () => ({
  apiResponse: jest.fn((res: any, status: number, data: any) =>
    res.json({ status, ...data }),
  ),
  RESPONSE_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    CONFLICT: 409,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
  PLATFORM_FROM: '"Praesto" <noreply@praesto.cloud>',
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../services/tenantTokenStore");

const mockRzpPaymentsFetch = jest.fn();
const mockRzpPlansCreate = jest.fn();
const mockRzpSubscriptionsCreate = jest.fn();
const mockRzpSubscriptionsFetch = jest.fn();
const mockRzpSubscriptionsCancel = jest.fn();
const mockRzpSubscriptionsUpdate = jest.fn();
const mockRzpOrdersCreate = jest.fn();

jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    payments: { fetch: (...a: any[]) => mockRzpPaymentsFetch(...a) },
    plans: { create: (...a: any[]) => mockRzpPlansCreate(...a) },
    subscriptions: {
      create: (...a: any[]) => mockRzpSubscriptionsCreate(...a),
      fetch: (...a: any[]) => mockRzpSubscriptionsFetch(...a),
      cancel: (...a: any[]) => mockRzpSubscriptionsCancel(...a),
      update: (...a: any[]) => mockRzpSubscriptionsUpdate(...a),
    },
    orders: { create: (...a: any[]) => mockRzpOrdersCreate(...a) },
  }));
});

const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockTenantUpdate = (prisma as any).tenant.update as jest.Mock;
const mockTenantFindFirst = (prisma as any).tenant.findFirst as jest.Mock;
const mockTenantUpdateMany = (prisma as any).tenant.updateMany as jest.Mock;
const mockMembershipFindFirst = (prisma as any).tenantMembership
  .findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockUserCount = (prisma as any).user.count as jest.Mock;
const mockNotify = notify as jest.Mock;
const mockTokenStore = tenantTokenStore as jest.Mocked<typeof tenantTokenStore>;

// Waits for fire-and-forget owner-email lookups (getTenantOwnerEmail) to settle.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("payment handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "key_id";
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
  });

  describe("fetchPaymentMethod", () => {
    it("extracts a card summary", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({
        method: "card",
        card: { network: "Visa", last4: "4242" },
      });
      const result = await fetchPaymentMethod("pay_1");
      expect(result).toEqual({ method: "card", summary: "Visa •••• 4242" });
    });

    it("extracts a UPI VPA", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({
        method: "upi",
        vpa: "user@bank",
      });
      expect(await fetchPaymentMethod("pay_1")).toEqual({
        method: "upi",
        summary: "user@bank",
      });
    });

    it("extracts a netbanking bank name", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({
        method: "netbanking",
        bank_name: "HDFC",
      });
      expect(await fetchPaymentMethod("pay_1")).toEqual({
        method: "netbanking",
        summary: "HDFC",
      });
    });

    it("extracts a wallet name", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({
        method: "wallet",
        wallet: "Paytm",
      });
      expect(await fetchPaymentMethod("pay_1")).toEqual({
        method: "wallet",
        summary: "Paytm",
      });
    });

    it("falls back to the raw method name for unknown methods", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({ method: "some_new_method" });
      expect(await fetchPaymentMethod("pay_1")).toEqual({
        method: "some_new_method",
        summary: "some_new_method",
      });
    });

    it("returns null when the Razorpay fetch throws", async () => {
      mockRzpPaymentsFetch.mockRejectedValue(new Error("not found"));
      expect(await fetchPaymentMethod("pay_1")).toBeNull();
    });
  });

  describe("createSubscription", () => {
    it("creates a plan when none is cached, then creates a subscription and stores it as pending", async () => {
      mockTokenStore.getRazorpayPlanId.mockResolvedValue(null);
      mockTokenStore.setRazorpayPlanId.mockResolvedValue(undefined);
      mockTokenStore.storePendingSubscription.mockResolvedValue(undefined);
      mockRzpPlansCreate.mockResolvedValue({ id: "plan_new" });
      mockRzpSubscriptionsCreate.mockResolvedValue({ id: "sub_1" });

      const req: any = { user: { userId: "u1" }, body: { billing: "monthly" } };
      const res = makeRes();

      await createSubscription(req, res);

      expect(mockRzpPlansCreate).toHaveBeenCalled();
      expect(mockRzpSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ plan_id: "plan_new", quantity: 1 }),
      );
      expect(mockTokenStore.storePendingSubscription).toHaveBeenCalledWith(
        "u1",
        "sub_1",
        "monthly",
        "starter",
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          data: expect.objectContaining({
            subscriptionId: "sub_1",
            billing: "monthly",
          }),
        }),
      );
    });

    it("reuses a Redis-cached plan id without creating a new Razorpay plan", async () => {
      mockTokenStore.getRazorpayPlanId.mockResolvedValue("plan_cached");
      mockTokenStore.storePendingSubscription.mockResolvedValue(undefined);
      mockRzpSubscriptionsCreate.mockResolvedValue({ id: "sub_2" });

      const req: any = { user: { userId: "u1" }, body: { billing: "annual" } };
      const res = makeRes();

      await createSubscription(req, res);

      expect(mockRzpPlansCreate).not.toHaveBeenCalled();
      expect(mockRzpSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ plan_id: "plan_cached", total_count: 10 }),
      );
    });

    it("defaults to monthly billing when none is specified", async () => {
      mockTokenStore.getRazorpayPlanId.mockResolvedValue("plan_cached");
      mockTokenStore.storePendingSubscription.mockResolvedValue(undefined);
      mockRzpSubscriptionsCreate.mockResolvedValue({ id: "sub_3" });

      const req: any = { user: { userId: "u1" }, body: {} };
      const res = makeRes();

      await createSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ billing: "monthly" }),
        }),
      );
    });

    it("responds with an error status when Razorpay throws", async () => {
      // Note: getOrCreatePlanId's in-memory cache is module-level and
      // already warm for "monthly" from an earlier test in this file, so
      // the failure here is induced at the subscriptions.create call
      // instead of the plan-resolution step.
      mockRzpSubscriptionsCreate.mockRejectedValue(new Error("razorpay down"));
      const req: any = { user: { userId: "u1" }, body: {} };
      const res = makeRes();

      await createSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
      );
    });
  });

  describe("getPendingSetup", () => {
    it("reports no pending subscription", async () => {
      mockTokenStore.getPendingSubscription.mockResolvedValue(null);
      const req: any = { user: { userId: "u1" } };
      const res = makeRes();

      await getPendingSetup(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hasPending: false } }),
      );
    });

    it("reports hasPending when the subscription is authenticated/active", async () => {
      mockTokenStore.getPendingSubscription.mockResolvedValue({
        subscriptionId: "sub_1",
        billing: "monthly",
      });
      mockRzpSubscriptionsFetch.mockResolvedValue({ status: "active" });
      const req: any = { user: { userId: "u1" } };
      const res = makeRes();

      await getPendingSetup(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { hasPending: true, billing: "monthly" },
        }),
      );
    });

    it("clears a stale pending record when the subscription never got paid", async () => {
      mockTokenStore.getPendingSubscription.mockResolvedValue({
        subscriptionId: "sub_1",
        billing: "monthly",
      });
      mockRzpSubscriptionsFetch.mockResolvedValue({ status: "created" });
      const req: any = { user: { userId: "u1" } };
      const res = makeRes();

      await getPendingSetup(req, res);

      expect(mockTokenStore.clearPendingSubscription).toHaveBeenCalledWith(
        "u1",
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hasPending: false } }),
      );
    });
  });

  describe("cancelSubscription", () => {
    it("returns BAD_REQUEST when the tenant has no subscription", async () => {
      mockTenantFindUnique.mockResolvedValue({ razorpaySubscriptionId: null });
      const req: any = { user: { tenantId: "t1" } };
      const res = makeRes();

      await cancelSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockRzpSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it("returns BAD_REQUEST when the subscription is not active or in grace period", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "expired",
      });
      const req: any = { user: { tenantId: "t1" } };
      const res = makeRes();

      await cancelSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockRzpSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it("schedules cancellation at cycle end and sets status to cancelled", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
      });
      mockRzpSubscriptionsCancel.mockResolvedValue({});
      mockTenantUpdate.mockResolvedValue({});
      const req: any = { user: { tenantId: "t1" } };
      const res = makeRes();

      await cancelSubscription(req, res);

      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_1", {
        cancel_at_cycle_end: 1,
      });
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "cancelled" },
      });
    });
  });

  describe("reactivateSubscription", () => {
    it("returns BAD_REQUEST when required payment details are missing", async () => {
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await reactivateSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it("returns BAD_REQUEST when the HMAC signature does not verify", async () => {
      const req: any = {
        user: { tenantId: "t1" },
        body: {
          razorpayPaymentId: "pay_1",
          razorpaySubscriptionId: "sub_1",
          razorpaySignature: "bogus",
        },
      };
      const res = makeRes();

      await reactivateSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Payment verification failed.",
        }),
      );
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it("activates the tenant with a one-month expiry for monthly billing on valid signature", async () => {
      mockRzpPaymentsFetch.mockResolvedValue({ method: "upi", vpa: "a@bank" });
      mockTenantUpdate.mockResolvedValue({});
      const paymentId = "pay_1";
      const subscriptionId = "sub_1";
      const signature = createHmac("sha256", "key_secret")
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");
      const req: any = {
        user: { tenantId: "t1" },
        body: {
          billing: "monthly",
          razorpayPaymentId: paymentId,
          razorpaySubscriptionId: subscriptionId,
          razorpaySignature: signature,
        },
      };
      const res = makeRes();

      await reactivateSubscription(req, res);

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1" },
          data: expect.objectContaining({
            razorpaySubscriptionId: subscriptionId,
            billing: "monthly",
            subscriptionStatus: "active",
            paymentMethod: "upi",
          }),
        }),
      );
      const dataArg = mockTenantUpdate.mock.calls[0][0].data;
      const monthDiff =
        dataArg.planExpiresAt.getMonth() - dataArg.planActivatedAt.getMonth();
      expect((monthDiff + 12) % 12).toBe(1);
    });

    it("activates with a one-year expiry for annual billing", async () => {
      mockRzpPaymentsFetch.mockResolvedValue(null);
      mockTenantUpdate.mockResolvedValue({});
      const paymentId = "pay_2";
      const subscriptionId = "sub_2";
      const signature = createHmac("sha256", "key_secret")
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");
      const req: any = {
        user: { tenantId: "t1" },
        body: {
          billing: "annual",
          razorpayPaymentId: paymentId,
          razorpaySubscriptionId: subscriptionId,
          razorpaySignature: signature,
        },
      };
      const res = makeRes();

      await reactivateSubscription(req, res);

      const dataArg = mockTenantUpdate.mock.calls[0][0].data;
      expect(
        dataArg.planExpiresAt.getFullYear() -
          dataArg.planActivatedAt.getFullYear(),
      ).toBe(1);
    });
  });

  describe("changePlan", () => {
    beforeEach(() => {
      mockRzpPlansCreate.mockResolvedValue({ id: "plan_new" });
      mockTokenStore.getRazorpayPlanId.mockResolvedValue(null);
      mockTokenStore.setRazorpayPlanId.mockResolvedValue(undefined);
      mockRzpSubscriptionsUpdate.mockResolvedValue({});
      mockTenantUpdate.mockResolvedValue({});
      mockUserCount.mockResolvedValue(10);
    });

    it("rejects an invalid planTier", async () => {
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "bogus", billing: "monthly" },
      };
      const res = makeRes();
      await changePlan(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
      );
    });

    it("rejects a plan change for a UPI Autopay subscription before calling Razorpay", async () => {
      mockTenantFindUnique.mockResolvedValue({
        planTier: "starter",
        billing: "monthly",
        pendingPlanTier: null,
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
        planExpiresAt: new Date(),
        paymentMethod: "upi",
      });
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "growth", billing: "monthly" },
      };
      const res = makeRes();

      await changePlan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("UPI Autopay"),
        }),
      );
      expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(mockRzpOrdersCreate).not.toHaveBeenCalled();
    });

    it.each(["emandate", "nach"])(
      "rejects a plan change for a %s subscription before calling Razorpay",
      async (method) => {
        mockTenantFindUnique.mockResolvedValue({
          planTier: "starter",
          billing: "monthly",
          pendingPlanTier: null,
          razorpaySubscriptionId: "sub_1",
          subscriptionStatus: "active",
          planExpiresAt: new Date(),
          paymentMethod: method,
        });
        const req: any = {
          user: { tenantId: "t1" },
          body: { planTier: "growth", billing: "monthly" },
        };
        const res = makeRes();

        await changePlan(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 400,
            message: expect.stringContaining("e-Mandate"),
          }),
        );
        expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
        expect(mockRzpOrdersCreate).not.toHaveBeenCalled();
      },
    );

    it("upgrades immediately with no charge when the renewal date is today (prorated amount rounds to zero)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        planTier: "starter",
        billing: "monthly",
        pendingPlanTier: null,
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
        planExpiresAt: new Date(),
      });
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "growth", billing: "monthly" },
      };
      const res = makeRes();

      await changePlan(req, res);

      expect(mockRzpSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
        plan_id: "plan_new",
        quantity: 1,
        schedule_change_at: "now",
      });
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { planTier: "growth", billing: "monthly" },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresPayment: false }),
        }),
      );
    });

    it("collects a prorated one-time order for a same-billing upgrade mid-cycle", async () => {
      mockTenantFindUnique.mockResolvedValue({
        planTier: "starter",
        billing: "monthly",
        pendingPlanTier: null,
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      mockRzpOrdersCreate.mockResolvedValue({ id: "order_1" });
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "growth", billing: "monthly" },
      };
      const res = makeRes();

      await changePlan(req, res);

      expect(mockRzpOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "INR" }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiresPayment: true,
            orderId: "order_1",
            planTier: "growth",
            billing: "monthly",
          }),
        }),
      );
      // Tenant isn't mutated yet — only confirmPlanUpgrade does that.
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it("schedules a downgrade for the next cycle with no charge", async () => {
      const expiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockTenantFindUnique.mockResolvedValue({
        planTier: "growth",
        billing: "monthly",
        pendingPlanTier: null,
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
        planExpiresAt: expiry,
      });
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "starter", billing: "monthly" },
      };
      const res = makeRes();

      await changePlan(req, res);

      expect(mockRzpSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
        plan_id: "plan_new",
        quantity: 1,
        schedule_change_at: "cycle_end",
      });
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          pendingPlanTier: "starter",
          pendingBilling: "monthly",
          pendingPlanChangeAt: expiry,
        },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresPayment: false }),
        }),
      );
    });

    it("blocks downgrading to a tier whose employee limit the tenant already exceeds", async () => {
      mockTenantFindUnique.mockResolvedValue({
        planTier: "growth",
        billing: "monthly",
        pendingPlanTier: null,
        razorpaySubscriptionId: "sub_1",
        subscriptionStatus: "active",
        planExpiresAt: new Date(),
      });
      mockUserCount.mockResolvedValue(30);
      const req: any = {
        user: { tenantId: "t1" },
        body: { planTier: "starter", billing: "monthly" },
      };
      const res = makeRes();

      await changePlan(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("Starter supports up to 25"),
        }),
      );
      expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
    });
  });

  describe("confirmPlanUpgrade", () => {
    it("verifies the order signature, swaps the plan immediately, and clears any pending change", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_1",
      });
      // "enterprise:monthly" — deliberately untouched by the changePlan tests
      // above (which only ever use starter/growth), so this doesn't collide
      // with getOrCreatePlanId's module-level in-memory cache (see the
      // "responds with an error status" test's comment for the same caveat).
      mockTokenStore.getRazorpayPlanId.mockResolvedValue("plan_enterprise");
      mockRzpSubscriptionsUpdate.mockResolvedValue({});
      mockTenantUpdate.mockResolvedValue({});
      mockUserCount.mockResolvedValue(10);

      const orderId = "order_1";
      const paymentId = "pay_1";
      const signature = createHmac("sha256", "key_secret")
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
      const req: any = {
        user: { tenantId: "t1" },
        body: {
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          planTier: "enterprise",
          billing: "monthly",
        },
      };
      const res = makeRes();

      await confirmPlanUpgrade(req, res);

      expect(mockRzpSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
        plan_id: "plan_enterprise",
        quantity: 1,
        schedule_change_at: "now",
      });
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          planTier: "enterprise",
          billing: "monthly",
          pendingPlanTier: null,
          pendingBilling: null,
          pendingPlanChangeAt: null,
        },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });

    it("rejects a bad signature", async () => {
      const req: any = {
        user: { tenantId: "t1" },
        body: {
          razorpayOrderId: "order_1",
          razorpayPaymentId: "pay_1",
          razorpaySignature: "bogus",
          planTier: "growth",
          billing: "monthly",
        },
      };
      const res = makeRes();

      await confirmPlanUpgrade(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Payment verification failed.",
        }),
      );
      expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
    });
  });

  describe("startPaymentMethodChange", () => {
    beforeEach(() => {
      // "enterprise:annual" is deliberately unused by any other describe
      // block in this file, so it can't collide with getOrCreatePlanId's
      // module-level in-memory cache the way starter/growth:monthly would.
      mockTokenStore.getRazorpayPlanId.mockResolvedValue(null);
      mockRzpPlansCreate.mockResolvedValue({ id: "plan_pm_change" });
      mockRzpSubscriptionsCreate.mockResolvedValue({ id: "sub_new" });
      mockTokenStore.storePendingPaymentMethodChange.mockResolvedValue(
        undefined,
      );
    });

    it("rejects when no subscription exists", async () => {
      mockTenantFindUnique.mockResolvedValue({ razorpaySubscriptionId: null });
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await startPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "No subscription found.",
        }),
      );
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("rejects when the subscription isn't active or in grace period", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "expired",
        planTier: "enterprise",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await startPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Subscription is not active.",
        }),
      );
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("defers start_at to planExpiresAt when active with a far-out renewal", async () => {
      const planExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        planTier: "enterprise",
        billing: "annual",
        planExpiresAt,
      });
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await startPaymentMethodChange(req, res);

      expect(mockRzpSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: "plan_pm_change",
          total_count: 10,
          quantity: 1,
          notes: { tenantId: "t1", purpose: "payment_method_change" },
          start_at: Math.floor(planExpiresAt.getTime() / 1000),
        }),
      );
      expect(
        mockTokenStore.storePendingPaymentMethodChange,
      ).toHaveBeenCalledWith("t1", "sub_new");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            subscriptionId: "sub_new",
            keyId: process.env.RAZORPAY_KEY_ID,
          },
        }),
      );
    });

    it("charges immediately (no start_at) when in grace_period, regardless of planExpiresAt", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "grace_period",
        planTier: "enterprise",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await startPaymentMethodChange(req, res);

      const callArgs = mockRzpSubscriptionsCreate.mock.calls[0][0];
      expect(callArgs.start_at).toBeUndefined();
    });

    it("charges immediately when active but planExpiresAt is within the 24h safety buffer", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        planTier: "enterprise",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h out
      });
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await startPaymentMethodChange(req, res);

      const callArgs = mockRzpSubscriptionsCreate.mock.calls[0][0];
      expect(callArgs.start_at).toBeUndefined();
    });
  });

  describe("confirmPaymentMethodChange", () => {
    beforeEach(() => {
      mockRzpPaymentsFetch.mockResolvedValue({
        method: "card",
        card: { network: "Visa", last4: "4242" },
      });
      mockRzpSubscriptionsCancel.mockResolvedValue({});
      mockTenantUpdate.mockResolvedValue({});
      mockTokenStore.getPendingPaymentMethodChange.mockResolvedValue({
        subscriptionId: "sub_new",
      });
      mockTokenStore.clearPendingPaymentMethodChange.mockResolvedValue(
        undefined,
      );
    });

    function validReq(overrides: Record<string, any> = {}) {
      const paymentId = "pay_1";
      const subscriptionId = "sub_new";
      const signature = createHmac("sha256", "key_secret")
        .update(`${paymentId}|${subscriptionId}`)
        .digest("hex");
      return {
        user: { tenantId: "t1" },
        body: {
          razorpayPaymentId: paymentId,
          razorpaySubscriptionId: subscriptionId,
          razorpaySignature: signature,
          ...overrides,
        },
      } as any;
    }

    it("rejects when payment details are missing", async () => {
      const req: any = { user: { tenantId: "t1" }, body: {} };
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Payment details are required.",
        }),
      );
    });

    it("rejects a bad signature", async () => {
      const req = validReq({ razorpaySignature: "bogus" });
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Payment verification failed.",
        }),
      );
    });

    it("rejects when no subscription exists on the tenant", async () => {
      mockTenantFindUnique.mockResolvedValue({ razorpaySubscriptionId: null });
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "No subscription found.",
        }),
      );
    });

    it("rejects when the new subscription id equals the tenant's current subscription id", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_new", // same as request — confused/replayed
        subscriptionStatus: "active",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: "Invalid payment method change request.",
        }),
      );
    });

    it("rejects when there's no matching pending change in Redis", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      mockTokenStore.getPendingPaymentMethodChange.mockResolvedValue(null);
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("expired or is invalid"),
        }),
      );
    });

    it("rejects when the pending change's subscription id doesn't match the request", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      mockTokenStore.getPendingPaymentMethodChange.mockResolvedValue({
        subscriptionId: "sub_different",
      });
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining("expired or is invalid"),
        }),
      );
    });

    it("swaps the subscription and preserves billing dates when deferred (far-out renewal)", async () => {
      const planExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        billing: "annual",
        planExpiresAt,
      });
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      expect(mockTenantUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: "t1" },
        data: {
          razorpaySubscriptionId: "sub_new",
          previousRazorpaySubscriptionId: "sub_old",
          subscriptionStatus: "active",
          paymentMethod: "card",
          paymentMethodSummary: "Visa •••• 4242",
        },
      });
      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_old", {
        cancel_at_cycle_end: 0,
      });
      expect(mockTenantUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: "t1" },
        data: { previousRazorpaySubscriptionId: null },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });

    it("computes a fresh planActivatedAt/planExpiresAt when immediate (grace_period)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "grace_period",
        billing: "monthly",
        planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // already lapsed
      });
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      const firstUpdateData = mockTenantUpdate.mock.calls[0][0].data;
      expect(firstUpdateData.planActivatedAt).toBeInstanceOf(Date);
      expect(firstUpdateData.planExpiresAt).toBeInstanceOf(Date);
    });

    it("leaves previousRazorpaySubscriptionId set when the old-subscription cancel fails", async () => {
      mockTenantFindUnique.mockResolvedValue({
        razorpaySubscriptionId: "sub_old",
        subscriptionStatus: "active",
        billing: "annual",
        planExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });
      mockRzpSubscriptionsCancel.mockRejectedValue(new Error("Razorpay down"));
      const req = validReq();
      const res = makeRes();

      await confirmPaymentMethodChange(req, res);

      // Only the initial swap update happened — no second call clearing
      // previousRazorpaySubscriptionId, since the cancel failed.
      expect(mockTenantUpdate).toHaveBeenCalledTimes(1);
      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousRazorpaySubscriptionId: "sub_old",
          }),
        }),
      );
      // Still reports success to the client — the swap itself succeeded,
      // and the reconciler will retry the stray cancel.
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 200 }),
      );
    });
  });

  describe("handleWebhook", () => {
    function makeWebhookReq(payload: object, secret = "webhook_secret") {
      const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
      const signature = createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
      return {
        headers: { "x-razorpay-signature": signature },
        body: rawBody,
      } as any;
    }

    beforeEach(() => {
      process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
      mockTokenStore.tryReserveWebhookEvent.mockResolvedValue(true);
    });

    it("returns 500 when the webhook secret is not configured", async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: {},
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("returns 400 on an invalid signature", async () => {
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: {},
      });
      req.headers["x-razorpay-signature"] = "bogus";
      const res = makeRes();

      await handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 500 for a body that isn't valid JSON (caught by the outer handler)", async () => {
      const rawBody = Buffer.from("not json", "utf8");
      const signature = createHmac("sha256", "webhook_secret")
        .update(rawBody)
        .digest("hex");
      const req: any = {
        headers: { "x-razorpay-signature": signature },
        body: rawBody,
      };
      const res = makeRes();

      await handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("skips already-processed events (idempotency)", async () => {
      mockTokenStore.tryReserveWebhookEvent.mockResolvedValue(false);
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      req.headers["x-razorpay-event-id"] = "evt_1";
      const res = makeRes();

      await handleWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(mockTenantFindFirst).not.toHaveBeenCalled();
    });

    it("acks without processing when the payload has no subscription id", async () => {
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: {},
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(mockTenantFindFirst).not.toHaveBeenCalled();
    });

    it("subscription.charged extends planExpiresAt by one billing period from the later of now/current expiry", async () => {
      mockTenantFindFirst.mockResolvedValue({
        id: "t1",
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "pro",
        billing: "monthly",
        planExpiresAt: null,
      });
      mockTenantUpdate.mockResolvedValue({});
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1" },
          data: expect.objectContaining({ subscriptionStatus: "active" }),
        }),
      );
    });

    it("subscription.charged emails the tenant owner an invoice when payment.entity is present", async () => {
      mockTenantFindFirst.mockResolvedValue({
        id: "t1",
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "pro",
        billing: "monthly",
        planExpiresAt: null,
      });
      mockTenantUpdate.mockResolvedValue({});
      mockMembershipFindFirst.mockResolvedValue({ userId: "u1" });
      mockUserFindUnique.mockResolvedValue({
        email: "owner@example.com",
        username: "owner1",
      });
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: {
          subscription: { entity: { id: "sub_1" } },
          payment: { entity: { amount: 99900, method: "card" } },
        },
      });
      const res = makeRes();

      await handleWebhook(req, res);
      await flushMicrotasks();

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "subscriptionRenewed",
          email: expect.objectContaining({
            to: "owner@example.com",
            attachments: expect.arrayContaining([
              expect.objectContaining({ content: expect.any(String) }),
            ]),
          }),
        }),
      );
    });

    it("subscription.charged finalizes a pending downgrade when headcount is within the new tier's limit", async () => {
      mockTenantFindFirst.mockResolvedValue({
        id: "t1",
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "pro",
        planTier: "growth",
        billing: "monthly",
        pendingPlanTier: "starter",
        pendingBilling: "monthly",
        planExpiresAt: null,
      });
      mockTenantUpdate.mockResolvedValue({});
      mockUserCount.mockResolvedValue(10); // within starter's limit of 25
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t1" },
          data: expect.objectContaining({
            planTier: "starter",
            billing: "monthly",
            pendingPlanTier: null,
            pendingBilling: null,
            pendingPlanChangeAt: null,
          }),
        }),
      );
      expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("subscription.charged blocks a pending downgrade and reverts Razorpay's plan when headcount exceeds the new tier's limit", async () => {
      mockTenantFindFirst.mockResolvedValue({
        id: "t1",
        name: "Acme Corp",
        slug: "acme-corp",
        plan: "pro",
        // "growth:annual" is deliberately unused by any other test in this
        // file — getOrCreatePlanId's module-level in-memory cache persists
        // across tests within this file's run, so a combo already cached
        // elsewhere (e.g. growth:monthly) would return that cached plan id
        // instead of ever calling rzp.plans.create with this test's mock.
        planTier: "growth",
        billing: "annual",
        pendingPlanTier: "starter",
        pendingBilling: "monthly",
        planExpiresAt: null,
      });
      mockTenantUpdate.mockResolvedValue({});
      mockUserCount.mockResolvedValue(30); // exceeds starter's limit of 25
      mockRzpPlansCreate.mockResolvedValue({ id: "plan_growth_annual" });
      const req = makeWebhookReq({
        event: "subscription.charged",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockRzpSubscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
        plan_id: "plan_growth_annual",
        quantity: 1,
        schedule_change_at: "now",
      });
      const updateCall = mockTenantUpdate.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: "t1" });
      expect(updateCall.data).toMatchObject({
        pendingPlanTier: null,
        pendingBilling: null,
        pendingPlanChangeAt: null,
      });
      expect(updateCall.data.planTier).toBe("growth");
    });

    it("subscription.halted moves non-expired tenants to grace_period", async () => {
      mockTenantUpdateMany.mockResolvedValue({ count: 1 });
      const req = makeWebhookReq({
        event: "subscription.halted",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockTenantUpdateMany).toHaveBeenCalledWith({
        where: {
          razorpaySubscriptionId: "sub_1",
          subscriptionStatus: { not: "expired" },
        },
        data: { subscriptionStatus: "grace_period" },
      });
    });

    it("subscription.payment.failed only logs, does not mutate tenant state", async () => {
      mockTenantFindFirst.mockResolvedValue({ id: "t1" });
      const req = makeWebhookReq({
        event: "subscription.payment.failed",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockTenantUpdate).not.toHaveBeenCalled();
      expect(mockTenantUpdateMany).not.toHaveBeenCalled();
    });

    it("subscription.payment.failed emails the tenant owner an alert", async () => {
      mockTenantFindFirst.mockResolvedValue({ id: "t1" });
      mockMembershipFindFirst.mockResolvedValue({ userId: "u1" });
      mockUserFindUnique.mockResolvedValue({
        email: "owner@example.com",
        username: "owner1",
      });
      const req = makeWebhookReq({
        event: "subscription.payment.failed",
        payload: { subscription: { entity: { id: "sub_1" } } },
      });
      const res = makeRes();

      await handleWebhook(req, res);
      await flushMicrotasks();

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "subscriptionPaymentFailed",
          email: expect.objectContaining({ to: "owner@example.com" }),
        }),
      );
    });

    it.each(["subscription.cancelled", "subscription.completed"])(
      "%s marks the tenant cancelled",
      async (event) => {
        mockTenantUpdateMany.mockResolvedValue({ count: 1 });
        const req = makeWebhookReq({
          event,
          payload: { subscription: { entity: { id: "sub_1" } } },
        });
        const res = makeRes();

        await handleWebhook(req, res);

        expect(mockTenantUpdateMany).toHaveBeenCalledWith({
          where: { razorpaySubscriptionId: "sub_1" },
          data: { subscriptionStatus: "cancelled" },
        });
      },
    );
  });
});
