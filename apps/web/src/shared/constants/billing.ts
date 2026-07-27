// Mirrors apps/api-gateway/src/config/billingPlans.ts for display purposes —
// the web app can't import that package directly (Node-only deps), so keep
// both in sync by hand if prices change. The backend is what actually
// charges; these numbers exist only to render prices before/without a round
// trip to GET /payment/plan-pricing.
//
// Three flat-fee slabs by employee headcount — not per-employee billing (an
// earlier per-employee design was scrapped: it requires estimating headcount
// at signup, before real employees exist in the system, to seed the initial
// charge — flat slabs sidestep that entirely).

export type PlanTier = "starter" | "growth" | "enterprise";
export type Billing = "monthly" | "annual";

// null = uncapped (enterprise). Boundaries are inclusive of the cheaper tier.
export const TIER_EMPLOYEE_LIMITS: Record<PlanTier, number | null> = {
  starter: 25,
  growth: 100,
  enterprise: null,
};

export const PLAN_PRICING: Record<PlanTier, Record<Billing, number>> = {
  starter: {
    monthly: 799900, // ₹7,999/month
    annual: 8638920, // ₹86,389.20/year
  },
  growth: {
    monthly: 1499900, // ₹14,999/month
    annual: 16198920, // ₹1,61,989.20/year
  },
  enterprise: {
    monthly: 2999900, // ₹29,999/month
    annual: 32398920, // ₹3,23,989.20/year
  },
};

export function tierForEmployeeCount(count: number): PlanTier {
  if (count <= 25) return "starter";
  if (count <= 100) return "growth";
  return "enterprise";
}

export function amountPaise(tier: PlanTier, billing: Billing): number {
  return PLAN_PRICING[tier][billing];
}

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
