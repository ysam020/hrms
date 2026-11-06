// Workload model: each connection is one signed-in person who repeatedly
// "visits a page" — issues that page's GET requests in order — then picks
// the next page by weight. Requests run one at a time per connection (a
// browser would fire a page's calls in parallel; that changes per-connection
// pacing, not the request mix).
//
// WHERE THE WEIGHTS COME FROM (provisional, documented in the README):
//   - Prometheus http_requests_total on the dev stack over 14 days (the only
//     usage telemetry: production logs were never shipped). Top GET routes:
//     /dashboard/data 28.5%, /presence/me 10.1%, /walkthrough/progress 9.8%,
//     /profile 9.6%, /chat/unread-counts 5.6%, /get-notifications 5.4%,
//     attendance summary/list ~3% each, approvals, holidays, calendar,
//     HR activities, birthdays, /dashboard ~2.7–3% each.
//   - That data comes from one person plus earlier dashboard benchmarks, so
//     /dashboard/data is over-represented; it is blended with the category
//     split proposed for this exercise (dashboard 20, employees 25,
//     attendance 20, leave 12, reports 10, org/settings 8, audit 3,
//     notifications 2) and adjusted for what each role can open.
// Page weights are relative; pages a role can't use are dropped and the rest
// renormalised per role.

export const pages = {
  // Full page load: the shell's own calls (profile, presence, walkthrough,
  // unread counts, notifications, approvals badge).
  sessionStart: {
    weight: 12,
    requests: [
      "profile",
      "presenceMe",
      "walkthrough",
      "chatUnread",
      "notifications",
      "approvalsPending",
    ],
  },
  // "Today" dashboard: layout, then both widget groups and the side panels.
  today: {
    weight: 12,
    requests: [
      "dashboard",
      "dashboardLive",
      "dashboardSlow",
      "holidays",
      "calendarEvents",
      "hrActivities",
      "birthdays",
    ],
  },
  // Background polling while the dashboard is open (live widgets every
  // 2 min; unread counts and notifications refresh with it).
  dashboardRefresh: {
    weight: 8,
    requests: ["dashboardLive", "chatUnread", "notifications"],
  },
  attendanceSelf: {
    weight: 12,
    requests: ["myAttendance", "myAttendanceSummary"],
  },
  attendanceTeam: {
    weight: 6,
    requests: ["allAttendance", "attendanceInsights"],
  },
  leave: {
    weight: 12,
    requests: ["leaveApplications", "paidLeaves", "leavePolicy"],
  },
  peopleDirectory: {
    weight: 10,
    requests: ["employeeDirectory", "presencePeople"],
  },
  peopleSearch: { weight: 8, requests: ["employeeSearch", "employeeDetails"] },
  orgChart: {
    weight: 3,
    requests: ["orgChart", "departments", "designations"],
  },
  insights: {
    weight: 7,
    requests: [
      "employeeInsights",
      "headcountGrowth",
      "analyticsHeadcount",
      "analyticsAttendance",
      "analyticsLeave",
    ],
  },
  settings: { weight: 4, requests: ["tenantSettings", "roles", "teams"] },
  kyc: { weight: 2, requests: ["kycList"] },
  audit: { weight: 3, requests: ["auditLogs"] },
  notifications: { weight: 2, requests: ["notifications", "chatUnread"] },
};

// How connections are spread over the seeded people. Population follows
// the seeded orgs (alpha 250, beta 60: 1 owner, 1 admin, ~2% HR, 10%
// managers, rest employees, per org). Owners, admins and HR work in the app
// all day while most employees check in a few times, so they get a much
// higher activity multiplier; without it (first smoke pass, 2026-11-05) the
// admin-only pages (insights, settings, audit) came out at 0.0–0.4% of
// requests and the expensive endpoints would go unmeasured. Resulting mix
// per endpoint: reports/smoke-*.md, "Expected request mix".
export const roleActivity = {
  owner: 8,
  admin: 8,
  hr: 8,
  manager: 2,
  employee: 1,
};

// Fixed seed so two runs with the same stage produce the same request
// sequence per connection (comparability across before/after runs).
export const prngSeed = 1105;
