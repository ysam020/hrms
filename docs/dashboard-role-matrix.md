# Dashboard role matrix

Who sees what on Today (`/dashboard`), based on the audit in
[dashboard-data-inventory.md](./dashboard-data-inventory.md).

## Capabilities, not role names

The dashboard never asks "is this person HR?" in a component. The gateway
resolves a small set of **capabilities** for the caller on every request
(`apps/api-gateway/src/handlers/dashboard.ts`, `resolveCapabilities`), each one
mirroring the check the underlying screen's endpoint already uses:

| Capability     | Granted when                                                   | Mirrors                                                 |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| `self`         | Always                                                         | Self-service endpoints                                  |
| `teamLead`     | Leads at least one team that has members (`Team.teamLeaderId`) | Approval-chain "reporting manager", WFH notifications   |
| `hr`           | `tenantRole` is owner/admin/hr, or superuser                   | `requireHrPrivileged`, `assertHrRole`, analytics routes |
| `orgAdmin`     | `tenantRole` is owner/admin, or superuser                      | `requirePrivileged`                                     |
| `recruiting`   | `hr`, or any `JobOpenings:*` grant                             | `canAccessJobOpenings`                                  |
| `payroll`      | `tenantRole` is owner/admin/hr                                 | `listPayrollRuns` (`assertRole`)                        |
| `advances`     | `hr`, or `SalaryManagement:approve_advance`                    | `canApproveAdvances`                                    |
| `reviews`      | `hr`, or `PerformanceReview:manage_cycles`                     | `canManageReviews`                                      |
| `kyc`          | `hr`, or `BasicKYCDetails:view_kyc:all` / `approve_kyc:all`    | KYC review screens                                      |
| `exits`        | `hr`, or `ResignationProcess:view_resignation:all`             | Resignations list                                       |
| `helpdesk`     | `hr`, or `Helpdesk:manage`                                     | `canManageTickets`                                      |
| `assets`       | `hr`, or `Assets:manage`                                       | `canManageAssets`                                       |
| `joinRequests` | `orgAdmin`, or `Organisation:approve_join_requests`            | Join-request approval                                   |
| `subscription` | Owner, or `Subscription:manage`                                | `hasSubscriptionAccess`                                 |

Each widget names the capability it needs. The server lists only the widgets
the caller may use, returns data only for those, and ignores anything else in
a saved layout. Saved preferences can hide or reorder authorized widgets;
they can never add one. A permission change takes effect on the next load.

## Personas

There is no separate payroll persona: payroll runs are restricted to owner/admin/HR, so HR runs payroll in Praesto and the Payroll widget is part of the people-ops default.

Personas only decide the **default layout**. A person gets the defaults of
every persona they match (the employee default applies only when no other persona does), in priority order and without duplicates, so a team
leader with HR access gets one combined dashboard. Everything else they're
allowed to see is listed in Customize, switched off.

| Persona           | Matches when              | Why it's different                                                                                                                               |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Executive         | `orgAdmin`                | Concise, organisation-wide: how many people, how today is going, the trend, hiring, decisions waiting on them. No operational queues by default. |
| People operations | `hr` without `orgAdmin`   | The work queue: KYC, exits, tickets, joiners and leavers, today's attendance across the organisation.                                            |
| Recruiter         | `recruiting` without `hr` | Open roles, the funnel, interviews this week, offers out.                                                                                        |
| Team leader       | `teamLead`                | Their team: who's in, who's out, leave coming up, decisions waiting.                                                                             |
| Employee          | Everyone                  | Their own day, leave, requests, reviews, pay and the company calendar.                                                                           |

## Widgets

✓ = in the default layout · ○ = available, off by default · — = not available.
Rows marked "Team leader" assume the person leads a team; an HR person who
doesn't lead one doesn't get the team widgets at all.

| Widget              | Needs                                                                   | Employee | Team leader | People ops (HR) | Recruiter | Executive (owner/admin) |
| ------------------- | ----------------------------------------------------------------------- | -------- | ----------- | --------------- | --------- | ----------------------- |
| Your Day            | `self`                                                                  | ✓        | ✓           | ✓               | ✓         | ✓                       |
| Needs Your Decision | `self` (server decides the items)                                       | ✓        | ✓           | ✓               | ✓         | ✓                       |
| Team Today          | `teamLead`                                                              | —        | ✓           | —               | —         | —                       |
| Team Leave Ahead    | `teamLead`                                                              | —        | ✓           | —               | —         | —                       |
| Organisation Today  | `hr`                                                                    | —        | —           | ✓               | —         | ✓                       |
| People Ops Queue    | any of `kyc`, `exits`, `helpdesk`, `assets`, `advances`, `joinRequests` | —        | —           | ✓               | —         | ○                       |
| Workforce           | `hr`                                                                    | —        | —           | ✓               | —         | ✓                       |
| Joining and Leaving | `hr` or `exits`                                                         | —        | —           | ✓               | —         | ○                       |
| Headcount Trend     | `hr`                                                                    | —        | —           | ○               | —         | ✓                       |
| Attendance Trend    | `hr`                                                                    | —        | —           | ○               | —         | ○                       |
| Hiring              | `recruiting`                                                            | —        | —           | ○               | ✓         | ✓                       |
| Payroll             | `payroll`                                                               | —        | —           | ✓               | —         | ○                       |
| Review Cycle        | `reviews`                                                               | —        | —           | ○               | —         | ○                       |
| Organisation Admin  | `joinRequests` or `subscription`                                        | —        | —           | —               | —         | ✓                       |
| Leave Balance       | `self`                                                                  | ✓        | ✓           | ○               | ✓         | ○                       |
| My Requests         | `self`                                                                  | ✓        | ✓           | ○               | ○         | ○                       |
| My Reviews          | `self`                                                                  | ✓        | ✓           | ✓               | ○         | ○                       |
| Latest Payslip      | `self`                                                                  | ✓        | ○           | ○               | ○         | ○                       |
| Announcements       | `self`                                                                  | ✓        | ✓           | ✓               | ✓         | ✓                       |
| Coming Up           | `self`                                                                  | ✓        | ✓           | ✓               | ✓         | ✓                       |

## What each persona should not see

- **Team leaders** see their members' status (in, WFH, on leave, not punched
  in yet) and leave dates and types — never leave reasons, pay, KYC or
  documents. Having HR-style widgets on the page doesn't widen their API access:
  team data comes from a query restricted to their own teams.
- **Employees** get no organisation-wide counts. The two endpoints that leaked
  them (`/employee-insights`, `/get-kyc-insights`) are now restricted.
- **Executives** get aggregates. The only named people on an executive
  default are in "Needs Your Decision" and "Coming Up", as before.
- **Payroll totals** are visible only to owner/admin/HR, who can already open
  every payroll run.
