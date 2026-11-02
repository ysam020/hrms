// Platform Console metric definitions (services/platformMetrics.ts): MRR
// normalisation, lifecycle counts, trial conversion, cash collections,
// currencies, and date ranges. Pure functions — no DB.
import {
  arpa,
  billedMrrAt,
  bucketKey,
  bucketKeys,
  collections,
  growth,
  istDate,
  mrrSummary,
  netBy,
  resolveRange,
  series,
  subscriptionCounts,
  trialConversion,
  type PaymentRow,
  type TenantRow,
} from "../services/platformMetrics";
import { PLAN_PRICING } from "../config/billingPlans";

const NOW = new Date("2026-11-02T06:30:00.000Z"); // 12:00 IST
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

let seq = 0;
function tenant(over: Partial<TenantRow> = {}): TenantRow {
  seq++;
  return {
    id: seq.toString(16).padStart(24, "0"),
    name: `Org ${seq}`,
    slug: `org-${seq}`,
    createdAt: days(-100),
    isActive: true,
    subscriptionStatus: "active",
    planTier: "starter",
    billing: "monthly",
    planActivatedAt: days(-90),
    planExpiresAt: days(20),
    trialStartedAt: null,
    trialEndsAt: null,
    razorpaySubscriptionId: `sub_${seq}`,
    ...over,
  };
}

function payment(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    tenantId: "t1",
    amount: PLAN_PRICING.starter.monthly,
    currency: "INR",
    status: "captured",
    amountRefunded: 0,
    planTier: "starter",
    billing: "monthly",
    periodStart: days(-10),
    periodEnd: days(20),
    paidAt: days(-10),
    ...over,
  };
}

describe("MRR", () => {
  it("normalises annual plans to a monthly equivalent", () => {
    const s = mrrSummary(
      [
        tenant({ planTier: "growth", billing: "annual" }),
        tenant({ planTier: "starter", billing: "monthly" }),
      ],
      NOW,
    );
    const annualMonthly = Math.round(PLAN_PRICING.growth.annual / 12);
    expect(s.fromAnnual).toBe(annualMonthly);
    expect(s.fromMonthly).toBe(PLAN_PRICING.starter.monthly);
    expect(s.mrr).toBe(annualMonthly + PLAN_PRICING.starter.monthly);
    expect(s.arr).toBe(s.mrr * 12);
    expect(s.payingTenants).toBe(2);
  });

  it("counts only active tenants that have actually been charged", () => {
    const s = mrrSummary(
      [
        tenant(), // paying
        // Trial: authorised, never charged.
        tenant({
          subscriptionStatus: "trialing",
          planActivatedAt: null,
          trialStartedAt: days(-3),
          trialEndsAt: days(11),
        }),
        // "active" without a Razorpay subscription (e.g. seeded) is not paying.
        tenant({ razorpaySubscriptionId: null }),
        tenant({ subscriptionStatus: "grace_period" }), // at risk
        tenant({ subscriptionStatus: "cancelled", planExpiresAt: days(5) }), // non-renewing
        tenant({ subscriptionStatus: "cancelled", planExpiresAt: days(-5) }), // gone
        tenant({ subscriptionStatus: "expired" }),
      ],
      NOW,
    );
    const v = PLAN_PRICING.starter.monthly;
    expect(s.payingTenants).toBe(1);
    expect(s.mrr).toBe(v);
    expect(s.atRisk).toBe(v);
    expect(s.nonRenewing).toBe(v);
  });

  it("treats a missing plan tier as starter (the schema default)", () => {
    const s = mrrSummary([tenant({ planTier: null, billing: null })], NOW);
    expect(s.mrr).toBe(PLAN_PRICING.starter.monthly);
  });
});

describe("subscription counts", () => {
  it("uses the stored lifecycle states and the 30/7-day windows", () => {
    const c = subscriptionCounts(
      [
        tenant({ planExpiresAt: days(10) }), // paying, renews soon
        tenant({ planExpiresAt: days(60), billing: "annual" }), // paying
        tenant({ subscriptionStatus: "grace_period" }),
        tenant({ subscriptionStatus: "cancelled", planExpiresAt: days(3) }),
        tenant({ subscriptionStatus: "expired" }),
        tenant({
          subscriptionStatus: "trialing",
          planActivatedAt: null,
          trialStartedAt: days(-10),
          trialEndsAt: days(4),
        }),
      ],
      NOW,
    );
    expect(c.paying).toBe(2);
    expect(c.byBilling).toEqual({ monthly: 1, annual: 1 });
    expect(c.pastDue).toBe(1);
    expect(c.cancelled).toBe(1);
    expect(c.expired).toBe(1);
    expect(c.trialing).toBe(1);
    expect(c.renewingSoon).toBe(1);
    expect(c.endingSoon).toBe(1);
    expect(c.trialsEndingSoon).toBe(1);
  });
});

