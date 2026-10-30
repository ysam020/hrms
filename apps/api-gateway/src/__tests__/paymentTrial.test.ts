import { createHmac } from "crypto";
import { prisma } from "@hrms/db";
import { notify } from "@hrms/notifications";
import {
  createSubscription,
  getTrialEligibility,
  cancelSubscription,
  changePlan,
  startPaymentMethodChange,
  confirmPaymentMethodChange,
  handleWebhook,
} from "../handlers/payment";
import * as tenantTokenStore from "../services/tenantTokenStore";
import { checkTrialEligibility } from "../services/trial";

// Trial paths through the payment handlers. Mocks mirror payment.test.ts;
// Razorpay is fully mocked, so nothing here can reach a real account.

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
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    CONFLICT: 409,
    NOT_FOUND: 404,
  },
  PLATFORM_FROM: '"Praesto" <noreply@praesto.in>',
  renderEmailHtml: jest.fn(({ bodyHtml }: { bodyHtml: string }) => bodyHtml),
}));

jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));

jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../services/tenantTokenStore");

jest.mock("../services/trial", () => ({
  ...jest.requireActual("../services/trial"),
  checkTrialEligibility: jest.fn(),
}));

const mockRzpPaymentsFetch = jest.fn();
const mockRzpSubscriptionsCreate = jest.fn();
const mockRzpSubscriptionsCancel = jest.fn();
const mockRzpSubscriptionsUpdate = jest.fn();

jest.mock("razorpay", () =>
  jest.fn().mockImplementation(() => ({
    payments: { fetch: (...a: any[]) => mockRzpPaymentsFetch(...a) },
    plans: { create: jest.fn() },
    subscriptions: {
      create: (...a: any[]) => mockRzpSubscriptionsCreate(...a),
      fetch: jest.fn(),
      cancel: (...a: any[]) => mockRzpSubscriptionsCancel(...a),
      update: (...a: any[]) => mockRzpSubscriptionsUpdate(...a),
    },
    orders: { create: jest.fn() },
  })),
);

const db: any = prisma;
const mockTokenStore = tenantTokenStore as jest.Mocked<typeof tenantTokenStore>;
const mockEligibility = checkTrialEligibility as jest.Mock;
const mockNotify = notify as jest.Mock;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-30T06:00:00Z");

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
const body = (res: any) => res.json.mock.calls[0][0];
const flush = () =>
  new Promise((r) => jest.requireActual("timers").setImmediate(r));

function trialTenant(overrides: Record<string, unknown> = {}) {
  const end = new Date(NOW.getTime() + 10 * DAY_MS);
  return {
    id: "t1",
    name: "Acme",
    slug: "acme",
    plan: "pro",
    planTier: "starter",
    billing: "monthly",
    razorpaySubscriptionId: "sub_trial",
    subscriptionStatus: "trialing",
    planActivatedAt: null,
    planExpiresAt: end,
    trialStartedAt: new Date(NOW.getTime() - 4 * DAY_MS),
    trialEndsAt: end,
    pendingPlanTier: null,
    pendingBilling: null,
    paymentMethod: "upi",
    paymentMethodSummary: "acme@okhdfc",
    ...overrides,
  };
}

