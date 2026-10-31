import type { TourModuleDef } from "../types";
import { intro, page } from "./shared";

// Time: attendance and corrections, leave, work from home, holidays.

export const timeTours: TourModuleDef[] = [
  {
    id: "attendance",
    label: "Attendance",
    summary: "Your punches and hours, team attendance and corrections.",
    route: "/attendance",
    steps: [
      intro(
        "attendance",
        "Attendance",
        "Punches, hours worked and time away. My Attendance is your own month; the other pages cover the people you can see.",
      ),
      {
        id: "summary",
        target: "attendance-summary",
        title: "Your month in numbers",
        content:
          "Days present, half days, paid and unpaid leave, and how many corrections are left, for the month shown. Step between months above.",
      },
      {
        id: "daily",
        target: "attendance-daily",
        placement: "top",
        title: "Day by day",
        content:
          "Each day’s punch-in and punch-out times and status. You punch in and out from Today.",
      },
      {
        id: "team",
        route: "/attendance/view-all-attendances",
        target: "attendance-team-filters",
        title: "All Attendance",
        content:
          "A monthly summary per person — days present, half days and leave — for the people you can see. Pick the month or search for someone here.",
      },
      {
        id: "team-table",
        route: "/attendance/view-all-attendances",
        target: "attendance-team-table",
        placement: "top",
        title: "Search and scan",
        content: "Compare everyone’s month at a glance.",
      },
      {
        id: "corrections",
        route: "/attendance/attendance-correction",
        target: "corrections-form",
        placement: "auto",
        title: "Fix a missed punch",
        content:
          "Choose the employee and enter the times they actually started and finished. Corrections count toward the monthly allowance, shown once you choose someone.",
      },
      page(
        "insights",
        "Attendance Insights",
        "Attendance and correction rates, weekly trends, punch-in times, status mix and departments.",
        "/attendance/insights",
      ),
    ],
  },
  {
    id: "leave",
    label: "Leave",
    summary: "Applying for leave, balances and approvals.",
    route: "/attendance/view-leave-applications",
    steps: [
      intro(
        "leave",
        "Leave",
        "Time off: your applications and, if you approve leave, your team’s.",
      ),
      {
        id: "status",
        target: "leave-status",
        title: "Filter by status",
        content:
          "Show pending, approved or rejected applications. Turn on Upcoming only to hide leave that has already passed.",
      },
      {
        id: "search",
        target: "leave-search",
        timeout: 2500,
        title: "Find a person",
        content: "Search applications by name.",
      },
      {
        id: "table",
        target: "leave-table",
        placement: "top",
        title: "Applications",
        content:
          "Each application with its dates and status. Pending ones wait in the approver’s Approvals.",
      },
      {
        id: "apply",
        target: "leave-apply",
        title: "Apply for leave",
        content: "Start a new request here.",
      },
      {
        id: "form",
        route: "/attendance/apply-leave",
        target: "leave-form",
        placement: "auto",
        title: "When and why",
        content:
          "Choose how long you’ll be away — full days, a half day or a short leave — then the dates and the details. Nothing is sent until you submit.",
      },
      {
        id: "balance",
        route: "/attendance/apply-leave",
        target: "leave-balance",
        placement: "auto",
        timeout: 3000,
        title: "Check your balance",
        content:
          "A summary of the request and your available balance for each leave type. After you submit, it goes to your approver.",
      },
    ],
  },
  {
    id: "wfh",
    label: "Work From Home",
    summary: "Requesting and approving work-from-home days.",
    route: "/wfh/requests",
    steps: [
      intro(
        "wfh",
        "Work From Home",
        "Ask to work from home for a day or a stretch of days; your approver decides.",
      ),
      {
        id: "request",
        target: "wfh-request",
        title: "Request WFH",
        content:
          "Choose the dates and add a reason. Leave the end date empty for a single day.",
      },
      {
        id: "filters",
        target: "page-tabs",
        title: "Filter and search",
        content: "Filter requests by status, or search for a person.",
      },
      {
        id: "table",
        target: "wfh-table",
        placement: "top",
        title: "Requests",
        content:
          "Your requests and, if you approve them, your team’s. Approvers can decide several at once.",
      },
    ],
  },
  {
    id: "holidays",
    label: "Holidays",
    summary: "Organisation holidays by year.",
    route: "/holidays",
    steps: [
      intro(
        "holidays",
        "Holidays",
        "Days the whole organisation is off. They show on everyone’s calendar and count in attendance.",
      ),
      {
        id: "year",
        target: "page-tabs",
        title: "Browse by year",
        content: "Step between years to see past and upcoming holidays.",
      },
      {
        id: "add",
        target: "holidays-add",
        timeout: 2500,
        title: "Add a holiday",
        content:
          "Holiday managers add holidays here; they appear on everyone’s calendar.",
      },
    ],
  },
];
