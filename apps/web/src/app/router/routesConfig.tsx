import { lazy } from "react";
import Dashboard from "@web/features/dashboard/Dashboard";
import RequireAccess from "./RequireAccess";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import {
  canAccessSettings,
  canManagePermissions,
  canViewAnalytics,
  canAccessJobOpenings,
  isHrOrAbove,
  canManageSalary,
} from "@web/shared/utils/permissions/navAccess";
// Lazy load ALL other routes to prevent eager loading
const Profile = lazy(() => import("@web/features/profile/Profile"));
const Help = lazy(() => import("@web/features/layout/Help"));
const Calendar = lazy(() => import("@web/features/layout/Calendar"));
const Analytics = lazy(() => import("@web/features/analytics/Analytics"));

// New feature modules
const Payroll = lazy(() => import("@web/features/payroll/Payroll"));
const PerformanceReview = lazy(
  () => import("@web/features/performance-review/PerformanceReview"),
);
const AssetManagement = lazy(
  () => import("@web/features/assets/AssetManagement"),
);
const WFH = lazy(() => import("@web/features/wfh/WFH"));
const Helpdesk = lazy(() => import("@web/features/helpdesk/Helpdesk"));
const TicketDetail = lazy(() => import("@web/features/helpdesk/TicketDetail"));
const Webhooks = lazy(() => import("@web/features/webhooks/Webhooks"));
const Reports = lazy(() => import("@web/features/reports/Reports"));
const ApprovalsInbox = lazy(
  () => import("@web/features/approvals/ApprovalsInbox"),
);

const Permissions = lazy(
  () => import("@web/features/layout/permissions/Permissions"),
);
const OrganizationTree = lazy(
  () => import("@web/features/layout/OrganisationTree"),
);

// Employee KYC
const EmployeeKYC = lazy(
  () => import("@web/features/employee-kyc/EmployeeKYC"),
);
const ViewIndividualKyc = lazy(
  () => import("@web/features/employee-kyc/ViewIndividualKyc"),
);
const EditEmployeeKyc = lazy(
  () => import("@web/features/employee-kyc/EditEmployeeKyc"),
);

// Employee Management
const EmployeeManagement = lazy(
  () => import("@web/features/employee-management/EmployeeManagement"),
);
const ViewDetails = lazy(
  () => import("@web/features/employee-management/ViewDetails"),
);

// Salary Management (detail view only — the list is a tab inside Payroll)
const EditSalaryStructure = lazy(
  () => import("@web/features/salary/EditSalaryStructure"),
);

// Tax Declaration (detail view only — the review list is a tab inside Payroll)
const ViewIndividualTaxDeclaration = lazy(
  () =>
    import("@web/features/payroll/tax-declaration/ViewIndividualTaxDeclaration"),
);

// Holidays
const Holidays = lazy(() => import("@web/features/holidays/Holidays"));

// Job Openings
const JobOpenings = lazy(
  () => import("@web/features/job-openings/JobOpenings"),
);
const ViewIndividualJob = lazy(
  () => import("@web/features/job-openings/ViewIndividualJob"),
);

// Announcements
const HrActivities = lazy(
  () => import("@web/features/hr-activities/HrActivities"),
);

// Attendance
const Attendance = lazy(() => import("@web/features/attendance/Attendance"));

// Resignation
const Resignation = lazy(() => import("@web/features/resignation/Resignation"));

// Rules

// Chat
const Chat = lazy(() => import("@web/features/chat/Chat"));

// Policy
const Policy = lazy(() => import("@web/features/policy/Policy"));

// Subscription
const Subscription = lazy(
  () => import("@web/features/subscription/Subscription"),
);

// Company Info
const CompanyInfo = lazy(
  () => import("@web/features/company-info/CompanyInfo"),
);

// Organisation Settings
const OrgSettings = lazy(() => import("@web/features/settings/OrgSettings"));

