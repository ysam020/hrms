// Re-exported so existing imports of "./constants" (and its test file) keep
// working — the actual implementation now lives in one place, shared with
// the Subscription page's plan-change flow.
export { loadRazorpayScript } from "@web/shared/constants/billing";

export const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance & Banking",
  "Education",
  "Retail & E-commerce",
  "Manufacturing",
  "Construction",
  "Hospitality & Travel",
  "Professional Services",
  "Non-profit",
  "Other",
];

// Drives the plan tier decision on PlanStep — see planTierForCompanySize in
// OrgSetupPage.tsx. Not an arbitrary informational field anymore: maps
// directly to the starter/growth/enterprise flat-fee slabs.
export const COMPANY_SIZES = ["1–25", "26–100", "More than 100"];

// The employee-count line is tier-specific — see PlanStep, which prepends
// "Up to 25 employees" / "Up to 100 employees" / "Unlimited employees" to
// this list depending on the tier.
export const PLAN_FEATURES = [
  "All modules (Attendance, Leave, Payroll, Recruitment)",
  "Analytics & Monitoring dashboards",
  "Role-based permissions",
  "Push notifications",
  "Priority support",
];
