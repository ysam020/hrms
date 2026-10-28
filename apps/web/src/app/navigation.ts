import {
  canAccessJobOpenings,
  canAccessSettings,
  canManagePermissions,
  canManageReviews,
  canManageSalary,
  canViewAnalytics,
  isHrOrAbove,
  isOwnerOrAdmin,
} from "@web/shared/utils/permissions/navAccess";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import type { IconName } from "@next/ui";

// The navigation model: one table drives the sidebar, the compact tab bar,
// ⌘K search, and active-state matching. Each business module is its own
// entry; modules with several pages expand to show them (two levels, never
// deeper). Paths match Classic's routes so links and bookmarks carry over.
//
// Visibility predicates are Classic's own (navAccess / hasSubscriptionAccess)
// and mirror the route gates — they hide links; the route gates in router.tsx
// and the server do the real enforcement.

type User = any;
type Check = (u: User) => boolean;
export const canAccessWfh: Check = (u) => Boolean(u?.wfhEnabled);
export const canApproveJoinRequests: Check = (u) =>
  isOwnerOrAdmin(u) ||
  Boolean(u?.permissions?.includes("Organisation:approve_join_requests"));

export interface NavPage {
  id: string;
  label: string;
  path: string;
  visible?: Check;
  /** Extra path prefixes that belong to this page (detail routes, aliases). */
  also?: string[];
  /** Match the path exactly (for a module's index page). */
  exact?: boolean;
  keywords?: string;
}

export interface NavModule {
  id: string;
  label: string;
  icon: IconName;
  visible?: Check;
  /** Single-page module. */
  path?: string;
  also?: string[];
  exact?: boolean;
  /** Multi-page module. */
  pages?: NavPage[];
  keywords?: string;
  /** Reachable from ⌘K only (as in Classic's Spotlight). */
  searchOnly?: boolean;
}

