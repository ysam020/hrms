import { useContext, type ComponentType, type ReactNode } from "react";
import {
  Navigate,
  createBrowserRouter,
  useLocation,
  useSearchParams,
  type RouteObject,
} from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
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
import { AppShell } from "@next/shell/AppShell";
import { RequireSession, SessionRoot } from "./session";
import {
  canAccessWfh,
  canApproveJoinRequests,
  canUseSupport,
} from "./navigation";
import { canRaiseSupport, isSupportAgent } from "@next/features/support/config";
import { NoAccess, NotFound, RouteError } from "@next/features/system/System";

// Route table. Paths match Classic's (apps/web/src/app/router/routesConfig.tsx)
// so links and bookmarks carry over; a few Classic tabs that lived behind
// query strings get their own paths here (Settings, Apply for Leave, New
// Opening), with redirects from the old forms. Access predicates are the same
// functions Classic's <RequireAccess> uses; the server enforces them again.

type Check = (u: any) => boolean;

function Gate({ check, children }: { check?: Check; children: ReactNode }) {
  const { user } = useContext(UserContext);
  if (check && !check(user)) return <NoAccess />;
  return <>{children}</>;
}

/**
 * A lazily loaded page. `load` resolves the module; `name` picks a named
 * export (default export otherwise). The module loads before the route
 * commits, so a view transition never snapshots a loading state.
 */
function page<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M | "default" = "default",
  check?: Check,
): Pick<RouteObject, "lazy"> {
  return {
    lazy: async () => {
      const C = (await load())[name] as ComponentType;
      return {
        Component: () => (
          <Gate check={check}>
            <C />
          </Gate>
        ),
      };
    },
  };
}

const to = (path: string): Pick<RouteObject, "element"> => ({
  element: <Navigate to={path} replace />,
});

/** Classic's Settings used ?tab=…&sub=…; map those links to the new pages. */
function LegacySettings() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  const sub = params.get("sub") ?? params.get("subtab");
  const map: Record<string, string> = {
    "join-requests": "/settings/join-requests",
    subscription: "/subscription",
    leave: "/settings/leave",
    attendance: "/settings/attendance",
    "hr-policy": "/settings/hr-policy",
    "work-week": "/settings/work-week",
    "exit-policy": "/settings/exit-policy",
    "payroll-components": "/settings/payroll",
    "recruitment-pipeline": "/settings/recruitment-pipeline",
  };
  const target =
    (sub && map[sub]) ||
    (tab && map[tab]) ||
    (tab === "org-settings" ? "/settings/leave" : "/settings/company");
  return <Navigate to={target} replace />;
}

