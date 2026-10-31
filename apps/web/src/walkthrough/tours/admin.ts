import type { TourModuleDef } from "../types";
import { intro, page } from "./shared";

// Administration — analytics, reports, permissions, settings, audit log,
// subscription — then AI assistants and Help & Support. Each step's
// route is checked against the navigation's own access rules, so people only
// see the parts their role opens. The Support Console step is Praesto staff
// only (isSupportAgent) and never reaches organisation users.

export const adminTours: TourModuleDef[] = [
  {
    id: "analytics",
    label: "Analytics",
    summary: "Workforce, leave, recruitment and salary trends.",
    route: "/analytics/workforce",
    steps: [
      intro(
        "analytics",
        "Analytics",
        "Organisation-wide charts in four sections: Workforce, Leave & Attendance, Recruitment and Salary.",
      ),
      {
        id: "body",
        target: "analytics-body",
        placement: "top",
        title: "Read the trends",
        content:
          "Each section loads its own charts from live data. Switch sections from the sidebar.",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    summary: "Build, save and export your own reports.",
    route: "/reports/report-builder",
    steps: [
      intro(
        "reports",
        "Reports",
        "Ask your own questions of your data, and keep the answers.",
      ),
      {
        id: "options",
        target: "reports-options",
        placement: "right-start",
        title: "Choose what to report on",
        content:
          "Pick the data, the columns and any filters. Nothing runs until you ask.",
      },
      {
        id: "run",
        target: "reports-run",
        title: "Run, export or save",
        content:
          "Run shows the results. Download them as CSV, or save the report to run again later with fresh data.",
      },
      {
        id: "results",
        target: "reports-results",
        placement: "left",
        title: "Results",
        content: "Results appear here.",
      },
      {
        id: "saved",
        route: "/reports/saved-reports",
        target: "saved-table",
        placement: "top",
        title: "Saved Reports",
        content: "Run a saved report for fresh data, or download it as CSV.",
      },
    ],
  },
  {
    id: "permissions",
    label: "Permissions",
    summary: "Roles, individual permissions and teams.",
    route: "/permissions/manage-roles",
    steps: [
      intro(
        "permissions",
        "Permissions",
        "Who can do what: roles, permissions for individual people, and teams.",
      ),
      {
        id: "roles",
        target: "roles-table",
        placement: "top",
        title: "Roles",
        content:
          "A role is a named set of permissions. Choose one to see its permissions and the people who have it.",
      },
      {
        id: "roles-new",
        target: "roles-new",
        title: "Create a role",
        content:
          "Name the role first, then choose its permissions. Changes apply to everyone with the role.",
      },
      {
        id: "users",
        route: "/permissions/user-permissions",
        target: "userperm-people",
        placement: "right-start",
        title: "One person’s access",
        content:
          "Choose a person to see their roles and individual permissions, and change what they can do.",
      },
      {
        id: "teams",
        route: "/permissions/teams",
        target: "teams-table",
        placement: "top",
        title: "Teams",
        content:
          "Groups of people with a team leader. Leaders see their team’s attendance and requests on Today, and teams build the organisation chart.",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    summary: "Company details and the policies that run Praesto.",
    route: "/settings/company",
    steps: [
      intro(
        "settings",
        "Settings",
        "Your organisation’s profile and the rules Praesto applies to everyone.",
      ),
      {
        id: "company",
        target: "company-hero",
        timeout: 4000,
        title: "Company Info",
        content:
          "Name, logo, contact and statutory details. CIN and the signatory appear on offer letters.",
      },
      page(
        "leave",
        "Leave Policy",
        "Statutory entitlements and your leave types.",
        "/settings/leave",
      ),
      {
        id: "save",
        route: "/settings/leave",
        target: "settings-save",
        timeout: 3000,
        title: "Nothing changes until you save",
        content:
          "Policy pages keep your edits as a draft. Saving asks when the change should take effect, and earlier versions stay on record.",
      },
      page(
        "attendance",
        "Attendance Rules",
        "The working day, work from home, and geofencing for punches.",
        "/settings/attendance",
      ),
      page(
        "hr",
        "HR Policy",
        "Employment rules that apply across the organisation.",
        "/settings/hr-policy",
      ),
      page(
        "workweek",
        "Work Week",
        "Which days are working days.",
        "/settings/work-week",
      ),
      page(
        "exit",
        "Exit Policy",
        "Notice periods and the exit checklist used for resignations.",
        "/settings/exit-policy",
      ),
      page(
        "payroll",
        "Payroll Setup",
        "Salary components, professional tax, pay cycles and income tax slabs.",
        "/settings/payroll",
      ),
      page(
        "pipeline",
        "Recruitment Pipeline",
        "The interview rounds an opening goes through, who owns each, and whether it includes background verification.",
        "/settings/recruitment-pipeline",
      ),
      {
        id: "join",
        route: "/settings/join-requests",
        target: "join-table",
        placement: "top",
        title: "Join Requests",
        content:
          "People who signed up and asked to join your organisation. Approving makes them an employee; rejecting declines the request.",
      },
    ],
  },
  {
    id: "audit",
    label: "Audit Log",
    summary: "Who changed what, and when.",
    route: "/audit-logs",
    steps: [
      intro(
        "audit",
        "Audit Log",
        "A record of changes made in your organisation. Secrets are never shown.",
      ),
      {
        id: "filters",
        target: "page-tabs",
        title: "Narrow it down",
        content:
          "Filter by time range, area and person, or search the activity.",
      },
      {
        id: "table",
        target: "audit-table",
        placement: "top",
        title: "Inspect an entry",
        content: "Select an entry to see exactly which fields changed.",
      },
    ],
  },
  {
    id: "subscription",
    label: "Subscription",
    summary: "Your plan and billing.",
    route: "/subscription",
    steps: [
      intro("subscription", "Subscription", "Your Praesto plan and billing."),
      {
        id: "current",
        target: "subscription-current",
        timeout: 4000,
        title: "Your current plan",
        content:
          "Your plan, how it’s billed and what it costs for your active employees, plus any change scheduled to take effect.",
      },
      {
        id: "change",
        target: "subscription-change",
        timeout: 3000,
        title: "Change plan",
        content:
          "Choose another plan and billing period. Payment is confirmed at checkout before anything changes.",
      },
    ],
  },
  {
    id: "ai-assistants",
    label: "AI Assistants",
    summary: "Use Praesto from the AI assistant you already use.",
    route: "/ai-assistants",
    steps: [
      intro(
        "ai-assistants",
        "AI Assistants",
        "Connect an AI assistant to ask about your leave, approvals, calendar, tickets and more. It reads only what you could see yourself.",
      ),
      {
        id: "setup",
        target: "ai-setup",
        title: "Set up your assistant",
        content:
          "Pick your assistant for step-by-step instructions. Connected assistants are listed on this page, and you can disconnect one at any time.",
      },
    ],
  },
  {
    id: "help",
    label: "Help & Support",
    summary: "Support tickets, keyboard shortcuts and these tours.",
    route: "/help",
    steps: [
      intro(
        "help",
        "Help & Support",
        "Getting help: tickets to the Praesto team, keyboard shortcuts, and these tours.",
      ),
      {
        id: "shortcuts",
        target: "help-shortcuts",
        placement: "top",
        title: "Keyboard shortcuts",
        content: "Get around faster with the keys listed here.",
      },
      {
        id: "support",
        route: "/support",
        target: ["support-new", "page-title"],
        title: "Contact Praesto",
        content:
          "Report a problem, a billing issue or an idea to the Praesto team, and follow the conversation on the ticket.",
      },
      {
        id: "support-list",
        route: "/support",
        target: "support-table",
        placement: "top",
        title: "Your tickets",
        content: "Your tickets and their status. Search by number or subject.",
      },
      {
        id: "console",
        route: "/platform/support",
        target: "console-table",
        placement: "top",
        title: "Support Console",
        content:
          "For the Praesto team: tickets from every organisation, by assignee.",
      },
      {
        id: "tours",
        route: "/help/tours",
        target: "tours-list",
        placement: "top",
        title: "Come back any time",
        content:
          "Restart the full tour, or take the tour of a single area, from Product Tours.",
      },
    ],
  },
];