/** Clusters are separated by space in the sidebar — no category headings. */
export const NAV: NavModule[][] = [
  [
    {
      id: "today",
      label: "Today",
      icon: "today",
      path: "/dashboard",
      exact: true,
      keywords: "dashboard home",
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: "inbox",
      path: "/approvals",
      keywords: "pending requests inbox",
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: "calendar",
      path: "/calendar",
      keywords: "events schedule",
    },
    {
      id: "chat",
      label: "Chat",
      icon: "chat",
      path: "/chat",
      keywords: "messages",
    },
  ],
  [
    {
      id: "employees",
      label: "Employees",
      icon: "people",
      visible: isHrOrAbove,
      pages: [
        {
          id: "employees-directory",
          label: "Directory",
          path: "/employee-management/employee-list",
          also: ["/employee-management"],
          keywords: "staff people",
        },
        {
          id: "employees-insights",
          label: "Insights",
          path: "/employee-management/insights",
        },
      ],
    },
    {
      id: "org",
      label: "Organization",
      icon: "org",
      path: "/organization-tree",
      keywords: "org chart hierarchy tree",
    },
    {
      id: "attendance",
      label: "Attendance",
      icon: "clock",
      pages: [
        {
          id: "attendance-mine",
          label: "My Attendance",
          path: "/attendance",
          exact: true,
          keywords: "punch",
        },
        {
          id: "attendance-all",
          label: "All Attendance",
          path: "/attendance/view-all-attendances",
          keywords: "team",
        },
        {
          id: "attendance-corrections",
          label: "Corrections",
          path: "/attendance/attendance-correction",
        },
        {
          id: "attendance-insights",
          label: "Insights",
          path: "/attendance/insights",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "leave",
      label: "Leave",
      icon: "leave",
      pages: [
        {
          id: "leave-applications",
          label: "Leave Applications",
          path: "/attendance/view-leave-applications",
          keywords: "time off",
        },
        {
          id: "leave-apply",
          label: "Apply for Leave",
          path: "/attendance/apply-leave",
        },
      ],
    },
    {
      id: "wfh",
      label: "Work From Home",
      icon: "wfh",
      path: "/wfh/requests",
      also: ["/wfh"],
      visible: canAccessWfh,
      keywords: "wfh remote",
    },
    {
      id: "holidays",
      label: "Holidays",
      icon: "flag",
      path: "/holidays",
      keywords: "public holidays",
    },
    {
      id: "kyc",
      label: "KYC",
      icon: "idcard",
      pages: [
        {
          id: "kyc-list",
          label: "Employee KYC",
          path: "/kyc/view-employee-kycs",
          also: ["/kyc", "/view-kyc", "/edit-kyc"],
          keywords: "documents verification",
        },
        {
          id: "kyc-complete",
          label: "Complete My KYC",
          path: "/kyc/complete-kyc",
        },
        {
          id: "kyc-insights",
          label: "Insights",
          path: "/kyc/insights",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "recruitment",
      label: "Recruitment",
      icon: "briefcase",
      visible: canAccessJobOpenings,
      pages: [
        {
          id: "jobs",
          label: "Job Openings",
          path: "/job-openings/view-job-openings",
          also: ["/job-openings", "/view-job-opening"],
          keywords: "jobs hiring candidates",
        },
        {
          id: "jobs-new",
          label: "New Opening",
          path: "/job-openings/new",
          visible: isHrOrAbove,
        },
        {
          id: "jobs-insights",
          label: "Insights",
          path: "/job-openings/insights",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "performance",
      label: "Performance",
      icon: "star",
      pages: [
        {
          id: "perf-reviews",
          label: "Reviews",
          path: "/performance-reviews/reviews",
          also: ["/performance-reviews"],
          keywords: "appraisal",
        },
        {
          id: "perf-cycles",
          label: "Review Cycles",
          path: "/performance-reviews/review-cycles",
          visible: canManageReviews,
        },
      ],
    },
    {
      id: "payroll",
      label: "Payroll",
      icon: "banknote",
      pages: [
        {
          id: "pay-slips",
          label: "My Payslips",
          path: "/payroll/my-payslips",
          also: ["/payroll"],
          keywords: "salary slip",
        },
        {
          id: "pay-advances",
          label: "Salary Advances",
          path: "/payroll/salary-advances",
          keywords: "loan advance",
        },
        {
          id: "pay-tax",
          label: "My Tax Declaration",
          path: "/payroll/my-tax-declaration",
          keywords: "tds 80c investment",
        },
        {
          id: "pay-runs",
          label: "Payroll Runs",
          path: "/payroll/payroll-runs",
          visible: isHrOrAbove,
        },
        {
          id: "pay-salary",
          label: "Salary Management",
          path: "/payroll/salary-management",
          visible: canManageSalary,
          keywords: "ctc structure",
        },
        {
          id: "pay-tax-review",
          label: "Tax Declarations",
          path: "/payroll/tax-declarations",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "assets",
      label: "Assets",
      icon: "laptop",
      pages: [
        {
          id: "assets-inventory",
          label: "Inventory",
          path: "/assets/inventory",
          also: ["/assets"],
          keywords: "devices equipment",
        },
        { id: "assets-issues", label: "Issues", path: "/assets/issues" },
        {
          id: "assets-summary",
          label: "Summary",
          path: "/assets/summary",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "resignations",
      label: "Resignations",
      icon: "door",
      pages: [
        {
          id: "resign-list",
          label: "Resignations",
          path: "/resignation-process/view-resignations",
          also: ["/resignation-process"],
          keywords: "exit offboarding",
        },
        {
          id: "resign-feedback",
          label: "Exit Feedback",
          path: "/resignation-process/exit-feedback",
        },
        {
          id: "resign-insights",
          label: "Insights",
          path: "/resignation-process/insights",
          visible: isHrOrAbove,
        },
      ],
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: "megaphone",
      path: "/hr-activities",
      keywords: "hr activities news",
    },
    {
      id: "policies",
      label: "Policies",
      icon: "doc",
      path: "/policy",
      keywords: "handbook rules",
    },
    {
      id: "helpdesk",
      label: "Helpdesk",
      icon: "lifebuoy",
      path: "/helpdesk",
      keywords: "tickets support",
    },
  ],
  [
    {
      id: "analytics",
      label: "Analytics",
      icon: "chart",
      visible: canViewAnalytics,
      pages: [
        {
          id: "an-workforce",
          label: "Workforce",
          path: "/analytics/workforce",
          also: ["/analytics"],
        },
        {
          id: "an-leave",
          label: "Leave & Attendance",
          path: "/analytics/leave-attendance",
        },
        {
          id: "an-recruitment",
          label: "Recruitment",
          path: "/analytics/recruitment",
        },
        { id: "an-salary", label: "Salary", path: "/analytics/salary" },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      icon: "table",
      visible: isHrOrAbove,
      pages: [
        {
          id: "reports-builder",
          label: "Report Builder",
          path: "/reports/report-builder",
          also: ["/reports"],
        },
        {
          id: "reports-saved",
          label: "Saved Reports",
          path: "/reports/saved-reports",
        },
      ],
    },
    {
      id: "permissions",
      label: "Permissions",
      icon: "key",
      visible: canManagePermissions,
      pages: [
        {
          id: "perm-roles",
          label: "Roles",
          path: "/permissions/manage-roles",
          also: ["/permissions"],
          keywords: "access",
        },
        {
          id: "perm-users",
          label: "User Permissions",
          path: "/permissions/user-permissions",
        },
        { id: "perm-teams", label: "Teams", path: "/permissions/teams" },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      icon: "gear",
      visible: canAccessSettings,
      pages: [
        {
          id: "set-company",
          label: "Company Info",
          path: "/settings/company",
          also: ["/settings", "/company-info"],
          keywords: "organisation profile",
        },
        {
          id: "set-leave",
          label: "Leave Policy",
          path: "/settings/leave",
          also: ["/org-settings"],
        },
        {
          id: "set-attendance",
          label: "Attendance Rules",
          path: "/settings/attendance",
          keywords: "geofence",
        },
        { id: "set-hr", label: "HR Policy", path: "/settings/hr-policy" },
        { id: "set-workweek", label: "Work Week", path: "/settings/work-week" },
        {
          id: "set-exit",
          label: "Exit Policy",
          path: "/settings/exit-policy",
          keywords: "notice checklist",
        },
        {
          id: "set-payroll",
          label: "Payroll Setup",
          path: "/settings/payroll",
          keywords: "components slabs pay cycles tax",
        },
        {
          id: "set-pipeline",
          label: "Recruitment Pipeline",
          path: "/settings/recruitment-pipeline",
        },
        {
          id: "set-join",
          label: "Join Requests",
          path: "/settings/join-requests",
          visible: canApproveJoinRequests,
        },
      ],
    },
    {
      id: "audit",
      label: "Audit Log",
      icon: "shield",
      path: "/audit-logs",
      visible: isOwnerOrAdmin,
      keywords: "activity history changes security",
    },
    {
      id: "webhooks",
      label: "Webhooks",
      icon: "link",
      visible: isOwnerOrAdmin,
      searchOnly: true,
      pages: [
        {
          id: "wh-endpoints",
          label: "Endpoints",
          path: "/webhooks/endpoints",
          also: ["/webhooks"],
        },
        { id: "wh-log", label: "Delivery Log", path: "/webhooks/delivery-log" },
      ],
    },
    {
      id: "subscription",
      label: "Subscription",
      icon: "card",
      path: "/subscription",
      visible: hasSubscriptionAccess,
      keywords: "billing plan",
    },
    {
      id: "ai-assistants",
      label: "AI Assistants",
      icon: "assistant",
      path: "/ai-assistants",
      keywords: "assistant chatbot claude chatgpt mcp connector ai",
    },
    {
      id: "help",
      label: "Help",
      icon: "help",
      path: "/help",
      keywords: "shortcuts support",
    },
  ],
];

const allows = (check: Check | undefined, u: User) => !check || check(u);

/** Modules (with their visible pages) the user can see, per cluster. */
export function visibleNav(user: User): NavModule[][] {
  return NAV.map((cluster) =>
    cluster
      .filter((m) => !m.searchOnly && allows(m.visible, user))
      .map((m) =>
        m.pages
          ? { ...m, pages: m.pages.filter((p) => allows(p.visible, user)) }
          : m,
      )
      .filter((m) => !m.pages || m.pages.length > 0),
  ).filter((c) => c.length > 0);
}

export interface SearchEntry {
  id: string;
  label: string;
  path: string;
  icon: IconName;
  module?: string;
  keywords?: string;
}

/** Every destination the user can reach, flattened for ⌘K. */
export function searchableNav(user: User): SearchEntry[] {
  return NAV.flat()
    .filter((m) => allows(m.visible, user))
    .flatMap<SearchEntry>((m) =>
      m.pages
        ? m.pages
            .filter((p) => allows(p.visible, user))
            .map((p) => ({
              id: p.id,
              label: p.label,
              path: p.path,
              icon: m.icon,
              module: m.label,
              keywords: `${m.label} ${p.keywords ?? ""}`,
            }))
        : [
            {
              id: m.id,
              label: m.label,
              path: m.path!,
              icon: m.icon,
              keywords: m.keywords,
            },
          ],
    );
}

type Matchable = { id: string; path: string; also?: string[]; exact?: boolean };

const score = (pathname: string, m: Matchable): number => {
  if (m.exact) return pathname === m.path ? 1000 : 0;
  let best = 0;
  for (const p of [m.path, ...(m.also ?? [])]) {
    if (pathname === p || pathname.startsWith(`${p}/`))
      best = Math.max(best, p.length + (pathname === p ? 1 : 0));
  }
  return best;
};

/** The module and page a pathname belongs to (most specific match wins). */
export function activeEntry(pathname: string): {
  module?: NavModule;
  page?: NavPage;
} {
  let best: { module?: NavModule; page?: NavPage; s: number } = { s: 0 };
  for (const m of NAV.flat()) {
    if (m.pages) {
      for (const p of m.pages) {
        const s = score(pathname, p);
        if (s > best.s) best = { module: m, page: p, s };
      }
    } else if (m.path) {
      const s = score(pathname, m as Matchable);
      if (s > best.s) best = { module: m, s };
    }
  }
  return { module: best.module, page: best.page };
}

/** Back-compat helper: the active module (used by the tab bar). */
export const activeItem = (pathname: string) => activeEntry(pathname).module;

/** Compact width tab bar: the four most-used destinations + More. */
export const TAB_BAR: {
  id: string;
  label: string;
  path: string;
  icon: IconName;
}[] = [
  { id: "today", label: "Today", path: "/dashboard", icon: "today" },
  { id: "approvals", label: "Approvals", path: "/approvals", icon: "inbox" },
  { id: "attendance", label: "Attendance", path: "/attendance", icon: "clock" },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: "calendar" },
];