describe("payment handlers — free trial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Only the clock — faking ticks/microtasks stalls the handlers' awaits.
    jest.useFakeTimers({
      doNotFake: [
        "nextTick",
        "queueMicrotask",
        "setImmediate",
        "setTimeout",
        "setInterval",
        "clearTimeout",
        "clearInterval",
        "clearImmediate",
      ],
    });
    jest.setSystemTime(NOW);
    process.env.RAZORPAY_KEY_ID = "key_id";
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    mockTokenStore.getRazorpayPlanId.mockResolvedValue("plan_x");
    mockRzpSubscriptionsCreate.mockResolvedValue({ id: "sub_new" });
    mockRzpSubscriptionsCancel.mockResolvedValue({});
    db.tenant.update.mockResolvedValue({});
    db.user.count.mockResolvedValue(3);
    mockEligibility.mockResolvedValue({ eligible: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("createSubscription", () => {
    const signupReq = (body: Record<string, unknown>) =>
      ({ user: { userId: "u1" }, body }) as any;

    it("defers the first charge to the trial end and tags the subscription as this user's trial", async () => {
      const res = makeRes();
      await createSubscription(
        signupReq({ billing: "annual", planTier: "growth", trial: true }),
        res,
      );

      const endsAt = new Date(NOW.getTime() + 14 * DAY_MS);
      expect(mockRzpSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          start_at: Math.floor(endsAt.getTime() / 1000),
          notes: {
            purpose: "trial_signup",
            userId: "u1",
            planTier: "growth",
            billing: "annual",
          },
        }),
      );
      expect(body(res).data.trialEndsAt).toBe(endsAt.toISOString());
    });

    it("refuses an ineligible organisation before creating anything at Razorpay", async () => {
      mockEligibility.mockResolvedValue({
        eligible: false,
        reason: "trial_used",
      });
      const res = makeRes();
      await createSubscription(signupReq({ trial: true }), res);
      expect(body(res)).toMatchObject({
        status: 409,
        code: "TRIAL_NOT_ELIGIBLE",
      });
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("never gives an existing tenant a trial (renewals always pay now)", async () => {
      const res = makeRes();
      await createSubscription(
        {
          user: { userId: "u1", tenantId: "t1" },
          body: { trial: true },
        } as any,
        res,
      );
      expect(body(res).status).toBe(400);
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("leaves a paid signup charging immediately", async () => {
      const res = makeRes();
      await createSubscription(signupReq({ billing: "monthly" }), res);
      const args = mockRzpSubscriptionsCreate.mock.calls[0][0];
      expect(args.start_at).toBeUndefined();
      expect(args.notes).toBeUndefined();
      expect(mockEligibility).not.toHaveBeenCalled();
    });
  });

  describe("getTrialEligibility", () => {
    it("reports eligibility and the configured trial length", async () => {
      const res = makeRes();
      await getTrialEligibility({ user: { userId: "u1" } } as any, res);
      expect(body(res).data).toEqual({ eligible: true, trialDays: 14 });
    });

    it("explains why an organisation can't have a trial", async () => {
      mockEligibility.mockResolvedValue({
        eligible: false,
        reason: "domain_has_organisation",
      });
      const res = makeRes();
      await getTrialEligibility({ user: { userId: "u1" } } as any, res);
      expect(body(res).data).toMatchObject({
        eligible: false,
        reason: "domain_has_organisation",
        message: expect.stringContaining("email domain"),
      });
    });

    it("is never eligible from inside an existing tenant", async () => {
      const res = makeRes();
      await getTrialEligibility(
        { user: { userId: "u1", tenantId: "t1" } } as any,
        res,
      );
      expect(body(res).data.eligible).toBe(false);
      expect(mockEligibility).not.toHaveBeenCalled();
    });
  });

  describe("cancelSubscription", () => {
    it("cancels a trial's mandate immediately so the deferred charge never happens", async () => {
      db.tenant.findUnique.mockResolvedValue(trialTenant());
      const res = makeRes();
      await cancelSubscription({ user: { tenantId: "t1" } } as any, res);
      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_trial", {
        cancel_at_cycle_end: 0,
      });
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { subscriptionStatus: "cancelled" },
      });
    });

    it("still cancels a paid subscription at cycle end", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ subscriptionStatus: "active" }),
      );
      await cancelSubscription({ user: { tenantId: "t1" } } as any, makeRes());
      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_trial", {
        cancel_at_cycle_end: 1,
      });
    });
  });

  describe("changePlan during a trial", () => {
    const req = (planTier: string, billing: string) =>
      ({ user: { tenantId: "t1" }, body: { planTier, billing } }) as any;

    it("creates a replacement mandate starting at the trial end, without touching the tenant", async () => {
      db.tenant.findUnique.mockResolvedValue(trialTenant());
      const res = makeRes();
      await changePlan(req("growth", "monthly"), res);

      expect(mockRzpSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: "plan_x",
          start_at: Math.floor(trialTenant().planExpiresAt.getTime() / 1000),
        }),
      );
      expect(
        mockTokenStore.storePendingPaymentMethodChange,
      ).toHaveBeenCalledWith("t1", "sub_new", {
        planTier: "growth",
        billing: "monthly",
      });
      expect(body(res).data).toMatchObject({
        requiresAuthorization: true,
        subscriptionId: "sub_new",
      });
      expect(mockRzpSubscriptionsUpdate).not.toHaveBeenCalled();
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("isn't blocked by a UPI mandate, unlike a paid subscription", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ paymentMethod: "upi" }),
      );
      const res = makeRes();
      await changePlan(req("growth", "annual"), res);
      expect(body(res).status).toBe(200);
    });

    it("still enforces the target tier's headcount limit", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ planTier: "growth" }),
      );
      db.user.count.mockResolvedValue(40);
      const res = makeRes();
      await changePlan(req("starter", "monthly"), res);
      expect(body(res).status).toBe(400);
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });

    it("refuses inside the last day of the trial", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ planExpiresAt: new Date(NOW.getTime() + 6 * 3600e3) }),
      );
      const res = makeRes();
      await changePlan(req("growth", "monthly"), res);
      expect(body(res).status).toBe(400);
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });
  });

  describe("startPaymentMethodChange during a trial", () => {
    it("defers the new mandate to the trial end", async () => {
      db.tenant.findUnique.mockResolvedValue(trialTenant());
      await startPaymentMethodChange(
        { user: { tenantId: "t1" } } as any,
        makeRes(),
      );
      expect(mockRzpSubscriptionsCreate.mock.calls[0][0].start_at).toBe(
        Math.floor(trialTenant().planExpiresAt.getTime() / 1000),
      );
    });

    it("refuses inside the last day, where it would have to charge today", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ planExpiresAt: new Date(NOW.getTime() + 3600e3) }),
      );
      const res = makeRes();
      await startPaymentMethodChange({ user: { tenantId: "t1" } } as any, res);
      expect(body(res).status).toBe(400);
      expect(mockRzpSubscriptionsCreate).not.toHaveBeenCalled();
    });
  });

  describe("confirmPaymentMethodChange during a trial", () => {
    const signed = () => {
      const signature = createHmac("sha256", "key_secret")
        .update("pay_1|sub_new")
        .digest("hex");
      return {
        user: { tenantId: "t1" },
        body: {
          razorpayPaymentId: "pay_1",
          razorpaySubscriptionId: "sub_new",
          razorpaySignature: signature,
        },
      } as any;
    };

    beforeEach(() => {
      mockRzpPaymentsFetch.mockResolvedValue({ method: "upi", vpa: "a@b" });
    });

    it("swaps in the new plan's mandate and stays a trial with its dates untouched", async () => {
      db.tenant.findUnique.mockResolvedValue(trialTenant());
      mockTokenStore.getPendingPaymentMethodChange.mockResolvedValue({
        subscriptionId: "sub_new",
        planTier: "growth",
        billing: "annual",
      });
      const res = makeRes();
      await confirmPaymentMethodChange(signed(), res);

      const data = db.tenant.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        razorpaySubscriptionId: "sub_new",
        previousRazorpaySubscriptionId: "sub_trial",
        subscriptionStatus: "trialing",
        planTier: "growth",
        billing: "annual",
      });
      expect(data.planActivatedAt).toBeUndefined();
      expect(data.planExpiresAt).toBeUndefined();
      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_trial", {
        cancel_at_cycle_end: 0,
      });
      expect(body(res).message).toBe("Plan changed.");
    });

    it("drops a trial plan change that's confirmed after the trial converted", async () => {
      db.tenant.findUnique.mockResolvedValue(
        trialTenant({ subscriptionStatus: "active" }),
      );
      mockTokenStore.getPendingPaymentMethodChange.mockResolvedValue({
        subscriptionId: "sub_new",
        planTier: "growth",
        billing: "annual",
      });
      const res = makeRes();
      await confirmPaymentMethodChange(signed(), res);

      expect(body(res).status).toBe(400);
      expect(mockRzpSubscriptionsCancel).toHaveBeenCalledWith("sub_new", {
        cancel_at_cycle_end: 0,
      });
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("rejects a forged signature without touching anything", async () => {
      const req = signed();
      req.body.razorpaySignature = "0".repeat(64);
      const res = makeRes();
      await confirmPaymentMethodChange(req, res);
      expect(body(res).status).toBe(400);
      expect(db.tenant.update).not.toHaveBeenCalled();
    });
  });

  describe("handleWebhook — the trial's first charge", () => {
    const webhook = (event: string, eventId = "evt_1") => {
      const raw = Buffer.from(
        JSON.stringify({
          event,
          payload: {
            subscription: { entity: { id: "sub_trial" } },
            payment: {
              entity: { amount: 799900, method: "upi", vpa: "acme@okhdfc" },
            },
          },
        }),
      );
      return {
        headers: {
          "x-razorpay-signature": createHmac("sha256", "whsec")
            .update(raw)
            .digest("hex"),
          "x-razorpay-event-id": eventId,
        },
        body: raw,
      } as any;
    };

    beforeEach(() => {
      process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
      mockTokenStore.tryReserveWebhookEvent.mockResolvedValue(true);
      db.tenantMembership.findFirst.mockResolvedValue({ userId: "u1" });
      db.user.findUnique.mockResolvedValue({
        email: "owner@acme.test",
        username: "owner",
      });
    });

    it("activates the trial, records the activation and starts the first paid cycle at the trial end", async () => {
      const tenant = trialTenant({
        planExpiresAt: new Date(NOW.getTime() + 60e3),
      });
      db.tenant.findFirst.mockResolvedValue(tenant);
      await handleWebhook(webhook("subscription.charged"), makeRes());

      const data = db.tenant.update.mock.calls[0][0].data;
      const next = new Date(tenant.planExpiresAt);
      next.setMonth(next.getMonth() + 1);
      expect(data).toMatchObject({
        subscriptionStatus: "active",
        planActivatedAt: NOW,
        planExpiresAt: next,
      });

      await flush();
      expect(mockNotify.mock.calls[0][0].email.subject).toBe(
        "Your Praesto subscription has started",
      );
    });

    it("activates a trial even if a slow first charge already sent it to grace_period", async () => {
      db.tenant.findFirst.mockResolvedValue(
        trialTenant({
          subscriptionStatus: "grace_period",
          planExpiresAt: new Date(NOW.getTime() - 2 * DAY_MS),
        }),
      );
      await handleWebhook(webhook("subscription.charged"), makeRes());
      expect(db.tenant.update.mock.calls[0][0].data).toMatchObject({
        subscriptionStatus: "active",
        planActivatedAt: NOW,
      });
    });

    it("leaves planActivatedAt alone on a normal renewal", async () => {
      db.tenant.findFirst.mockResolvedValue(
        trialTenant({
          subscriptionStatus: "active",
          planActivatedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      );
      await handleWebhook(webhook("subscription.charged"), makeRes());
      expect(
        db.tenant.update.mock.calls[0][0].data.planActivatedAt,
      ).toBeUndefined();
      await flush();
      expect(mockNotify.mock.calls[0][0].email.subject).toBe(
        "Your Praesto subscription has been renewed",
      );
    });

    it("ignores a redelivered event", async () => {
      mockTokenStore.tryReserveWebhookEvent.mockResolvedValue(false);
      await handleWebhook(webhook("subscription.charged"), makeRes());
      expect(db.tenant.findFirst).not.toHaveBeenCalled();
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("moves a trial whose first charge exhausted its retries into grace", async () => {
      db.tenant.updateMany.mockResolvedValue({ count: 1 });
      await handleWebhook(webhook("subscription.halted"), makeRes());
      expect(db.tenant.updateMany).toHaveBeenCalledWith({
        where: {
          razorpaySubscriptionId: "sub_trial",
          subscriptionStatus: { not: "expired" },
        },
        data: { subscriptionStatus: "grace_period" },
      });
    });
  });
});