// Unified Settings (Company Info + Organisation Settings tabs)
const Settings = lazy(() => import("@web/features/settings/Settings"));

const canAccessWfh = (u) => Boolean(u?.wfhEnabled);

// moduleTags (formerly "allowedModules") is NOT an access-control mechanism —
// it previously read that way to anyone skimming this file, which is exactly
// how a new sensitive route added by copying an existing entry could ship
// with zero client-side gating. It only decides whether HomePage.tsx wraps
// the route in Suspense/ErrorBoundary; it is never checked against the
// caller's role or permissions. Real gating is `checkAccess`/<RequireAccess>
// below, applied per-route.
//
// Routes below WITHOUT a checkAccess (holidays, kyc, attendance, payroll
// base, performance-reviews, assets, helpdesk, resignation-process,
// hr-activities, view/edit-kyc) are deliberately left open to every
// authenticated user, not overlooked: each one mixes a genuine self-service
// tab (apply for leave, request an advance, view your own payslip/KYC/
// assigned assets, raise a helpdesk ticket, file your own resignation) with
// HR-only tabs that already gate themselves internally (isHrOrAbove/
// hasPermission — see Insights/Summary/Review Cycles/Tax Declarations tabs
// inside these same components). Gating the whole route would block that
// self-service tab for every regular employee, which is a regression, not
// a fix. The server independently re-verifies this: every list/detail
// endpoint these pages call scopes non-privileged callers to their own
// data (see e.g. viewAllKycs, getAllAttendances, listAssets, listTickets,
// getUserData/getEmployeeDetails in apps/api-gateway) — client-side gating
// here would be pure UI redundancy, not a real security boundary, and
// verified case-by-case rather than assumed.
//
// employee-management is the one route in this file that DID get gated
// (isHrOrAbove, below): unlike the routes above, it has no self-service
// tab distinct from the separate /profile route, so there was no
// legitimate reason for a regular employee to land there at all.
const routesConfig = () => {
  return [
    {
      path: "/profile/*",
      element: <Profile />,
      moduleTags: [],
      name: "Profile",
      category: null,
    },
    {
      path: "/",
      element: <Dashboard />,
      moduleTags: [],
      name: "Dashboard",
      category: null,
    },
    {
      path: "/calendar",
      element: <Calendar />,
      moduleTags: [],
      name: "Calendar",
      category: null,
    },
    {
      path: "/analytics/*",
      element: (
        <RequireAccess check={canViewAnalytics}>
          <Analytics />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Analytics",
      category: null,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/permissions/*",
      element: (
        <RequireAccess check={canManagePermissions}>
          <Permissions />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Permissions",
      category: null,
      checkAccess: canManagePermissions,
    },
    {
      path: "/organization-tree",
      element: <OrganizationTree />,
      moduleTags: [],
      name: "OrganizationTree",
      category: null,
    },
    {
      path: "/help",
      element: <Help />,
      moduleTags: [],
      name: "Help",
      category: null,
    },
    {
      path: "/chat",
      element: <Chat />,
      moduleTags: [],
      name: "Chat",
      category: null,
    },
    {
      path: "/subscription",
      element: (
        <RequireAccess check={hasSubscriptionAccess}>
          <Subscription />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Subscription",
      category: null,
      checkAccess: hasSubscriptionAccess,
    },
    {
      path: "/settings",
      element: (
        <RequireAccess check={canAccessSettings}>
          <Settings />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Settings",
      category: null,
      checkAccess: canAccessSettings,
    },
    // Legacy routes — kept for deep-link compatibility
    {
      path: "/company-info",
      element: (
        <RequireAccess check={canAccessSettings}>
          <CompanyInfo />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Company Information",
      category: null,
      checkAccess: canAccessSettings,
    },
    {
      path: "/org-settings",
      element: (
        <RequireAccess check={canAccessSettings}>
          <OrgSettings />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Organisation Settings",
      category: null,
      checkAccess: canAccessSettings,
    },
    {
      path: "/policy/*",
      element: <Policy />,
      moduleTags: [],
      name: "Policy",
      category: null,
    },
    {
      path: "/hr-activities/*",
      element: <HrActivities />,
      moduleTags: ["HR Activities"],
      name: "HR Activities",
      category: "HR & Management",
    },
    {
      path: "/kyc/*",
      element: <EmployeeKYC />,
      moduleTags: ["Basic KYC Details"],
      name: "Basic KYC Details",
      category: "HR & Management",
    },
    {
      path: "/view-kyc/:username",
      element: <ViewIndividualKyc />,
      moduleTags: ["Basic KYC Details"],
      name: "View KYC Details",
      category: "HR & Management",
    },
    {
      path: "/edit-kyc/:username",
      element: <EditEmployeeKyc />,
      moduleTags: ["Basic KYC Details"],
      name: "Edit KYC Details",
      category: "HR & Management",
    },
    // Employee Management: explicit tab routes take priority over /:username
    //
    // Gated to isHrOrAbove — unlike Payroll/Attendance/Assets/etc. below,
    // this page has no genuine self-service tab (self-profile already has
    // its own dedicated /profile route); a regular employee landing here
    // previously just saw a confusing "list of one" (themselves, via the
    // server's own defense-in-depth scoping) rather than any real feature.
    // /employee-management/:username (ViewDetails) is deliberately left
    // ungated below — it's still safe (the server scopes non-owner/non-HR
    // callers to stripped fields) and may be the only place some employees
    // can see their own salary/PF/bank details, so gating it risked
    // removing real functionality rather than just cosmetic access.
    {
      path: "/employee-management",
      element: (
        <RequireAccess check={isHrOrAbove}>
          <EmployeeManagement />
        </RequireAccess>
      ),
      moduleTags: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    {
      path: "/employee-management/employee-list",
      element: (
        <RequireAccess check={isHrOrAbove}>
          <EmployeeManagement />
        </RequireAccess>
      ),
      moduleTags: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    {
      path: "/employee-management/insights",
      element: (
        <RequireAccess check={isHrOrAbove}>
          <EmployeeManagement />
        </RequireAccess>
      ),
      moduleTags: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    {
      path: "/employee-management/:username",
      element: <ViewDetails />,
      moduleTags: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/holidays",
      element: <Holidays />,
      moduleTags: ["Holidays"],
      name: "Holidays",
      category: "HR & Management",
    },
    {
      path: "/job-openings/*",
      element: (
        <RequireAccess check={canAccessJobOpenings}>
          <JobOpenings />
        </RequireAccess>
      ),
      moduleTags: ["Job Openings"],
      name: "Job Openings",
      category: "HR & Management",
      checkAccess: canAccessJobOpenings,
    },
    {
      path: "/view-job-opening/:_id",
      element: (
        <RequireAccess check={canAccessJobOpenings}>
          <ViewIndividualJob />
        </RequireAccess>
      ),
      moduleTags: ["Job Openings"],
      name: "View Job",
      category: "HR & Management",
      checkAccess: canAccessJobOpenings,
    },
    {
      path: "/attendance/*",
      element: <Attendance />,
      moduleTags: ["Attendance & Leaves"],
      name: "Attendance & Leaves",
      category: "HR & Management",
    },
    {
      path: "/resignation-process/*",
      element: <Resignation />,
      moduleTags: ["Resignation Process"],
      name: "Resignation Process",
      category: "HR & Management",
    },
    // ── New feature modules ──────────────────────────────────────────────────
    // Detail route must sit BEFORE the /payroll/* wildcard so React Router's
    // specificity scoring picks it over the wildcard when navigating to a userId.
    {
      path: "/payroll/salary-management/:userId",
      element: (
        <RequireAccess check={canManageSalary}>
          <EditSalaryStructure />
        </RequireAccess>
      ),
      moduleTags: ["Salary Management"],
      name: "Edit Salary Structure",
      category: "HR & Management",
      checkAccess: canManageSalary,
    },
    {
      path: "/payroll/tax-declarations/:userId",
      element: (
        <RequireAccess check={isHrOrAbove}>
          <ViewIndividualTaxDeclaration />
        </RequireAccess>
      ),
      moduleTags: ["Payroll Management"],
      name: "Review Tax Declaration",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    {
      path: "/payroll/*",
      element: <Payroll />,
      moduleTags: ["Payroll Management"],
      name: "Payroll Management",
      category: "HR & Management",
    },
    {
      path: "/performance-reviews/*",
      element: <PerformanceReview />,
      moduleTags: ["Performance Review"],
      name: "Performance Review",
      category: "HR & Management",
    },
    {
      path: "/assets/*",
      element: <AssetManagement />,
      moduleTags: ["Asset Management"],
      name: "Asset Management",
      category: "HR & Management",
    },
    {
      path: "/wfh/*",
      element: (
        <RequireAccess check={canAccessWfh}>
          <WFH />
        </RequireAccess>
      ),
      moduleTags: ["WFH Requests"],
      name: "WFH Requests",
      category: "HR & Management",
      checkAccess: canAccessWfh,
    },
    {
      path: "/approvals",
      element: <ApprovalsInbox />,
      moduleTags: [],
      name: "Pending Approvals",
      category: "HR & Management",
    },
    {
      path: "/helpdesk",
      element: <Helpdesk />,
      moduleTags: [],
      name: "HR Helpdesk",
      category: "HR & Management",
    },
    {
      path: "/helpdesk/:ticketId",
      element: <TicketDetail />,
      moduleTags: [],
      name: "Ticket Detail",
      category: "HR & Management",
    },
    {
      path: "/webhooks/*",
      element: <Webhooks />,
      moduleTags: [],
      name: "Webhooks",
      category: null,
    },
    {
      path: "/reports/*",
      element: (
        <RequireAccess check={isHrOrAbove}>
          <Reports />
        </RequireAccess>
      ),
      moduleTags: [],
      name: "Reports",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    // Spotlight-only tab routes (not rendered as Routes, only appear in search)
    {
      path: "/profile/basic-info",
      element: null,
      moduleTags: [],
      name: "Basic Info",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/logged-in-devices",
      element: null,
      moduleTags: [],
      name: "Logged in Devices",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/two-factor-auth",
      element: null,
      moduleTags: [],
      name: "Two Factor Authentication",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/push-notifications",
      element: null,
      moduleTags: [],
      name: "Push Notifications",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/reset-password",
      element: null,
      moduleTags: [],
      name: "Reset Password",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/backup-codes",
      element: null,
      moduleTags: [],
      name: "Backup Codes",
      category: "Profile",
      spotlightOnly: true,
    },

    {
      path: "/permissions/manage-roles",
      element: null,
      moduleTags: [],
      name: "Manage Roles",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/permissions/user-permissions",
      element: null,
      moduleTags: [],
      name: "User Permissions",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/permissions/teams",
      element: null,
      moduleTags: [],
      name: "Teams",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/analytics/workforce",
      element: null,
      moduleTags: [],
      name: "Workforce Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/leave-attendance",
      element: null,
      moduleTags: [],
      name: "Leave & Attendance Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/recruitment",
      element: null,
      moduleTags: [],
      name: "Recruitment Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/salary",
      element: null,
      moduleTags: [],
      name: "Salary Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/attendance/view-all-attendances",
      element: null,
      moduleTags: [],
      name: "View All Attendances",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/view-leave-applications",
      element: null,
      moduleTags: [],
      name: "View Leave Applications",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/attendance-correction",
      element: null,
      moduleTags: [],
      name: "Attendance Correction",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/insights",
      element: null,
      moduleTags: [],
      name: "Attendance Insights",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/employee-management/employee-list",
      element: null,
      moduleTags: [],
      name: "Employee List",
      category: "Employee Management",
      spotlightOnly: true,
    },
    {
      path: "/employee-management/insights",
      element: null,
      moduleTags: [],
      name: "Employee Insights",
      category: "Employee Management",
      spotlightOnly: true,
    },
    {
      path: "/job-openings/view-job-openings",
      element: null,
      moduleTags: [],
      name: "View Job Openings",
      category: "Job Openings",
      spotlightOnly: true,
    },
    {
      path: "/job-openings/insights",
      element: null,
      moduleTags: [],
      name: "Job Openings Insights",
      category: "Job Openings",
      spotlightOnly: true,
    },
    {
      path: "/hr-activities/view-activities",
      element: null,
      moduleTags: [],
      name: "View Activities",
      category: "HR Activities",
      spotlightOnly: true,
    },
    {
      path: "/kyc/view-employee-kycs",
      element: null,
      moduleTags: [],
      name: "View Employee KYCs",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/kyc/complete-kyc",
      element: null,
      moduleTags: [],
      name: "Complete KYC",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/kyc/insights",
      element: null,
      moduleTags: [],
      name: "KYC Insights",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/view-resignations",
      element: null,
      moduleTags: [],
      name: "View Resignations",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/exit-feedback",
      element: null,
      moduleTags: [],
      name: "Exit Feedback",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/insights",
      element: null,
      moduleTags: [],
      name: "Resignation Insights",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    // Payroll spotlight entries
    {
      path: "/payroll/payroll-runs",
      element: null,
      moduleTags: [],
      name: "Payroll Runs",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/salary-management",
      element: null,
      moduleTags: [],
      name: "Salary Management",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/salary-advances",
      element: null,
      moduleTags: [],
      name: "Salary Advances",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/my-payslips",
      element: null,
      moduleTags: [],
      name: "My Payslips",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    // Performance Review spotlight entries
    {
      path: "/performance-reviews/review-cycles",
      element: null,
      moduleTags: [],
      name: "Review Cycles",
      category: "Performance Review",
      spotlightOnly: true,
    },
    {
      path: "/performance-reviews/reviews",
      element: null,
      moduleTags: [],
      name: "Reviews",
      category: "Performance Review",
      spotlightOnly: true,
    },
    // Assets spotlight entries
    {
      path: "/assets/inventory",
      element: null,
      moduleTags: [],
      name: "Asset Inventory",
      category: "Asset Management",
      spotlightOnly: true,
    },
    {
      path: "/assets/summary",
      element: null,
      moduleTags: [],
      name: "Asset Summary",
      category: "Asset Management",
      spotlightOnly: true,
    },
    // WFH spotlight entries
    {
      path: "/wfh/requests",
      element: null,
      moduleTags: [],
      name: "WFH Requests",
      category: "WFH",
      spotlightOnly: true,
      checkAccess: canAccessWfh,
    },
    // Helpdesk spotlight entries
    {
      path: "/helpdesk/all-tickets",
      element: null,
      moduleTags: [],
      name: "All Tickets",
      category: "HR Helpdesk",
      spotlightOnly: true,
    },
    // Webhooks spotlight entries
    {
      path: "/webhooks/endpoints",
      element: null,
      moduleTags: [],
      name: "Webhook Endpoints",
      category: "Webhooks",
      spotlightOnly: true,
    },
    {
      path: "/webhooks/delivery-log",
      element: null,
      moduleTags: [],
      name: "Delivery Log",
      category: "Webhooks",
      spotlightOnly: true,
    },
    // Reports spotlight entries
    {
      path: "/reports/report-builder",
      element: null,
      moduleTags: [],
      name: "Report Builder",
      category: "Reports",
      spotlightOnly: true,
      checkAccess: isHrOrAbove,
    },
    {
      path: "/reports/saved-reports",
      element: null,
      moduleTags: [],
      name: "Saved Reports",
      category: "Reports",
      spotlightOnly: true,
      checkAccess: isHrOrAbove,
    },
  ];
};

export default routesConfig;