describe("trial conversion", () => {
  it("measures trials that ended in the window; running trials don't count", () => {
    const from = days(-30);
    const t = trialConversion(
      [
        // ended in window, converted
        tenant({
          trialStartedAt: days(-25),
          trialEndsAt: days(-11),
          planActivatedAt: days(-11),
        }),
        // ended in window, never charged
        tenant({
          subscriptionStatus: "expired",
          trialStartedAt: days(-20),
          trialEndsAt: days(-6),
          planActivatedAt: null,
        }),
        // still running
        tenant({
          subscriptionStatus: "trialing",
          trialStartedAt: days(-2),
          trialEndsAt: days(12),
          planActivatedAt: null,
        }),
        // paid at signup — not a trial
        tenant({ trialStartedAt: null }),
      ],
      from,
      NOW,
      NOW,
    );
    expect(t.ended).toBe(2);
    expect(t.converted).toBe(1);
    expect(t.expiredUnconverted).toBe(1);
    expect(t.rate).toBe(0.5);
    expect(t.started).toBe(3);
    expect(t.recentConversions).toHaveLength(1);
  });

  it("reports no rate when no trial has ended", () => {
    expect(trialConversion([], days(-30), NOW, NOW).rate).toBeNull();
  });
});

describe("collections", () => {
  it("excludes failed and pending payments from collected revenue", () => {
    const c = collections([
      payment(),
      payment({ status: "failed" }),
      payment({ status: "authorized" }),
    ]).INR;
    expect(c.gross).toBe(PLAN_PRICING.starter.monthly);
    expect(c.successful).toBe(1);
    expect(c.failed).toBe(1);
    expect(c.pending).toBe(1);
  });

  it("counts a refund once, from the payment's own refunded total", () => {
    // A partially refunded payment whose refund webhooks arrived twice is
    // still one ledger row carrying Razorpay's running amount_refunded.
    const c = collections([
      payment({ amount: 100_00, amountRefunded: 40_00 }),
      payment({ amount: 100_00, amountRefunded: 100_00, status: "refunded" }),
    ]).INR;
    expect(c.gross).toBe(200_00);
    expect(c.refunds).toBe(140_00);
    expect(c.net).toBe(60_00);
    expect(c.refunded).toBe(2);
  });

  it("never adds different currencies together", () => {
    const c = collections([
      payment({ amount: 100_00 }),
      payment({ amount: 50_00, currency: "USD" }),
    ]);
    expect(c.INR.gross).toBe(100_00);
    expect(c.USD.gross).toBe(50_00);
    const by = netBy(
      [payment({ amount: 1 }), payment({ amount: 2, currency: "USD" })],
      (p) => p.planTier ?? "x",
    );
    expect(by).toEqual({ INR: { starter: 1 }, USD: { starter: 2 } });
  });

  it("averages net revenue per paying tenant", () => {
    expect(
      arpa([
        payment({ tenantId: "a", amount: 100 }),
        payment({ tenantId: "a", amount: 100 }),
        payment({ tenantId: "b", amount: 100 }),
        payment({ tenantId: "c", amount: 100, status: "failed" }),
      ]).INR,
    ).toBe(150);
  });
});

describe("billed MRR", () => {
  it("spreads annual charges over 12 months and only counts covered periods", () => {
    const rows = [
      payment({
        amount: 1200,
        billing: "annual",
        periodStart: days(-100),
        periodEnd: days(265),
      }),
      payment({ amount: 300, periodStart: days(-10), periodEnd: days(20) }),
      // period over before NOW
      payment({ amount: 999, periodStart: days(-70), periodEnd: days(-40) }),
      payment({ amount: 777, status: "failed" }),
      payment({ amount: 500, amountRefunded: 500, status: "refunded" }),
    ];
    expect(billedMrrAt(rows, NOW)).toBe(100 + 300);
  });
});

describe("date ranges", () => {
  it("builds the previous equivalent period", () => {
    const r = resolveRange({ range: "30d" }, NOW, null);
    expect(r.to).toEqual(NOW);
    expect(r.from).toEqual(istDate("2026-10-04"));
    expect(r.prevTo).toEqual(r.from);
    expect(r.from.getTime() - r.prevFrom.getTime()).toBe(
      r.to.getTime() - r.from.getTime(),
    );
    expect(r.bucket).toBe("day");
  });

  it("reads explicit dates as IST calendar days, end inclusive", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-31" }, NOW, null);
    expect(r.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });

  it("buckets by IST, so late-evening UTC lands on the next day", () => {
    const d = new Date("2026-10-31T20:00:00.000Z"); // 01:30 IST, 1 Nov
    expect(bucketKey(d, "day")).toBe("2026-11-01");
    expect(bucketKey(d, "month")).toBe("2026-11");
    expect(bucketKey(d, "week")).toBe("2026-10-26"); // Monday
  });

  it("zero-fills empty buckets and ignores rows outside the range", () => {
    const range = {
      from: istDate("2026-10-01"),
      to: istDate("2026-10-04"),
      bucket: "day" as const,
    };
    expect(bucketKeys(range)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    const s = series(
      [{ at: istDate("2026-10-02") }, { at: istDate("2026-10-09") }],
      range,
      (r) => r.at,
    );
    expect(s.map((b) => b.value)).toEqual([0, 1, 0]);
  });

  it("has no growth figure without a base period", () => {
    expect(growth(5, 0)).toBeNull();
    expect(growth(15, 10)).toBe(50);
  });
});
