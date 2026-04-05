import { lazy } from "react";
import Dashboard from "@web/features/dashboard/Dashboard";
// Lazy load ALL other routes to prevent eager loading
const Profile = lazy(() => import("@web/features/profile/Profile"));
const Help = lazy(() => import("@web/features/layout/Help"));
const Calendar = lazy(() => import("@web/features/layout/Calendar"));
const Analytics = lazy(() => import("@web/features/analytics/Analytics"));

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

// Salary Management
const SalaryManagement = lazy(
  () => import("@web/features/salary/SalaryManagement"),
);
const EditSalaryStructure = lazy(
  () => import("@web/features/salary/EditSalaryStructure"),
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
const RuleManager = lazy(() => import("@web/features/rules/RuleManager"));

// Chat
const Chat = lazy(() => import("@web/features/chat/Chat"));

// Policy
const Policy = lazy(() => import("@web/features/policy/Policy"));

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
      path: "/rules",
      element: <RuleManager />,
      allowedModules: [],
      name: "Rule Management",
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
      element: <Analytics />,
      allowedModules: [],
      name: "Analytics",
      category: null,
    },
    {
      path: "/permissions/*",
      element: <Permissions />,
      allowedModules: [],
      name: "Permissions",
      category: null,
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
      path: "/salary-management",
      element: <SalaryManagement />,
      allowedModules: ["Salary Management"],
      name: "Salary Management",
      category: "HR & Management",
    },
    {
      path: "/salary-management/:username",
      element: <EditSalaryStructure />,
      allowedModules: ["Salary Management"],
      name: "Salary Management",
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
      element: <JobOpenings />,
      allowedModules: ["Job Openings"],
      name: "Job Openings",
      category: "HR & Management",
    },
    {
      path: "/view-job-opening/:_id",
      element: <ViewIndividualJob />,
      allowedModules: ["Job Openings"],
      name: "View Job",
      category: "HR & Management",
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
      path: "/profile/salary-slip",
      element: null,
      allowedModules: [],
      name: "Salary Slip",
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
    },
    {
      path: "/permissions/user-permissions",
      element: null,
      allowedModules: [],
      name: "User Permissions",
      category: "Permissions",
      spotlightOnly: true,
    },
    {
      path: "/permissions/teams",
      element: null,
      allowedModules: [],
      name: "Teams",
      category: "Permissions",
      spotlightOnly: true,
    },
    {
      path: "/analytics/workforce",
      element: null,
      allowedModules: [],
      name: "Workforce Analytics",
      category: "Analytics",
      spotlightOnly: true,
    },
    {
      path: "/analytics/leave-attendance",
      element: null,
      allowedModules: [],
      name: "Leave & Attendance Analytics",
      category: "Analytics",
      spotlightOnly: true,
    },
    {
      path: "/analytics/recruitment",
      element: null,
      allowedModules: [],
      name: "Recruitment Analytics",
      category: "Analytics",
      spotlightOnly: true,
    },
    {
      path: "/analytics/salary",
      element: null,
      allowedModules: [],
      name: "Salary Analytics",
      category: "Analytics",
      spotlightOnly: true,
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
      path: "/attendance/leave-application",
      element: null,
      allowedModules: [],
      name: "Leave Application",
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
      path: "/job-openings/new-job-opening",
      element: null,
      allowedModules: [],
      name: "New Job Opening",
      category: "Job Openings",
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
      path: "/hr-activities/add-new-activity",
      element: null,
      allowedModules: [],
      name: "Add New Activity",
      category: "HR Activities",
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
      path: "/resignation-process/resignation-form",
      element: null,
      allowedModules: [],
      name: "Resignation Form",
      category: "Resignation Process",
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
  ];
};

export default routesConfig;
