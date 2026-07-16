import PeopleIcon from "@mui/icons-material/People";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssessmentIcon from "@mui/icons-material/Assessment";
import WorkIcon from "@mui/icons-material/Work";
import type { Billing } from "./types";

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

export const COMPANY_SIZES = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "501–1000",
  "1000+",
];

export const PLAN_FEATURES = [
  "All modules (Attendance, Leave, Payroll, Recruitment)",
  "Unlimited employees",
  "Analytics & Monitoring dashboards",
  "Role-based permissions",
  "Push notifications",
  "Priority support",
];

export const PRICES: Record<
  Billing,
  { display: string; sub: string; savings?: string; amount: number }
> = {
  monthly: { display: "₹999", sub: "per month", amount: 99900 },
  annual: {
    display: "₹9,999",
    sub: "per year",
    savings: "Save ₹2,989 (25%)",
    amount: 999900,
  },
};

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
