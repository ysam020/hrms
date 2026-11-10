// The modules on /product-demo, in page order, with the copy shown for each.
// Wording follows the landing page and the marketing library's claims
// register: only what the product does today. `icon` is a name from the web
// app's Icon set. `order` is the video order within the module (the first is
// the module's featured video).
export const MODULES = [
  {
    id: "overview",
    title: "Platform Overview",
    icon: "today",
    description:
      "Start here: the Today screen everyone opens each morning, and how your organisation is laid out in Praesto.",
    order: ["today-at-a-glance", "organization-structure"],
  },
  {
    id: "employee-management",
    title: "Employee Management",
    icon: "people",
    description:
      "One directory for everyone, with profiles that hold work, contact and statutory details, and a simple way to bring new people in.",
    order: ["employee-directory", "join-requests"],
  },
  {
    id: "attendance",
    title: "Attendance",
    icon: "clock",
    description:
      "Every workday accounted for: punches and hours, corrections tracked against your policy, and Geofencing around the office.",
    order: ["my-attendance", "geofencing", "attendance-correction"],
  },
  {
    id: "leave-management",
    title: "Leave Management",
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
      "Take each month from draft to approved to disbursed, and give employees their payslips and TDS worksheets.",
    order: ["payroll-runs", "payslips"],
  },
  {
    id: "recruitment",
    title: "Recruitment",
    icon: "briefcase",
    description:
      "Open roles, their applicants and each candidate’s application, in one hiring workspace.",
    order: ["hiring-pipeline"],
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
    id: "reports",
    title: "Reports & Analytics",
    icon: "chart",
    description:
      "Build your own reports from people data, and see the workforce at a glance.",
    order: ["report-builder", "employee-insights"],
  },
  {
    id: "security",
    title: "Security",
    icon: "shield",
    description:
      "Role-Based Access Control with Own, Team and Everyone scopes, passwordless sign-in with passkeys, and a full audit log.",
    order: ["roles-permissions", "passkeys-and-audit"],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "bell",
    description:
      "Know when something changes for you: decisions on your requests and updates from HR.",
    order: ["notifications"],
  },
];
