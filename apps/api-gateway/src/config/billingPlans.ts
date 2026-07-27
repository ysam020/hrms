// Single backend source of truth for subscription pricing. The web app keeps
// a mirrored copy for display purposes only (see
// apps/web/src/shared/constants/billing.ts) — it can't import this package
// directly since @hrms/common (and this app) carry Node-only deps that don't
// bundle into the Vite build. Keep both in sync by hand if prices change.
//
// Three flat-fee slabs, keyed by employee headcount — deliberately NOT
// per-employee billing. An earlier per-employee design was scrapped because
// it requires estimating headcount at signup (before real employees exist in
// the system) to seed the initial charge, which either overcharges (estimate
// too high) or undercharges (estimate too low, only correctable at the next
// renewal). Flat slabs sidestep that: the price for a slab never depends on
// exactly how many employees are in it.

export type PlanTier = "starter" | "growth" | "enterprise";
export type Billing = "monthly" | "annual";

// null = uncapped (enterprise). Boundaries are inclusive of the cheaper tier
// — exactly 25 employees is still "starter", exactly 100 is still "growth".
export const TIER_EMPLOYEE_LIMITS: Record<PlanTier, number | null> = {
  starter: 25,
  growth: 100,
  enterprise: null,
};

// All amounts in paise. Annual = monthly * 12 * 0.9 (flat 10% off), rounded.
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

// Normalizes a plan's cost to a monthly figure so tier/billing changes can be
// compared as an upgrade vs. a downgrade.
export function monthlyEquivalentPaise(
  tier: PlanTier,
  billing: Billing,
): number {
  const amount = PLAN_PRICING[tier][billing];
  return billing === "annual" ? amount / 12 : amount;
}
