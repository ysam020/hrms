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

const routesConfig = () => {
  return [
    {
      path: "/profile/*",
      element: <Profile />,
      allowedModules: [],
      name: "Profile",
      category: null,
    },
    {
      path: "/",
      element: <Dashboard />,
      allowedModules: [],
      name: "Dashboard",
      category: null,
    },
    {
      path: "/calendar",
      element: <Calendar />,
      allowedModules: [],
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
      allowedModules: [],
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
      allowedModules: [],
      name: "Permissions",
      category: null,
      checkAccess: canManagePermissions,
    },
    {
      path: "/organization-tree",
      element: <OrganizationTree />,
      allowedModules: [],
      name: "OrganizationTree",
      category: null,
    },
    {
      path: "/help",
      element: <Help />,
      allowedModules: [],
      name: "Help",
      category: null,
    },
    {
      path: "/chat",
      element: <Chat />,
      allowedModules: [],
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
      allowedModules: [],
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
      allowedModules: [],
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
      allowedModules: [],
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
      allowedModules: [],
      name: "Organisation Settings",
      category: null,
      checkAccess: canAccessSettings,
    },
    {
      path: "/policy/*",
      element: <Policy />,
      allowedModules: [],
      name: "Policy",
      category: null,
    },
    {
      path: "/hr-activities/*",
      element: <HrActivities />,
      allowedModules: ["HR Activities"],
      name: "HR Activities",
      category: "HR & Management",
    },
    {
      path: "/kyc/*",
      element: <EmployeeKYC />,
      allowedModules: ["Basic KYC Details"],
      name: "Basic KYC Details",
      category: "HR & Management",
    },
    {
      path: "/view-kyc/:username",
      element: <ViewIndividualKyc />,
      allowedModules: ["Basic KYC Details"],
      name: "View KYC Details",
      category: "HR & Management",
    },
    {
      path: "/edit-kyc/:username",
      element: <EditEmployeeKyc />,
      allowedModules: ["Basic KYC Details"],
      name: "Edit KYC Details",
      category: "HR & Management",
    },
    // Employee Management: explicit tab routes take priority over /:username
    {
      path: "/employee-management",
      element: <EmployeeManagement />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/employee-management/employee-list",
      element: <EmployeeManagement />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/employee-management/insights",
      element: <EmployeeManagement />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/employee-management/:username",
      element: <ViewDetails />,
      allowedModules: ["Employee Management"],
      name: "Employee Management",
      category: "HR & Management",
    },
    {
      path: "/holidays",
      element: <Holidays />,
      allowedModules: ["Holidays"],
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
      allowedModules: ["Job Openings"],
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
      allowedModules: ["Job Openings"],
      name: "View Job",
      category: "HR & Management",
      checkAccess: canAccessJobOpenings,
    },
    {
      path: "/attendance/*",
      element: <Attendance />,
      allowedModules: ["Attendance & Leaves"],
      name: "Attendance & Leaves",
      category: "HR & Management",
    },
    {
      path: "/resignation-process/*",
      element: <Resignation />,
      allowedModules: ["Resignation Process"],
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
      allowedModules: ["Salary Management"],
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
      allowedModules: ["Payroll Management"],
      name: "Review Tax Declaration",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    {
      path: "/payroll/*",
      element: <Payroll />,
      allowedModules: ["Payroll Management"],
      name: "Payroll Management",
      category: "HR & Management",
    },
    {
      path: "/performance-reviews/*",
      element: <PerformanceReview />,
      allowedModules: ["Performance Review"],
      name: "Performance Review",
      category: "HR & Management",
    },
    {
      path: "/assets/*",
      element: <AssetManagement />,
      allowedModules: ["Asset Management"],
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
      allowedModules: ["WFH Requests"],
      name: "WFH Requests",
      category: "HR & Management",
      checkAccess: canAccessWfh,
    },
    {
      path: "/approvals",
      element: <ApprovalsInbox />,
      allowedModules: [],
      name: "Pending Approvals",
      category: "HR & Management",
    },
    {
      path: "/helpdesk",
      element: <Helpdesk />,
      allowedModules: [],
      name: "HR Helpdesk",
      category: "HR & Management",
    },
    {
      path: "/helpdesk/:ticketId",
      element: <TicketDetail />,
      allowedModules: [],
      name: "Ticket Detail",
      category: "HR & Management",
    },
    {
      path: "/webhooks/*",
      element: <Webhooks />,
      allowedModules: [],
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
      allowedModules: [],
      name: "Reports",
      category: "HR & Management",
      checkAccess: isHrOrAbove,
    },
    // Spotlight-only tab routes (not rendered as Routes, only appear in search)
    {
      path: "/profile/basic-info",
      element: null,
      allowedModules: [],
      name: "Basic Info",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/logged-in-devices",
      element: null,
      allowedModules: [],
      name: "Logged in Devices",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/two-factor-auth",
      element: null,
      allowedModules: [],
      name: "Two Factor Authentication",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/push-notifications",
      element: null,
      allowedModules: [],
      name: "Push Notifications",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/reset-password",
      element: null,
      allowedModules: [],
      name: "Reset Password",
      category: "Profile",
      spotlightOnly: true,
    },
    {
      path: "/profile/backup-codes",
      element: null,
      allowedModules: [],
      name: "Backup Codes",
      category: "Profile",
      spotlightOnly: true,
    },

    {
      path: "/permissions/manage-roles",
      element: null,
      allowedModules: [],
      name: "Manage Roles",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/permissions/user-permissions",
      element: null,
      allowedModules: [],
      name: "User Permissions",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/permissions/teams",
      element: null,
      allowedModules: [],
      name: "Teams",
      category: "Permissions",
      spotlightOnly: true,
      checkAccess: canManagePermissions,
    },
    {
      path: "/analytics/workforce",
      element: null,
      allowedModules: [],
      name: "Workforce Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/leave-attendance",
      element: null,
      allowedModules: [],
      name: "Leave & Attendance Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/recruitment",
      element: null,
      allowedModules: [],
      name: "Recruitment Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/analytics/salary",
      element: null,
      allowedModules: [],
      name: "Salary Analytics",
      category: "Analytics",
      spotlightOnly: true,
      checkAccess: canViewAnalytics,
    },
    {
      path: "/attendance/view-all-attendances",
      element: null,
      allowedModules: [],
      name: "View All Attendances",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/view-leave-applications",
      element: null,
      allowedModules: [],
      name: "View Leave Applications",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/attendance-correction",
      element: null,
      allowedModules: [],
      name: "Attendance Correction",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/attendance/insights",
      element: null,
      allowedModules: [],
      name: "Attendance Insights",
      category: "Attendance & Leaves",
      spotlightOnly: true,
    },
    {
      path: "/employee-management/employee-list",
      element: null,
      allowedModules: [],
      name: "Employee List",
      category: "Employee Management",
      spotlightOnly: true,
    },
    {
      path: "/employee-management/insights",
      element: null,
      allowedModules: [],
      name: "Employee Insights",
      category: "Employee Management",
      spotlightOnly: true,
    },
    {
      path: "/job-openings/view-job-openings",
      element: null,
      allowedModules: [],
      name: "View Job Openings",
      category: "Job Openings",
      spotlightOnly: true,
    },
    {
      path: "/job-openings/insights",
      element: null,
      allowedModules: [],
      name: "Job Openings Insights",
      category: "Job Openings",
      spotlightOnly: true,
    },
    {
      path: "/hr-activities/view-activities",
      element: null,
      allowedModules: [],
      name: "View Activities",
      category: "HR Activities",
      spotlightOnly: true,
    },
    {
      path: "/kyc/view-employee-kycs",
      element: null,
      allowedModules: [],
      name: "View Employee KYCs",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/kyc/complete-kyc",
      element: null,
      allowedModules: [],
      name: "Complete KYC",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/kyc/insights",
      element: null,
      allowedModules: [],
      name: "KYC Insights",
      category: "KYC",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/view-resignations",
      element: null,
      allowedModules: [],
      name: "View Resignations",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/exit-feedback",
      element: null,
      allowedModules: [],
      name: "Exit Feedback",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    {
      path: "/resignation-process/insights",
      element: null,
      allowedModules: [],
      name: "Resignation Insights",
      category: "Resignation Process",
      spotlightOnly: true,
    },
    // Payroll spotlight entries
    {
      path: "/payroll/payroll-runs",
      element: null,
      allowedModules: [],
      name: "Payroll Runs",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/salary-management",
      element: null,
      allowedModules: [],
      name: "Salary Management",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/salary-advances",
      element: null,
      allowedModules: [],
      name: "Salary Advances",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    {
      path: "/payroll/my-payslips",
      element: null,
      allowedModules: [],
      name: "My Payslips",
      category: "Payroll Management",
      spotlightOnly: true,
    },
    // Performance Review spotlight entries
    {
      path: "/performance-reviews/review-cycles",
      element: null,
      allowedModules: [],
      name: "Review Cycles",
      category: "Performance Review",
      spotlightOnly: true,
    },
    {
      path: "/performance-reviews/reviews",
      element: null,
      allowedModules: [],
      name: "Reviews",
      category: "Performance Review",
      spotlightOnly: true,
    },
    // Assets spotlight entries
    {
      path: "/assets/inventory",
      element: null,
      allowedModules: [],
      name: "Asset Inventory",
      category: "Asset Management",
      spotlightOnly: true,
    },
    {
      path: "/assets/summary",
      element: null,
      allowedModules: [],
      name: "Asset Summary",
      category: "Asset Management",
      spotlightOnly: true,
    },
    // WFH spotlight entries
    {
      path: "/wfh/requests",
      element: null,
      allowedModules: [],
      name: "WFH Requests",
      category: "WFH",
      spotlightOnly: true,
      checkAccess: canAccessWfh,
    },
    {
      path: "/wfh/calendar",
      element: null,
      allowedModules: [],
      name: "WFH Calendar",
      category: "WFH",
      spotlightOnly: true,
      checkAccess: canAccessWfh,
    },
    // Helpdesk spotlight entries
    {
      path: "/helpdesk/all-tickets",
      element: null,
      allowedModules: [],
      name: "All Tickets",
      category: "HR Helpdesk",
      spotlightOnly: true,
    },
    // Webhooks spotlight entries
    {
      path: "/webhooks/endpoints",
      element: null,
      allowedModules: [],
      name: "Webhook Endpoints",
      category: "Webhooks",
      spotlightOnly: true,
    },
    {
      path: "/webhooks/delivery-log",
      element: null,
      allowedModules: [],
      name: "Delivery Log",
      category: "Webhooks",
      spotlightOnly: true,
    },
    // Reports spotlight entries
    {
      path: "/reports/report-builder",
      element: null,
      allowedModules: [],
      name: "Report Builder",
      category: "Reports",
      spotlightOnly: true,
      checkAccess: isHrOrAbove,
    },
    {
      path: "/reports/saved-reports",
      element: null,
      allowedModules: [],
      name: "Saved Reports",
      category: "Reports",
      spotlightOnly: true,
      checkAccess: isHrOrAbove,
    },
  ];
};

export default routesConfig;
