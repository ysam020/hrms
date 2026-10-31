import type { TourModuleDef } from "../types";
import { intro, page } from "./shared";

// Pay and company life: payroll, assets, resignations, announcements,
// policies and the helpdesk.

export const workTours: TourModuleDef[] = [
  {
    id: "payroll",
    label: "Payroll",
    summary: "Payslips, salary advances, tax declarations and payroll runs.",
    route: "/payroll/my-payslips",
    steps: [
      intro(
        "payroll",
        "Payroll",
        "Your payslips, advances and tax declaration — and, for HR, payroll runs, salary structures and declaration reviews.",
      ),
      {
        id: "payslips",
        target: "payslips-table",
        placement: "top",
        title: "My Payslips",
        content:
          "Your monthly salary statements and TDS worksheets, newest first, ready to download.",
      },
      {
        id: "advances",
        route: "/payroll/salary-advances",
        target: "advances-request",
        title: "Salary advances",
        content:
          "Request an advance on your salary; it goes for approval. Below, follow each request from pending to approved, repaying and repaid.",
      },
      page(
        "tax",
        "My Tax Declaration",
        "Declare the year’s investments and expenses under the Old Regime — rent, 80C, 80D, home loan and more — so payroll can lower your monthly TDS. Save a draft any time; submit it for HR to review.",
        "/payroll/my-tax-declaration",
      ),
      {
        id: "runs",
        route: "/payroll/payroll-runs",
        target: "runs-new",
        title: "Payroll runs",
        content:
          "A run calculates a month’s salaries from each employee’s structure and attendance. It’s reviewed and approved before anyone is paid.",
      },
      {
        id: "runs-history",
        route: "/payroll/payroll-runs",
        target: "runs-table",
        placement: "top",
        title: "Run history",
        content:
          "Each run and where it stands — draft, processing, approved, disbursing or disbursed. Filter by status above.",
      },
      {
        id: "salary",
        route: "/payroll/salary-management",
        target: "salary-table",
        placement: "top",
        title: "Salary structures",
        content:
          "Search for an employee and open their salary structure to see or change their pay components.",
      },
      {
        id: "tax-review",
        route: "/payroll/tax-declarations",
        target: "page-tabs",
        title: "Review declarations",
        content:
          "Employees’ tax declarations by financial year and status. Open one to verify it or send it back for revision.",
      },
    ],
  },
  {
    id: "assets",
    label: "Assets",
    summary: "Company equipment, who has it, and reported issues.",
    route: "/assets/inventory",
    steps: [
      intro(
        "assets",
        "Assets",
        "Laptops, phones and other equipment: what you have, and for asset managers the whole inventory.",
      ),
      {
        id: "add",
        target: "assets-add",
        timeout: 2500,
        title: "Add equipment",
        content:
          "Asset managers add items to the inventory, then assign them to people.",
      },
      {
        id: "table",
        target: "assets-table",
        placement: "top",
        title: "The inventory",
        content:
          "Filter by status or search. Choose an asset to see its details.",
      },
      {
        id: "issues",
        route: "/assets/issues",
        target: "issues-report",
        title: "Report a problem",
        content:
          "Something broken or missing? Report it here and follow its status on this page.",
      },
      page(
        "summary",
        "Asset Summary",
        "The inventory by status and by category.",
        "/assets/summary",
      ),
    ],
  },
  {
    id: "resignations",
    label: "Resignations",
    summary: "Resigning, notice periods, exit checklists and settlement.",
    route: "/resignation-process/view-resignations",
    steps: [
      intro(
        "resignations",
        "Resignations",
        "The exit process from resignation to full and final settlement.",
      ),
      {
        id: "table",
        target: "resign-table",
        placement: "top",
        title: "Resignations",
        content:
          "Open one to see its notice period, exit checklist and full and final settlement. Managers and HR approve or reject from there.",
      },
      {
        id: "submit",
        target: "resign-submit",
        timeout: 2500,
        title: "Resigning",
        content:
          "This is where you’d submit a resignation. You’re asked to confirm first, and you can withdraw it while it’s pending.",
      },
      page(
        "feedback",
        "Exit Feedback",
        "A short questionnaire for people leaving, about their time at the organisation.",
        "/resignation-process/exit-feedback",
      ),
      page(
        "insights",
        "Resignation Insights",
        "Top reasons, departments, exit feedback and upcoming departures.",
        "/resignation-process/insights",
      ),
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    summary: "Organisation news and HR activities.",
    route: "/hr-activities",
    steps: [
      intro(
        "announcements",
        "Announcements",
        "News and HR activities for everyone in the organisation.",
      ),
      {
        id: "filter",
        target: "page-tabs",
        title: "Current and past",
        content: "Switch between current announcements and past ones.",
      },
      {
        id: "new",
        target: "announce-new",
        timeout: 2500,
        title: "Post an announcement",
        content:
          "If you’re allowed to post, write one here; everyone sees it on this page.",
      },
    ],
  },
  {
    id: "policies",
    label: "Policies",
    summary: "The organisation’s handbook and rules.",
    route: "/policy",
    steps: [
      intro(
        "policies",
        "Policies",
        "Company policies published by HR, in one place.",
      ),
      {
        id: "list",
        target: "policies-list",
        placement: "right-start",
        timeout: 4000,
        title: "Read a policy",
        content: "Choose a policy from the list to read it.",
      },
      {
        id: "new",
        target: "policies-new",
        timeout: 2500,
        title: "Publish a policy",
        content: "HR writes and publishes new policies here.",
      },
    ],
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    summary: "Tickets to IT, HR, payroll and leave teams.",
    route: "/helpdesk",
    steps: [
      intro(
        "helpdesk",
        "Helpdesk",
        "Questions and requests for your organisation’s IT, HR, payroll and leave teams.",
      ),
      {
        id: "new",
        target: "helpdesk-new",
        title: "Raise a ticket",
        content:
          "Give it a title and category and describe what you need. Replies and status changes appear on the ticket.",
      },
      {
        id: "filters",
        target: "page-tabs",
        title: "Filter and search",
        content:
          "Filter by status — open, in progress, resolved or closed — or search.",
      },
      {
        id: "table",
        target: "helpdesk-table",
        placement: "top",
        title: "Your tickets",
        content:
          "Open a ticket to read the conversation and reply. Tickets past their target response time are marked SLA breached.",
      },
    ],
  },
];
