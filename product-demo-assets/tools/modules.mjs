// The modules on /product-demo, in page order, with the copy shown for each.
// Wording follows the landing page and the marketing library's claims
// register: only what the product does today. `icon` is a name from the web
// app's Icon set. `order` is the video order within the module (the first is
// the module's featured video).
export const MODULES = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "sparkle",
    description:
      "Set up your organisation, bring people in, and make Praesto yours: your profile, status, theme and passwordless sign-in.",
    order: [
      "org-setup",
      "join-organisation",
      "join-requests",
      "profile-and-theme",
      "passkeys",
    ],
  },
  {
    id: "overview",
    title: "Platform Overview",
    icon: "today",
    description:
      "The screens everyone uses every day: Today, the company calendar, team chat and the organisation chart.",
    order: ["today-at-a-glance", "calendar", "chat", "organization-structure"],
  },
  {
    id: "employee-management",
    title: "Employees",
    icon: "people",
    description:
      "One directory for everyone, with employment status, KYC, company assets and a clear process when someone leaves.",
    order: [
      "employee-directory",
      "employee-status",
      "kyc",
      "assets",
      "resignations",
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    icon: "clock",
    description:
      "Every workday accounted for: punches and hours, corrections, Geofencing around the office, work from home and holidays.",
    order: [
      "my-attendance",
      "attendance-correction",
      "geofencing",
      "wfh",
      "holidays",
    ],
  },
  {
    id: "leave-management",
    title: "Leave",
    icon: "leave",
    description:
      "Apply in seconds, approve in one click, and set the leave policy your organisation runs on.",
    order: ["apply-leave", "approve-leave", "leave-policy"],
  },
  {
    id: "payroll",
    title: "Payroll",
    icon: "banknote",
    description:
      "Take each month from draft to approved to disbursed, set up salary structures, and give employees their payslips.",
    order: ["payroll-runs", "payslips", "payroll-setup"],
  },
  {
    id: "recruitment",
    title: "Recruitment",
    icon: "briefcase",
    description:
      "Hiring from start to finish: new openings, interviews and interviewers, offers and rejections, insights, pipelines and the careers page.",
    order: ["hiring-pipeline", "new-job-opening", "interview-scheduling", "hire-or-reject", "recruitment-insights", "recruitment-pipeline"],
  },
  {
    id: "performance",
    title: "Performance",
    icon: "star",
    description:
      "Review cycles with a self-assessment first and the manager’s review after, tracked to completion.",
    order: ["performance-reviews"],
  },
  {
    id: "workplace",
    title: "Workplace",
    icon: "megaphone",
    description:
      "Keep everyone informed and supported: announcements, company policies, the helpdesk and notifications.",
    order: ["announcements", "policies", "helpdesk", "notifications"],
  },
  {
    id: "reports",
    title: "Reports & Analytics",
    icon: "chart",
    description:
      "Build your own reports from people data, and see the workforce, attendance and hiring at a glance.",
    order: ["report-builder", "analytics", "employee-insights"],
  },
  {
    id: "security",
    title: "Security & Admin",
    icon: "shield",
    description:
      "Role-Based Access Control, a tamper-proof audit log, organisation settings and your subscription.",
    order: ["roles-permissions", "audit-logs", "settings", "subscription"],
  },
  {
    id: "ai-support",
    title: "AI & Support",
    icon: "assistant",
    description:
      "Use your own AI assistant with Praesto, within your permissions, and reach the Praesto team when you need help.",
    order: ["ai-assistants", "support"],
  },
];
