import PeopleIcon from "@mui/icons-material/People";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssessmentIcon from "@mui/icons-material/Assessment";
import WorkIcon from "@mui/icons-material/Work";

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

export const LEFT_FEATURES = [
  {
    icon: <PeopleIcon sx={{ fontSize: 22 }} />,
    title: "Employee Lifecycle",
    description:
      "From onboarding to offboarding — manage your entire workforce in one place.",
    color: "#4caf50",
  },
  {
    icon: <EventAvailableIcon sx={{ fontSize: 22 }} />,
    title: "Attendance & Leave",
    description:
      "Automated tracking, smart approvals, and real-time visibility for teams.",
    color: "#2196f3",
  },
  {
    icon: <AssessmentIcon sx={{ fontSize: 22 }} />,
    title: "Payroll & Analytics",
    description:
      "Accurate payslips and actionable workforce insights — all in one dashboard.",
    color: "#ff9800",
  },
  {
    icon: <WorkIcon sx={{ fontSize: 22 }} />,
    title: "Recruitment",
    description:
      "Post openings, track candidates, and hire faster with structured pipelines.",
    color: "#e91e63",
  },
];
