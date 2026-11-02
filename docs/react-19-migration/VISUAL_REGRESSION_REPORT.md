# Visual Regression Report

**Result: no visual differences.** 175 screenshot pairs (React 18.3.1 build vs React 19.3.0 branch build), 0 differing pixels.

## Method

| Item          | Setting                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builds        | `dist/` from `pnpm --filter web build` at `react18-baseline-20261101` and at the branch head (all fixes and refactors included)                                                                                                                                                                                                                                                               |
| Server        | Same local static server for both (SPA fallback, gzip, no caching)                                                                                                                                                                                                                                                                                                                            |
| Browser       | Chromium (Playwright build 1234), headless, device scale factor 1                                                                                                                                                                                                                                                                                                                             |
| Viewports     | Desktop 1440×900, tablet 834×1112, mobile 390×844                                                                                                                                                                                                                                                                                                                                             |
| Data          | Fictional "Halcyon Labs" fixtures: persona Maya Iyer, owner with superuser and support-agent rights, so every module renders. `/api/v1/*` is answered inside the browser by Playwright. Identical for both builds.                                                                                                                                                                            |
| Determinism   | `Date` fixed to 2026-10-15 10:30 IST (timers and rAF run normally); seeded `Math.random`; `prefers-reduced-motion: reduce`; light theme unless stated; locale en-IN, timezone Asia/Kolkata; service worker blocked; Socket.IO and third-party hosts blocked; wait for 800 ms with no API request in flight, then fonts ready; full-page screenshots with animations disabled and caret hidden |
| Comparison    | pixelmatch, threshold 0.1, anti-aliasing ignored, sizes must match                                                                                                                                                                                                                                                                                                                            |
| Noise control | The React 18 build captured **twice**: 156/156 identical, so any difference would be real                                                                                                                                                                                                                                                                                                     |

Harness (kept outside the repository): `~/Downloads/hrms-react19-artifacts/harness/` — `capture.mjs`, `interactions.mjs`, `compare.mjs`, `fixtures.mjs`, `routes.mjs`.

## Static screens: 156/156 identical

52 routes × 3 viewports. Areas and routes:

| Area                               | Routes                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Public                             | `/` (prerendered landing), `/login`, `/privacy-policy`, `/careers/halcyon-labs` |
| Today                              | `/dashboard` (leave balance, my requests, tour banner)                          |
| Approvals, Calendar, Chat, Profile | `/approvals`, `/calendar`, `/chat`, `/profile` (→ `/profile/basic-info`)        |
| Employees                          | list, insights, `/employee-management/aarav.shah`                               |
| Organization                       | `/organization-tree`                                                            |
| Attendance                         | `/attendance`, view-all, correction, insights                                   |
| Leave                              | `/attendance/view-leave-applications`, `/attendance/apply-leave`                |
| WFH, Holidays                      | `/wfh/requests`, `/holidays`                                                    |
| KYC                                | view-employee-kycs, complete-kyc                                                |
| Recruitment                        | view-job-openings, `/job-openings/new`                                          |
| Performance                        | reviews, review-cycles                                                          |
| Payroll                            | my-payslips, payroll-runs, salary-management, my-tax-declaration                |
| Assets                             | inventory, summary                                                              |
| Resignations                       | view-resignations, exit-feedback                                                |
| Announcements, Policies, Helpdesk  | `/hr-activities`, `/policy`, `/helpdesk`                                        |
| Analytics, Reports, Permissions    | `/analytics/workforce`, report-builder, manage-roles                            |
| Settings, Subscription, Help       | `/settings/company`, `/settings/leave`, `/subscription`, `/help`                |
| Support                            | `/support`, `/support/new`, `/support/tickets/tk-1`, `/platform/support`        |
| AI assistants, Audit log           | `/ai-assistants`, `/audit-logs`                                                 |
| Not found                          | `/this-page-does-not-exist`                                                     |

**Data caveat:** detailed fixtures exist for the session, dashboard, employees, leave, support, notifications and subscription. Other screens received empty successful responses, so they were compared in their **empty states**: layout, navigation, headers, filters, empty messages. Populated tables in those modules were not compared.

## Interactive states: 18/18 identical

| State                                                  | Viewport        |
| ------------------------------------------------------ | --------------- |
| Notifications popover                                  | desktop, mobile |
| Command palette (⌘K), and with a query                 | desktop         |
| Sidebar hidden                                         | desktop         |
| Account menu; log-out confirmation dialog              | desktop         |
| Dashboard customise sheet                              | desktop         |
| Apply-leave validation errors                          | desktop         |
| Leave approve confirmation dialog                      | desktop, tablet |
| New support ticket validation errors                   | desktop         |
| Mobile navigation drawer                               | mobile          |
| Loading state (employee list request never answers)    | desktop         |
| Error state (leave list returns 500)                   | desktop         |
| Dark mode: dashboard, leave list; leave list on mobile | desktop, mobile |

DOM facts recorded per state were also identical between builds: focused element, `inert` regions, open dialogs, alerts. This covers behaviour a screenshot can't show, e.g. focus moving to "Cancel" in confirmation dialogs.

## Offline (PWA): 1/1 identical

The dashboard after an offline reload, served from the service worker's precache, with the offline indicator.

## Investigated differences that were not visual

| Finding                                                                       | Visible?                         | Action                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| React 19 drops `inert=""` (exiting overlays, hidden sidebar)                  | No (behavioural: focus/keyboard) | **Fixed**; inert regions now match React 18 in the DOM facts                 |
| Prerendered landing: `useId` format `:R1cb:` → `_R_1cb_`                      | No                               | None needed; the client re-renders with `createRoot`                         |
| Prerendered landing: new `<link rel="preload" as="image">` for the hero image | No                               | Kept: an early fetch of the LCP image, emitted by React 19's server renderer |

No snapshot was updated to make a comparison pass; there were no differences to accept.
