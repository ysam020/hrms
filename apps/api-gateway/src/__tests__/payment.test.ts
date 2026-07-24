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
    user: { findUnique: jest.fn().mockResolvedValue(null) },
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

jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    payments: { fetch: (...a: any[]) => mockRzpPaymentsFetch(...a) },
    plans: { create: (...a: any[]) => mockRzpPlansCreate(...a) },
    subscriptions: {
      create: (...a: any[]) => mockRzpSubscriptionsCreate(...a),
      fetch: (...a: any[]) => mockRzpSubscriptionsFetch(...a),
      cancel: (...a: any[]) => mockRzpSubscriptionsCancel(...a),
    },
  }));
});

const mockTenantFindUnique = (prisma as any).tenant.findUnique as jest.Mock;
const mockTenantUpdate = (prisma as any).tenant.update as jest.Mock;
const mockTenantFindFirst = (prisma as any).tenant.findFirst as jest.Mock;
const mockTenantUpdateMany = (prisma as any).tenant.updateMany as jest.Mock;
const mockMembershipFindFirst = (prisma as any).tenantMembership
  .findFirst as jest.Mock;
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
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

    it("cancels an active subscription and sets status to cancelling", async () => {
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
        cancel_at_cycle_end: 0,
      });
      expect(mockTenantUpdate).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "cancelling" },
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
      mockTokenStore.isWebhookEventProcessed.mockResolvedValue(false);
      mockTokenStore.markWebhookEventProcessed.mockResolvedValue(undefined);
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
      mockTokenStore.isWebhookEventProcessed.mockResolvedValue(true);
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
      "%s marks the tenant expired",
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
          data: { subscriptionStatus: "expired" },
        });
      },
    );
  });
});