function LoginRoute({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const location = useLocation();
  if (user)
    return (
      <Navigate
        to={(location.state as any)?.from?.pathname || "/dashboard"}
        replace
      />
    );
  return <>{children}</>;
}

const F = {
  today: () => import("@next/features/dashboard/Today"),
  approvals: () => import("@next/features/approvals/Approvals"),
  calendar: () => import("@next/features/calendar/CalendarPage"),
  chat: () => import("@next/features/chat/Chat"),
  profile: () => import("@next/features/profile/Profile"),
  employees: () => import("@next/features/employees/Employees"),
  employee: () => import("@next/features/employees/EmployeeDetail"),
  employeeInsights: () => import("@next/features/employees/Insights"),
  attendance: () => import("@next/features/attendance/Attendance"),
  attendanceInsights: () => import("@next/features/attendance/Insights"),
  wfh: () => import("@next/features/wfh/Wfh"),
  holidays: () => import("@next/features/holidays/Holidays"),
  kyc: () => import("@next/features/kyc/Kyc"),
  kycForm: () => import("@next/features/kyc/KycForm"),
  kycReview: () => import("@next/features/kyc/KycReview"),
  kycInsights: () => import("@next/features/kyc/Insights"),
  org: () => import("@next/features/org/OrgTree"),
  resignations: () => import("@next/features/resignations/Resignations"),
  exitFeedback: () => import("@next/features/resignations/ExitFeedback"),
  resignationInsights: () => import("@next/features/resignations/Insights"),
  jobs: () => import("@next/features/recruitment/Jobs"),
  job: () => import("@next/features/recruitment/JobDetail"),
  jobEditor: () => import("@next/features/recruitment/JobEditor"),
  recruitmentInsights: () => import("@next/features/recruitment/Insights"),
  performance: () => import("@next/features/performance/Performance"),
  cycles: () => import("@next/features/performance/Cycles"),
  payroll: () => import("@next/features/payroll/Payroll"),
  salary: () => import("@next/features/payroll/Salary"),
  tax: () => import("@next/features/payroll/Tax"),
  assets: () => import("@next/features/assets/Assets"),
  assetIssues: () => import("@next/features/assets/Issues"),
  assetSummary: () => import("@next/features/assets/Summary"),
  announcements: () => import("@next/features/announcements/Announcements"),
  policies: () => import("@next/features/policies/Policies"),
  policyEditor: () => import("@next/features/policies/PolicyEditor"),
  helpdesk: () => import("@next/features/helpdesk/Helpdesk"),
  ticket: () => import("@next/features/helpdesk/Ticket"),
  analytics: () => import("@next/features/analytics/Analytics"),
  reports: () => import("@next/features/reports/Reports"),
  permissions: () => import("@next/features/permissions/Permissions"),
  settings: () => import("@next/features/settings/Settings"),
  subscription: () => import("@next/features/subscription/Subscription"),
  help: () => import("@next/features/help/Help"),
  tours: () => import("@next/features/help/Tours"),
  support: () => import("@next/features/support/Support"),
  supportNew: () => import("@next/features/support/NewTicket"),
  supportTicket: () => import("@next/features/support/SupportTicket"),
  platformSupport: () =>
    import("@next/features/support/platform/PlatformSupport"),
  platformTicket: () =>
    import("@next/features/support/platform/PlatformTicket"),
  audit: () => import("@next/features/audit/AuditLog"),
  publicPages: () => import("@next/features/public/Public"),
  aiAssistants: () => import("@next/features/assistant/AiAssistants"),
  connectAuthorize: () => import("@next/features/assistant/ConnectAuthorize"),
  orgSetup: () => import("@next/features/public/OrgSetup"),
};

const appRoutes: RouteObject[] = [
  { path: "dashboard", ...page(F.today) },
  { path: "approvals", ...page(F.approvals) },
  { path: "calendar", ...page(F.calendar) },
  { path: "chat", ...page(F.chat) },
  { path: "profile/*", ...page(F.profile) },

  // Employees (HR and above) — the record itself stays open (server-scoped).
  { path: "employee-management", ...to("/employee-management/employee-list") },
  {
    path: "employee-management/employee-list",
    ...page(F.employees, "default", isHrOrAbove),
  },
  {
    path: "employee-management/insights",
    ...page(F.employeeInsights, "default", isHrOrAbove),
  },
  { path: "employee-management/:username", ...page(F.employee) },
  { path: "organization-tree", ...page(F.org) },

  // Attendance & leave
  { path: "attendance", ...page(F.attendance, "MyAttendancePage") },
  {
    path: "attendance/view-all-attendances",
    ...page(F.attendance, "AllAttendancePage"),
  },
  {
    path: "attendance/attendance-correction",
    ...page(F.attendance, "CorrectionsPage"),
  },
  {
    path: "attendance/insights",
    ...page(F.attendanceInsights, "default", isHrOrAbove),
  },
  {
    path: "attendance/view-leave-applications",
    ...page(F.attendance, "LeaveApplicationsPage"),
  },
  { path: "attendance/apply-leave", ...page(F.attendance, "ApplyLeavePage") },
  { path: "wfh", ...to("/wfh/requests") },
  { path: "wfh/requests", ...page(F.wfh, "default", canAccessWfh) },
  { path: "holidays", ...page(F.holidays) },

  // KYC
  { path: "kyc", ...to("/kyc/view-employee-kycs") },
  { path: "kyc/view-employee-kycs", ...page(F.kyc) },
  { path: "kyc/complete-kyc", ...page(F.kycForm, "CompleteKycPage") },
  { path: "kyc/insights", ...page(F.kycInsights, "default", isHrOrAbove) },
  { path: "view-kyc/:username", ...page(F.kycReview) },
  { path: "edit-kyc/:username", ...page(F.kycForm, "EditKycPage") },

  // Recruitment
  { path: "job-openings", ...to("/job-openings/view-job-openings") },
  {
    path: "job-openings/view-job-openings",
    ...page(F.jobs, "default", canAccessJobOpenings),
  },
  { path: "job-openings/new", ...page(F.jobEditor, "NewJobPage", isHrOrAbove) },
  {
    path: "job-openings/insights",
    ...page(F.recruitmentInsights, "default", isHrOrAbove),
  },
  {
    path: "view-job-opening/:_id",
    ...page(F.job, "default", canAccessJobOpenings),
  },
  {
    path: "view-job-opening/:_id/edit",
    ...page(F.jobEditor, "EditJobPage", canAccessJobOpenings),
  },

  // Performance
  { path: "performance-reviews", ...to("/performance-reviews/reviews") },
  { path: "performance-reviews/reviews", ...page(F.performance) },
  {
    path: "performance-reviews/review-cycles",
    ...page(F.cycles, "default", canManageReviews),
  },

  // Payroll
  { path: "payroll", ...to("/payroll/my-payslips") },
  { path: "payroll/my-payslips", ...page(F.payroll, "PayslipsPage") },
  { path: "payroll/salary-advances", ...page(F.payroll, "AdvancesPage") },
  { path: "payroll/payroll-runs", ...page(F.payroll, "RunsPage", isHrOrAbove) },
  {
    path: "payroll/my-tax-declaration",
    ...page(F.tax, "MyTaxDeclarationPage"),
  },
  {
    path: "payroll/salary-management",
    ...page(F.salary, "SalaryManagementPage", canManageSalary),
  },
  {
    path: "payroll/salary-management/:userId",
    ...page(F.salary, "SalaryStructurePage", canManageSalary),
  },
  {
    path: "payroll/tax-declarations",
    ...page(F.tax, "TaxDeclarationsPage", isHrOrAbove),
  },
  {
    path: "payroll/tax-declarations/:userId",
    ...page(F.tax, "TaxReviewPage", isHrOrAbove),
  },

  // Assets
  { path: "assets", ...to("/assets/inventory") },
  { path: "assets/inventory", ...page(F.assets) },
  { path: "assets/issues", ...page(F.assetIssues) },
  { path: "assets/summary", ...page(F.assetSummary, "default", isHrOrAbove) },

  // Resignations
  {
    path: "resignation-process",
    ...to("/resignation-process/view-resignations"),
  },
  { path: "resignation-process/view-resignations", ...page(F.resignations) },
  { path: "resignation-process/exit-feedback", ...page(F.exitFeedback) },
  {
    path: "resignation-process/insights",
    ...page(F.resignationInsights, "default", isHrOrAbove),
  },

  // Company
  { path: "hr-activities/*", ...page(F.announcements) },
  { path: "policy", ...page(F.policies) },
  { path: "policy/new", ...page(F.policyEditor, "NewPolicyPage") },
  { path: "policy/:id/edit", ...page(F.policyEditor, "EditPolicyPage") },
  { path: "policy/*", ...page(F.policies) },
  { path: "helpdesk", ...page(F.helpdesk) },
  { path: "helpdesk/all-tickets", ...to("/helpdesk") },
  { path: "helpdesk/:ticketId", ...page(F.ticket) },

  // Administration
  { path: "analytics", ...to("/analytics/workforce") },
  {
    path: "analytics/:section",
    ...page(F.analytics, "default", canViewAnalytics),
  },
  { path: "reports", ...to("/reports/report-builder") },
  {
    path: "reports/report-builder",
    ...page(F.reports, "ReportBuilderPage", isHrOrAbove),
  },
  {
    path: "reports/saved-reports",
    ...page(F.reports, "SavedReportsPage", isHrOrAbove),
  },
  { path: "permissions", ...to("/permissions/manage-roles") },
  {
    path: "permissions/manage-roles",
    ...page(F.permissions, "RolesPage", canManagePermissions),
  },
  {
    path: "permissions/user-permissions",
    ...page(F.permissions, "UserPermissionsPage", canManagePermissions),
  },
  {
    path: "permissions/teams",
    ...page(F.permissions, "TeamsPage", canManagePermissions),
  },
  { path: "settings", element: <LegacySettings /> },
  { path: "company-info", ...to("/settings/company") },
  { path: "org-settings", ...to("/settings/leave") },
  {
    path: "settings/company",
    ...page(F.settings, "CompanyInfoPage", canAccessSettings),
  },
  {
    path: "settings/leave",
    ...page(F.settings, "LeavePolicyPage", canAccessSettings),
  },
  {
    path: "settings/attendance",
    ...page(F.settings, "AttendanceRulesPage", canAccessSettings),
  },
  {
    path: "settings/hr-policy",
    ...page(F.settings, "HrPolicyPage", canAccessSettings),
  },
  {
    path: "settings/work-week",
    ...page(F.settings, "WorkWeekPage", canAccessSettings),
  },
  {
    path: "settings/exit-policy",
    ...page(F.settings, "ExitPolicyPage", canAccessSettings),
  },
  {
    path: "settings/payroll",
    ...page(F.settings, "PayrollSetupPage", canAccessSettings),
  },
  {
    path: "settings/recruitment-pipeline",
    ...page(F.settings, "PipelinePage", canAccessSettings),
  },
  {
    path: "settings/join-requests",
    ...page(F.settings, "JoinRequestsPage", canApproveJoinRequests),
  },
  {
    path: "subscription",
    ...page(F.subscription, "default", hasSubscriptionAccess),
  },
  { path: "help", ...page(F.help) },
  { path: "help/tours", ...page(F.tours) },
  // Tickets to the Praesto team; the console is Praesto staff only.
  { path: "support", ...page(F.support, "default", canUseSupport) },
  { path: "support/new", ...page(F.supportNew, "default", canRaiseSupport) },
  {
    path: "support/tickets/:ticketId",
    ...page(F.supportTicket, "default", canUseSupport),
  },
  {
    path: "platform/support",
    ...page(F.platformSupport, "default", isSupportAgent),
  },
  {
    path: "platform/support/tickets/:ticketId",
    ...page(F.platformTicket, "default", isSupportAgent),
  },
  { path: "ai-assistants", ...page(F.aiAssistants) },
  { path: "audit-logs", ...page(F.audit, "default", isOwnerOrAdmin) },
  { path: "*", element: <NotFound /> },
];

export const router = createBrowserRouter(
  [
    {
      element: <SessionRoot />,
      errorElement: <RouteError />,
      children: [
        {
          path: "/login",
          lazy: async () => {
            const { default: Login } =
              await import("@next/features/auth/Login");
            return {
              Component: () => (
                <LoginRoute>
                  <Login />
                </LoginRoute>
              ),
            };
          },
        },
        // An AI assistant's sign-in lands here (see the gateway's mcp/).
        // Signed in, but outside the app shell: a focused consent screen.
        {
          path: "/connect/authorize/:requestId",
          lazy: async () => {
            const { default: ConnectAuthorize } = await F.connectAuthorize();
            return {
              Component: () => (
                <RequireSession>
                  <ConnectAuthorize />
                </RequireSession>
              ),
            };
          },
        },
        // Organisation setup (signed in, no organisation yet) and public pages.
        { path: "/org-setup", ...page(F.orgSetup) },
        { path: "/careers/:slug", ...page(F.publicPages, "CareersPage") },
        {
          path: "/careers/:slug/apply/:id",
          ...page(F.publicPages, "JobApplicationPage"),
        },
        {
          path: "/privacy-policy",
          ...page(F.publicPages, "PrivacyPolicyPage"),
        },
        { path: "/terms-of-use", ...page(F.publicPages, "TermsPage") },
        { path: "/refund-policy", ...page(F.publicPages, "RefundPolicyPage") },
        // Public landing page, open to everyone (signed in or not).
        {
          path: "/",
          lazy: async () => {
            const { default: Landing } =
              await import("@next/features/landing/Landing");
            return { Component: Landing };
          },
        },
        {
          element: (
            <RequireSession>
              <AppShell />
            </RequireSession>
          ),
          errorElement: <RouteError />,
          children: appRoutes,
        },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true } },
);
