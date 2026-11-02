// Platform billing ledger (services/billingLedger.ts): Razorpay → row
// mapping, plan inference, and replay safety (duplicate webhooks, refund
// events, mandate authorisations that aren't revenue).
const mockUpsert = jest.fn();
const mockTenantFindFirst = jest.fn();
jest.mock("@hrms/db", () => ({
  prisma: {
    billingPayment: { upsert: mockUpsert, update: jest.fn() },
    tenant: { findFirst: mockTenantFindFirst },
  },
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
const mockRzp = {
  payments: { fetch: jest.fn() },
  invoices: { fetch: jest.fn(), all: jest.fn() },
};
jest.mock("../handlers/payment", () => ({ getRazorpay: () => mockRzp }));

import {
  billingFromPeriod,
  inferPlanTier,
  ledgerRow,
  recordWebhookPayment,
  syncSubscriptionLedger,
} from "../services/billingLedger";
import { PLAN_PRICING } from "../config/billingPlans";

const T = 1_780_000_000; // unix seconds
const invoice = {
  id: "inv_1",
  subscription_id: "sub_1",
  payment_id: "pay_1",
  billing_start: T,
  billing_end: T + 30 * 86_400,
  created_at: T,
};
const captured = {
  id: "pay_1",
  amount: PLAN_PRICING.growth.monthly,
  currency: "INR",
  status: "captured",
  method: "upi",
  amount_refunded: 0,
  refund_status: null,
  invoice_id: "inv_1",
  created_at: T,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTenantFindFirst.mockResolvedValue({ id: "tenant1" });
  mockRzp.invoices.fetch.mockResolvedValue(invoice);
});

describe("mapping", () => {
  it("infers billing from the invoice period and the plan from list price", () => {
    expect(billingFromPeriod(new Date(0), new Date(30 * 86_400_000))).toBe(
      "monthly",
    );
    expect(billingFromPeriod(new Date(0), new Date(365 * 86_400_000))).toBe(
      "annual",
    );
    expect(inferPlanTier(PLAN_PRICING.enterprise.annual, "annual")).toBe(
      "enterprise",
    );
    expect(inferPlanTier(123_45, "monthly")).toBeNull(); // e.g. prorated
  });

  it("copies Razorpay's state and keeps no card or credential data", () => {
    const row = ledgerRow(
      { ...captured, card: { last4: "1111" }, vpa: "a@upi", email: "x@y" },
      invoice,
      "tenant1",
      "sub_1",
    );
    expect(row).toMatchObject({
      razorpayPaymentId: "pay_1",
      amount: PLAN_PRICING.growth.monthly,
      status: "captured",
      planTier: "growth",
      billing: "monthly",
      method: "upi",
    });
    expect(JSON.stringify(row)).not.toMatch(/1111|a@upi|x@y/);
  });
});

describe("webhook replay safety", () => {
  it("writes the same row with absolute values however often an event arrives", async () => {
    mockRzp.payments.fetch.mockResolvedValue(captured);
    const payload = {
      payment: { entity: { id: "pay_1" } },
      subscription: { entity: { id: "sub_1" } },
    };
    await recordWebhookPayment("subscription.charged", payload);
    await recordWebhookPayment("subscription.charged", payload);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    const [a, b] = mockUpsert.mock.calls.map((c) => c[0]);
    expect(a.where).toEqual({ razorpayPaymentId: "pay_1" });
    expect(b.where).toEqual(a.where);
    expect(b.update.amount).toBe(a.update.amount);
  });

  it("records a refund as Razorpay's running total, not an increment", async () => {
    mockRzp.payments.fetch.mockResolvedValue({
      ...captured,
      amount_refunded: 500_00,
      refund_status: "partial",
    });
    const payload = { refund: { entity: { payment_id: "pay_1" } } };
    await recordWebhookPayment("refund.processed", payload);
    await recordWebhookPayment("refund.processed", payload);
    for (const [arg] of mockUpsert.mock.calls)
      expect(arg.update.amountRefunded).toBe(500_00);
  });

  it("skips payments with no subscription invoice (trial mandate authorisation)", async () => {
    mockRzp.payments.fetch.mockResolvedValue({ ...captured, invoice_id: null });
    await recordWebhookPayment("payment.captured", {
      payment: { entity: { id: "pay_auth" } },
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("skips subscriptions no tenant holds", async () => {
    mockRzp.payments.fetch.mockResolvedValue(captured);
    mockTenantFindFirst.mockResolvedValue(null);
    await recordWebhookPayment("payment.failed", {
      payment: { entity: { id: "pay_1" } },
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("ignores unrelated events and never throws into the webhook", async () => {
    await recordWebhookPayment("subscription.authenticated", {
      payment: { entity: { id: "pay_1" } },
    });
    mockRzp.payments.fetch.mockRejectedValue(new Error("razorpay down"));
    await expect(
      recordWebhookPayment("payment.failed", {
        payment: { entity: { id: "pay_1" } },
      }),
    ).resolves.toBeUndefined();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("subscription sync", () => {
  it("records each paid invoice once and can limit itself to recent invoices", async () => {
    mockRzp.payments.fetch.mockResolvedValue(captured);
    mockRzp.invoices.all.mockResolvedValue({
      items: [
        invoice,
        {
          ...invoice,
          id: "inv_old",
          payment_id: "pay_old",
          created_at: T - 200 * 86_400,
        },
        { ...invoice, id: "inv_unpaid", payment_id: null },
      ],
    });
    jest.spyOn(Date, "now").mockReturnValue((T + 86_400) * 1000);
    expect(
      await syncSubscriptionLedger("tenant1", "sub_1", { sinceDays: 45 }),
    ).toBe(1);
    expect(await syncSubscriptionLedger("tenant1", "sub_1")).toBe(2);
    (Date.now as jest.Mock).mockRestore();
  });
});
