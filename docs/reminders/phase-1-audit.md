# Reminders & proactive notifications — Phase 1 audit

Status: **for approval** (2026-11-12). Nothing implemented yet. Branch at time
of audit: `chore/swagger-audit` (clean).

Contents

1. [What exists today](#1-what-exists-today)
2. [Gaps](#2-gaps)
3. [What the codebase does not have](#3-what-the-codebase-does-not-have-requested-items-with-no-module-behind-them)
4. [Reminder matrix](#4-reminder-matrix)
5. [Proposed architecture](#5-proposed-architecture)
6. [Action Centre](#6-action-centre)
7. [Preferences and org policy](#7-preferences-and-org-policy)
8. [Schema / API changes](#8-schema--api-changes)
9. [Implementation plan and test plan](#9-implementation-plan)
10. [Decisions needed](#10-decisions-needed)

---

## 1. What exists today

All of this is reused; nothing below gets a parallel replacement.

| Piece                      | Where                                                                                                     | What it already does                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notify()`                 | `packages/notifications/src/notify.ts`                                                                    | Single producer entry point. Seals payload, enqueues on `notificationQueueV2` (in-app + push) and `emailQueue` (one job per address). Job id = UUID = worker idempotency key. Header comment already plans "recipient resolution, template lookup, channel fan-out" as its Phase 3 — the reminder engine is that phase.                                                            |
| Event catalogue            | `packages/notifications/src/types.ts`                                                                     | `NotificationEventType` union, ~55 events across leave, WFH, resignation, recruitment, KYC, assets, helpdesk, HR activities, payroll documents, tenant/billing.                                                                                                                                                                                                                    |
| Notification worker        | `apps/notification-service/src/workers/notificationWorker.ts`                                             | Tenant-scoped recipient resolution (ids or usernames, never cross-tenant), persists `Notification` + `NotificationRecipient` in the tenant DB, Socket.IO fan-out via Redis publisher, FCM push, Redis lock + `jobId` dedupe, `silent` mode (socket ping + push, no bell row), terminated users excluded at send time, DLQ forwarding, `UnrecoverableError` for undeliverable jobs. |
| Email worker               | `apps/notification-service/src/workers/emailWorker.ts`                                                    | Resend via `sendEmail`, 3 attempts with exponential backoff, DLQ. Templates via `renderEmailHtml` (`@hrms/common`).                                                                                                                                                                                                                                                                |
| Push                       | `packages/firebase/src/sendPushNotifications.ts`                                                          | Multi-device tokens (legacy string + fingerprinted entries), `latestOnly`, invalid-token pruning on send, plus nightly `cleanupFcmTokens`. Production-only (`outboundSideEffectsAllowed`).                                                                                                                                                                                         |
| Socket.IO                  | `packages/websocket`                                                                                      | Redis adapter, per-(tenant,user) registry, `sendToUser`. Bell (`NotificationContext`) and approvals badge (`ApprovalsBadgeContext`) listen on `notification`.                                                                                                                                                                                                                      |
| Queues                     | `packages/queue/src/queues.ts`                                                                            | email, notification (+legacy), scheduler, resumeParsing, payrollDisbursement, presence, DLQ. `replayFailedNotifications.ts` script for the DLQ.                                                                                                                                                                                                                                    |
| Delayed-job pattern        | `presenceQueue` + `presenceExpiryWorker`                                                                  | One delayed job per item; worker acts only if a stored `revision` still matches — exactly the "revalidate before dispatch" pattern the reminder engine needs.                                                                                                                                                                                                                      |
| Scheduler                  | `apps/scheduler-service`                                                                                  | BullMQ repeatable crons (10 jobs), opt-in via `SCHEDULER_ENABLED` (prod only), `jobLease` (Mongo `_id` claim, once per period across schedulers), `forEachActiveTenant` (tenant DB binding, per-tenant failure isolation), `planBacklogNotifications` (48 h window + 100/tenant cap so a stalled scheduler doesn't flood people).                                                  |
| Approval engine            | `packages/approval-engine`                                                                                | Configurable chains for leave, WFH, overtime, resignation, salary advance. Resolves the _exact_ approver per step (reporting manager = team leader → owner/admin fallback; role; specific user) and applies date-ranged delegates. `ApprovalStepInstance.resolvedApproverId` + index `[tenantId, resolvedApproverId, status]`.                                                     |
| Pending actions aggregator | `apps/api-gateway/src/handlers/pendingActions.ts` → `GET /approvals/pending-all`                          | Chain approvals + KYC reviews + join requests in one list; feeds the sidebar badge, dashboard widget and `/approvals`. **This is the seed of the Action Centre.**                                                                                                                                                                                                                  |
| Capabilities (RBAC)        | `apps/api-gateway/src/handlers/dashboard.ts` `resolveCapabilities` (doc: `docs/dashboard-role-matrix.md`) | `self, teamLead, hr, orgAdmin, recruiting, payroll, advances, reviews, kyc, exits, helpdesk, assets, joinRequests, subscription` — each mirrors the check the underlying endpoint uses. The Action Centre gates every item source on these.                                                                                                                                        |
| Existing reminders         | scheduler jobs                                                                                            | `sendKycReminders` (daily, email only), `sendTrialReminders` (tenant owners), `checkTicketSla` (delayed per-ticket + nightly sweep), `updateExpiredHrActivities`, `checkSubscriptionExpiry`.                                                                                                                                                                                       |

Not used anywhere: MongoDB Change Streams. Every business event already passes
through a handler that can call `notify()`, so the proposal below does not
introduce them.

## 2. Gaps

Infrastructure gaps (they block "the right channel, at the right time"):

| #   | Gap                                             | Evidence                                                                                                                                                                                                         | Consequence                                                                                                                                                                                          |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | No deep link on a notification                  | `Notification` has no `link`/`metadata`; `notify()` sends `metadata` but the worker never persists it; FCM payload is `{notification:{title,body}}` only                                                         | Bell rows and push taps can't open the record                                                                                                                                                        |
| G2  | No read state                                   | Only `NotificationRecipient.isCleared`; "mark as read" sets `isCleared: true`                                                                                                                                    | Read = deleted; nothing for "recently resolved"                                                                                                                                                      |
| G3  | No user notification preferences or quiet hours | No model/field; Profile → Notifications is only push device management                                                                                                                                           | Can't honour category/channel opt-outs; email can't be turned off                                                                                                                                    |
| G4  | No reminder dedupe across runs                  | Dedupe is per BullMQ job id only                                                                                                                                                                                 | A sweep that runs daily re-sends the same reminder forever (KYC does this today)                                                                                                                     |
| G5  | No escalation                                   | —                                                                                                                                                                                                                | A request stuck with an approver never surfaces to anyone else                                                                                                                                       |
| G6  | KYC reminders are noisy and bypass the pipeline | `sendKycReminders` calls `sendEmail` directly, daily, no cap; for **each** missing/rejected/pending employee it emails **every** user whose `department == "HUMAN RESOURCES"`                                    | An HR person with 30 pending KYCs gets 30 emails every morning; no in-app/push; ignores capabilities (`kyc`)                                                                                         |
| G7  | Approver submissions are `silent`               | e.g. `leaveApplied` → socket ping + push, no bell row (by design; Pending Approvals is its home)                                                                                                                 | Fine at submission, but nothing nudges once it sits                                                                                                                                                  |
| G8  | Single platform time zone                       | `ENV TZ=Asia/Kolkata` in `docker/base.Dockerfile`; no tenant or user time zone field (only `PresenceStatus.timeZone`, client-reported)                                                                           | Correct for every current tenant; a non-IST tenant would get reminders at IST times                                                                                                                  |
| G9  | No shifts                                       | `TenantSettings` has one org-wide `workStartHour/Minute`, `lateGracePeriodMinutes`, `fullDayMinHours`; no shift end, no per-employee shift; `Team.workWeekPatternOverride` exists in schema but nothing reads it | Punch reminders can be per-tenant only; overnight/flexible shifts can't be modelled                                                                                                                  |
| G10 | Attendance day key is UTC midnight              | `markAttendance`: `dayjs().utc().startOf("day")` while lateness uses local (IST) clock                                                                                                                           | A punch between 00:00–05:30 IST lands on the previous UTC day. Not a reminder bug, but the punch-in check must use the same day key or it will misfire for early shifts. Flagged for a separate look |

Missing notifications in existing flows (event-based, cheap to add):

| Flow             | Missing                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance      | Self-assessment submitted → manager not told; manager review submitted → HR not told (`submitSelfAssessment.ts`, `submitManagerReview.ts` have no `notify`)            |
| Recruitment      | Interviewer not told when an interview stage is scheduled (`applicationStages.ts` has no `notify`); no notice on offer accepted/declined                               |
| Tax declarations | No notifications at all — `RevisionRequested`, `ProofRevisionRequested`, `Verified`, `Rejected` are silent to the employee; `Submitted`/`ProofsSubmitted` silent to HR |
| Payroll          | Run created/awaiting approval/approved: no notifications to the approver (`payroll.ts`)                                                                                |
| Policies         | Publishing a policy notifies nobody (`createPolicy.ts`)                                                                                                                |
| Exit             | Exit checklist items and F&F settlement: no notifications                                                                                                              |
| Assets           | `acknowledgedAt` + `POST /assets/assignments/:id/acknowledge` exist, but no web UI calls it and nobody is reminded                                                     |
| Comp-off         | `CompOffCredit.expiresOn` exists; nobody is warned before expiry                                                                                                       |

## 3. What the codebase does not have (requested items with no module behind them)

The brief lists several reminder families whose underlying feature does not
exist. A reminder needs a record to point at, so these are **out of scope for
the reminder engine** unless you want the feature built first:

| Requested                                          | Reality                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks / assignments / task verification            | No task model or module                                                                                                                                                                           |
| Expense claims / reimbursements                    | No expense module (only tax-declaration line items)                                                                                                                                               |
| Goals / OKRs, peer feedback                        | Reviews are self + manager only; no goals, no peer feedback                                                                                                                                       |
| Policy acknowledgement                             | `Policy` has no acknowledgement records (memory notes this was already ruled "not advertisable")                                                                                                  |
| Document expiry (contracts, IDs)                   | No expiry dates on any document                                                                                                                                                                   |
| Regularisation **requests**                        | Not a request workflow: employees self-correct within `regularizationBackdateWindowDays` (default 3) and `ATTENDANCE_CORRECTIONS_PER_MONTH` (default 3). There is no "pending with manager" state |
| Background verification info requests              | `ApplicationStageEvent.bgvVendor/bgvResult` only; no request/response loop                                                                                                                        |
| Probation confirmation workflow                    | Only `TenantSettings.probationPeriodDays`; no confirmation record. A _date-based_ "probation ends in 7 days" reminder is still possible (joining_date + days)                                     |
| Per-employee / overnight / flexible shifts         | See G9                                                                                                                                                                                            |
| Leave "needs more information" / approval deadline | Approval steps are approve/reject only, no SLA field                                                                                                                                              |

## 4. Reminder matrix

Legend — **Trig**: E = event (enqueued by the handler), D = delayed job
created at event time, S = scheduled sweep. **Ch**: I = in-app, P = push, M =
email. **Pri**: L/M/H/C. **Wave**: 1 = proposed first build, 2 = next, — =
needs a missing feature (section 3).

All recipients are resolved from data, never "every manager": approvals use
`ApprovalStepInstance.resolvedApproverId` (delegates applied); "team lead" =
`Team.teamLeaderId` of a team containing the employee; "HR" = users holding
the matching capability (`kyc`, `reviews`, `exits`, …) in that tenant, not a
department name.

### A. Attendance

| #   | Trigger                                                 | Recipient | Timing                                                                         | Ch    | Repeat                             | Stops when                                                                               | Pri | Deep link                           | Wave       |
| --- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------ | ----- | ---------------------------------- | ---------------------------------------------------------------------------------------- | --- | ----------------------------------- | ---------- |
| A1  | No punch-in on a working day                            | Employee  | S: per tenant at `workStart + max(grace, 60 min)`                              | I P   | Once                               | Punch-in exists; approved full-day leave / holiday / non-working day / employee inactive | M   | `/attendance`                       | 1          |
| A2  | Punched in, no punch-out                                | Employee  | S: per tenant at `workStart + fullDayMinHours + 60 min`, plus final call 22:00 | I P   | Max 2/day                          | `timeOut` set                                                                            | M   | `/attendance`                       | 1          |
| A3  | Yesterday incomplete (in, no out) and still correctable | Employee  | S: 10:00 next day                                                              | I P   | Daily while inside backdate window | Corrected, or window closed                                                              | M   | `/attendance/attendance-correction` | 1          |
| A4  | Correction window for a missed day closes tomorrow      | Employee  | S: day before window ends                                                      | I P M | Once                               | Corrected                                                                                | H   | `/attendance/attendance-correction` | 2          |
| A5  | Team members not punched in (digest)                    | Team lead | S: workStart + 90 min                                                          | I     | Once/day, opt-in                   | —                                                                                        | L   | `/attendance/view-all-attendances`  | 2          |
| A6  | Overtime request pending                                | Approver  | D: +24 h, +48 h                                                                | I P   | 2 then escalate (X1)               | Decided/cancelled                                                                        | M   | `/approvals`                        | 1 (via X1) |
| A7  | Repeated late/absent pattern                            | HR        | S: weekly digest                                                               | I M   | Weekly                             | —                                                                                        | L   | `/attendance/insights`              | 2          |

Partial-day leave (half day / short leave): A1 waits until the uncovered
session starts. WFH: WFH employees still punch (geofence uses home location),
so A1 applies; `attendanceMode` field/remote exemptions are honoured.

### B. Leave & WFH

| #   | Trigger                                       | Recipient             | Timing                           | Ch             | Repeat          | Stops when                              | Pri | Deep link                                        | Wave      |
| --- | --------------------------------------------- | --------------------- | -------------------------------- | -------------- | --------------- | --------------------------------------- | --- | ------------------------------------------------ | --------- |
| B1  | Leave/WFH/cancellation awaiting this approver | Current step approver | D: +24 h, +48 h (business hours) | I P (M on 2nd) | 2 then escalate | Step acted, request cancelled/withdrawn | M→H | `/approvals`                                     | 1         |
| B2  | Approved leave starts tomorrow                | Employee              | S: 18:00 day before              | I              | Once            | Cancelled                               | L   | `/attendance/view-leave-applications`            | 1         |
| B3  | Team member on leave tomorrow                 | Team lead             | S: 18:00 day before (digest)     | I              | Once            | —                                       | L   | `/calendar`                                      | 2         |
| B4  | Leave starting soon still pending             | Approver              | S: when start ≤ 24 h away        | I P M          | Once            | Decided                                 | H   | `/approvals`                                     | 1         |
| B5  | Pending request's start date has passed       | Requester + approver  | S: daily                         | I              | Once            | Decided                                 | M   | `/approvals`                                     | 2         |
| B6  | Comp-off credit expires in 7 days / 1 day     | Employee              | S: 09:00                         | I P            | 2               | Used/expired                            | M   | `/attendance/apply-leave`                        | 2         |
| B7  | Decision made (approved/rejected)             | Requester             | E (exists)                       | I P            | —               | —                                       | M   | add link → `/attendance/view-leave-applications` | link only |

### C. Approvals — generic (one implementation covers leave, WFH, overtime, resignation, salary advance)

| #   | Trigger                                                                     | Recipient                                                                 | Timing | Ch    | Repeat | Stops when | Pri | Deep link    | Wave |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ----- | ------ | ---------- | --- | ------------ | ---- |
| X1  | Step still pending after `escalateAfterHours` (tenant policy, default 72 h) | Requester's next-level: owner/admin (or chain's next approver if defined) | D      | I P M | Once   | Step acted | H   | `/approvals` | 1    |
| X2  | Approver has an active delegate                                             | Delegate gets the reminders, not the delegator                            | —      | —     | —      | —          | —   | —            | 1    |

### D. Payroll & finance

| #   | Trigger                                             | Recipient      | Timing                                                  | Ch    | Repeat               | Stops when         | Pri | Deep link                           | Wave      |
| --- | --------------------------------------------------- | -------------- | ------------------------------------------------------- | ----- | -------------------- | ------------------ | --- | ----------------------------------- | --------- |
| D1  | Tax declaration revision / proof revision requested | Employee       | E + D +3 days                                           | I P M | 1 follow-up          | Resubmitted        | H   | `/payroll/my-tax-declaration`       | 1         |
| D2  | Declaration / proofs submitted                      | HR (`payroll`) | E (silent → Action Centre) + D +3 days                  | I     | 1                    | Verified/rejected  | M   | `/payroll/tax-declarations/:userId` | 1         |
| D3  | No declaration submitted for current FY             | Employee       | S: monthly in Apr–Jun, weekly in Jan–Feb (proof season) | I M   | As listed            | Submitted          | M   | `/payroll/my-tax-declaration`       | 2         |
| D4  | Bank account / PAN / UAN missing before payroll     | Employee + HR  | S: 5 days before pay day (`PayCycle.payDay`)            | I P M | Daily until pay day  | Filled             | H   | `/kyc/complete-kyc`                 | 2         |
| D5  | Payroll run in draft / awaiting approval            | Owner/admin/HR | E + S: 3 days before pay day                            | I P M | Daily until approved | Approved/disbursed | H   | `/payroll/payroll-runs`             | 2         |
| D6  | Payout failures in a run                            | Disburser      | E (exists for disbursement)                             | I M   | —                    | Retried            | C   | `/payroll/payroll-runs`             | link only |
| D7  | Payslip published                                   | Employee       | E (`salarySlip` exists, email)                          | add I | —                    | —                  | L   | `/payroll/my-payslips`              | 2         |
| D8  | Salary advance pending                              | Approver       | via B1/X1                                               |       |                      |                    |     | `/approvals`                        | 1         |
| —   | Expense claims (D4–D7 of brief)                     |                |                                                         |       |                      |                    |     |                                     | —         |

### E. Lifecycle & onboarding

| #   | Trigger                                 | Recipient                    | Timing                                                    | Ch    | Repeat                  | Stops when        | Pri | Deep link                        | Wave             |
| --- | --------------------------------------- | ---------------------------- | --------------------------------------------------------- | ----- | ----------------------- | ----------------- | --- | -------------------------------- | ---------------- |
| E1  | KYC not submitted (joined > 2 days ago) | Employee                     | S: 09:30 on days 2, 5, 10, then weekly                    | I P M | Capped schedule         | Submitted         | H   | `/kyc/complete-kyc`              | 1 (replaces job) |
| E2  | KYC rejected / revision requested       | Employee                     | E (exists) + D +2 days                                    | I P M | 1                       | Resubmitted       | H   | `/kyc/complete-kyc`              | 1                |
| E3  | KYC awaiting review                     | HR (`kyc`)                   | S: **one daily digest** ("7 KYCs waiting, oldest 4 days") | I M   | Daily while any pending | None pending      | M   | `/kyc/view-employee-kycs`        | 1 (replaces job) |
| E4  | KYC edit-access request pending         | HR (`kyc`)                   | via Action Centre + digest                                | I     | —                       | Resolved          | M   | `/kyc/view-employee-kycs`        | 1                |
| E5  | Probation ends in 7 days                | Team lead + HR               | S: 09:30                                                  | I M   | Once (+ on the day)     | Employee inactive | M   | `/employee-management/:username` | 2                |
| E6  | Assigned asset not acknowledged         | Employee                     | D +2 days                                                 | I P   | 1                       | Acknowledged      | L   | needs an employee UI (gap)       | 2                |
| E7  | Asset expected return overdue           | Holder + assets admin        | S                                                         | I     | Weekly                  | Returned          | M   | `/assets/inventory`              | 2                |
| E8  | Birthday / work anniversary today       | Team (opt-in, org-level)     | S: 09:00                                                  | I     | Once                    | —                 | L   | `/calendar`                      | 2                |
| E9  | Join request pending                    | Owner/admin (`joinRequests`) | Action Centre + D +24 h                                   | I P   | 1                       | Decided           | M   | `/settings/join-requests`        | 1                |

### F. Performance

| #   | Trigger                                        | Recipient      | Timing                                                             | Ch          | Repeat       | Stops when               | Pri | Deep link                            | Wave |
| --- | ---------------------------------------------- | -------------- | ------------------------------------------------------------------ | ----------- | ------------ | ------------------------ | --- | ------------------------------------ | ---- |
| F1  | Review assigned, self-assessment not submitted | Employee       | E (exists) + S: 7 d and 2 d before cycle `periodEnd`, then overdue | I P M(last) | 3            | Submitted / cycle closed | M→H | `/performance-reviews/reviews`       | 1    |
| F2  | Self-assessment submitted → manager to review  | Reviewer       | **E (new)** + D +3 d, +7 d                                         | I P         | 2            | Manager submitted        | M   | `/performance-reviews/reviews`       | 1    |
| F3  | Manager review submitted → finalise            | HR (`reviews`) | **E (new)**, digest                                                | I           | Daily digest | Finalised                | M   | `/performance-reviews/review-cycles` | 1    |
| F4  | Cycle ends in 3 days with incomplete reviews   | HR (`reviews`) | S                                                                  | I M         | Once         | Cycle closed             | H   | `/performance-reviews/review-cycles` | 1    |
| —   | Goals/OKRs, peer feedback                      |                |                                                                    |             |              |                          |     |                                      | —    |

### G. Recruitment

| #   | Trigger                                 | Recipient                 | Timing                        | Ch    | Repeat | Stops when                                       | Pri | Deep link                         | Wave |
| --- | --------------------------------------- | ------------------------- | ----------------------------- | ----- | ------ | ------------------------------------------------ | --- | --------------------------------- | ---- |
| G1  | Interview scheduled                     | Interviewer               | **E (new)**                   | I P M | —      | —                                                | M   | `/view-job-opening/:id`           | 1    |
| G2  | Interview in 1 hour                     | Interviewer               | D: `scheduledAt − 60 min`     | I P   | Once   | Rescheduled (new job), stage completed/cancelled | H   | `/view-job-opening/:id`           | 1    |
| G3  | Interview done, no scorecard            | Interviewer               | D: `scheduledAt + 2 h`, +24 h | I P   | 2      | Outcome/scorecard saved                          | M   | `/view-job-opening/:id`           | 1    |
| G4  | New applications not reviewed in 3 days | Recruiters (`recruiting`) | S: daily digest               | I     | Daily  | Reviewed                                         | L   | `/job-openings/view-job-openings` | 2    |
| G5  | Offer sent, no response in 3 days       | Offer creator             | D                             | I     | Once   | Accepted/declined                                | M   | `/view-job-opening/:id`           | 2    |
| G6  | Job opening deadline in 3 days          | Recruiters                | S                             | I     | Once   | Closed                                           | L   | `/view-job-opening/:id`           | 2    |

### H. Documents & compliance

| #   | Trigger                                 | Recipient                   | Timing      | Ch                            | Repeat | Stops when | Pri | Deep link     | Wave |
| --- | --------------------------------------- | --------------------------- | ----------- | ----------------------------- | ------ | ---------- | --- | ------------- | ---- |
| H1  | New / updated policy published          | All employees (or targeted) | **E (new)** | I (+P if org marks mandatory) | —      | —          | M   | `/policy/:id` | 2    |
| H2  | Mandatory KYC docs missing              | = E1                        |             |                               |        |            |     |               | 1    |
| —   | Document expiry, policy acknowledgement |                             |             |                               |        |            |     |               | —    |

### I. Exit

| #   | Trigger                                              | Recipient                 | Timing          | Ch  | Repeat          | Stops when         | Pri | Deep link                                | Wave |
| --- | ---------------------------------------------------- | ------------------------- | --------------- | --- | --------------- | ------------------ | --- | ---------------------------------------- | ---- |
| I1  | Resignation pending                                  | Approver                  | via B1/X1       |     |                 |                    |     | `/approvals`                             | 1    |
| I2  | Exit checklist items open, last working day ≤ 5 days | HR (`exits`) + item owner | S               | I M | Daily until LWD | All items complete | H   | `/resignation-process/view-resignations` | 2    |
| I3  | Exit feedback not submitted                          | Leaver                    | S: LWD − 3 days | I P | Once            | Submitted          | L   | `/resignation-process/exit-feedback`     | 2    |
| I4  | F&F draft awaiting approval / disbursal              | HR (`exits`)              | S               | I   | Weekly          | Disbursed          | M   | `/resignation-process/view-resignations` | 2    |

### J. Announcements & org

| #   | Trigger                                       | Recipient | Timing                  | Ch  | Repeat | Stops when        | Pri | Deep link                   | Wave      |
| --- | --------------------------------------------- | --------- | ----------------------- | --- | ------ | ----------------- | --- | --------------------------- | --------- |
| J1  | HR activity / announcement created or updated | Tenant    | E (exists)              | I P | —      | —                 | M   | add link → `/hr-activities` | link only |
| J2  | HR activity tomorrow                          | Tenant    | D: `scheduledAt − 24 h` | I   | Once   | Cancelled/deleted | L   | `/hr-activities`            | 2         |
| J3  | Holiday tomorrow                              | Tenant    | S: 17:00                | I   | Once   | —                 | L   | `/holidays`                 | 2         |

### K. Other modules

| #   | Trigger                                                     | Recipient                    | Timing                       | Ch  | Repeat | Stops when             | Pri           | Deep link                | Wave      |
| --- | ----------------------------------------------------------- | ---------------------------- | ---------------------------- | --- | ------ | ---------------------- | ------------- | ------------------------ | --------- |
| K1  | Helpdesk ticket assigned / SLA breach                       | Assignee / helpdesk managers | E + D (exists)               | I P | —      | Resolved               | H             | `/helpdesk/:ticketId`    | link only |
| K2  | Ticket waiting on requester reply 3 days                    | Requester                    | D                            | I   | Once   | Reply                  | L             | `/helpdesk/:ticketId`    | 2         |
| K3  | Unassigned ticket > 4 h                                     | Helpdesk managers            | D                            | I P | Once   | Assigned               | M             | `/helpdesk`              | 2         |
| K4  | Asset issue reported, unreviewed 2 days                     | Assets admin                 | D                            | I   | Once   | Reviewed               | M             | `/assets/issues`         | 2         |
| K5  | Trial ending / subscription payment failed / plan expiring  | Owner (`subscription`)       | Exists                       | I M | Exists | Exists                 | C             | `/subscription`          | link only |
| K6  | Org setup checklist incomplete (`OnboardingChecklistState`) | Owner                        | S: days 1, 3, 7 after signup | I M | 3      | All steps done/skipped | M             | `/dashboard`             | 2         |
| K7  | New sign-in from an unrecognised device (`LoginEvent`)      | User                         | E                            | I M | —      | —                      | C (mandatory) | `/profile/security-keys` | 2         |
| K8  | Permissions granted                                         | User                         | E (exists)                   | I P | —      | —                      | L             | link                     | link only |

Wave 1 count: 21 reminders (A1–A3, B1, B2, B4, X1–X2, D1–D2, E1–E4, E9, F1–F4, G1–G3), plus links on every existing event.

## 5. Proposed architecture

```
 business handler ──notify()────────────────────────────────┐   (unchanged path)
       │                                                    ▼
       └─scheduleReminder()──► reminderQueue (delayed) ──► reminder worker ──► revalidate ─► ledger claim ─► prefs/quiet hrs ─► notify()
 scheduler cron ──► evaluateReminders sweep ─────────────────┘                                                       │
 (per tenant, leased)                                                                                                ▼
                                                                                         notificationQueueV2 / emailQueue (existing workers)
```

**Principle: one delivery path.** Every reminder is ultimately a `notify()`
call; the existing notification and email workers stay the only things that
write rows, push or email. The engine only decides _whether_ and _when_.

### 5.1 Reminder definitions (code, `@hrms/notifications`)

```ts
interface ReminderDefinition<Ctx> {
  key: "approval.pending" | "attendance.missingPunchIn" | ...; // stable id
  category: ReminderCategory;      // attendance | leave | approvals | payroll | kyc | performance | recruitment | exit | org | security
  priority: "low" | "medium" | "high" | "critical";
  defaultChannels: Channel[];      // e.g. ["inApp","push"]
  mandatory?: boolean;             // security/compliance: prefs can't mute in-app
  // Load current state and say whether the reminder still applies. Called at
  // dispatch time, every time — the source of truth, not the job payload.
  resolve(ctx: { tenantId; entityId?; step; now }): Promise<
    | { due: false; reason: string }
    | { due: true; recipients: string[]; title; message; link; escalateTo?: string[] }
  >;
}
```

Definitions live next to the existing event catalogue so producers and the
worker share them. Copy (title/message) is built inside `resolve`, from live
data, so a reminder never shows stale text.

### 5.2 Two trigger styles

**Delayed jobs (event-anchored)** — for anything that has a natural "N hours
after X" or "N minutes before Y": approvals (B1/X1), interviews (G2/G3),
review submissions (F2), tax revisions (D1), join requests (E9).

- Producer calls `scheduleReminder(def, entityId, at, step)` right after its
  existing `notify()`.
- New queue `reminderQueue` (same defaults as `presenceQueue`).
- **Deterministic job id** `rem:{tenantId}:{key}:{entityId}:{step}` → BullMQ
  refuses a second add with the same id, so retries/double-clicks can't
  double-schedule.
- Completing the action calls `cancelReminders(key, entityId)` (best effort
  `job.remove()`); correctness never depends on it, because the worker
  re-runs `resolve()` and drops the job if the condition is gone — same model
  as presence `revision`.
- Rescheduling (interview moved) = remove + add with a new `step` suffix.

**Sweeps (condition-based)** — for things that are true of many rows at a
time of day: punch-in/out, KYC, upcoming leave, cycle deadlines, comp-off
expiry, digests.

- One new cron `evaluateReminders` every 15 min in scheduler-service, using
  `jobLease` (`fireMinute`) and `forEachActiveTenant`.
- Each sweep definition declares `dueAt(tenantSettings, today)`; the cron only
  runs definitions whose due minute fell in the last window and that haven't
  run for this tenant today (lease id `{key}:{tenant}:{date}`), so a 15-min
  cron gives tenant-specific times without per-tenant cron registration.
- Sweeps compute recipients with set queries, not per-user loops. A1 is:
  active users of the tenant − users with an `AttendanceRecord` for today −
  users on approved leave covering today − (whole tenant if holiday /
  non-working day). That's 3 indexed queries per tenant
  (`attendance_records [tenantId,date]`, `leaves [status,from,to]`,
  `users [tenantId,employeeStatus]`).
- Results go through the same ledger/prefs/notify path, and through the
  existing `planBacklogNotifications` cap so a scheduler outage can't flood.

Why not one delayed job per employee for punch-in: start time is per tenant
today (G9), so one tenant query at the due minute is strictly cheaper and has
no cancellation bookkeeping. If per-employee shifts arrive later, the sweep's
`dueAt` becomes per-shift-group without changing the delivery path.

### 5.3 Idempotency and dedupe — `ReminderLog` (tenant DB)

One row per _(definition, entity, recipient, occurrence)_:

```
dedupeKey  unique   "{key}:{entityId|date}:{recipientId}:{step}"
tenantId, key, entityId, recipientId, step, category, priority
status: sent | skipped_pref | skipped_quiet_deferred | resolved
channels: ["inApp","push"]   notificationJobId   sentAt   resolvedAt
```

- **Insert-first claim** on `dedupeKey` (Mongo unique index) before calling
  `notify()`. Two workers, a retry, or a sweep overlapping a delayed job can't
  both send: the second insert fails and it stops. Same technique as
  `jobLease`.
- Repeat policy reads prior rows for the same (key, entity, recipient):
  "max 2 then escalate", "weekly after day 10" are counts/dates over the log.
- It doubles as delivery tracking and audit (who was reminded about what,
  when, on which channels, and why something was skipped) and powers the
  Action Centre's "recently resolved".
- TTL index on `sentAt` (180 days) keeps it bounded.

### 5.4 Delivery

- `notify()` gains optional `link`, `category`, `reminderKey`, `entityRef`.
  The worker persists `link`/`category` on `Notification` (G1) and puts
  `{ link }` in the FCM `data` payload; the service worker's click handler
  opens it. Old producers that don't pass them behave exactly as today.
- Channel selection happens **before** `notify()`:
  `definition.defaultChannels ∩ tenant policy ∩ user prefs`, with `mandatory`
  forcing in-app. Low priority never emails.
- Quiet hours: in-app is written immediately (it's silent); push/email for
  non-critical reminders are re-enqueued as a delayed job at quiet-hours end.
- Push failures and invalid tokens: already handled by `sendPushNotifications`
  - `cleanupFcmTokens`. Email failures: existing retries + DLQ. The ledger
    records the job ids so a DLQ entry can be traced back to its reminder.
- Digests (E3, F3, G4, A5): one notification summarising N items with a link
  to the list, instead of N notifications.

### 5.5 Escalation

Escalation is just another step of the same definition: when the repeat
policy is exhausted and `escalateAfterHours` has passed, `resolve()` returns
`escalateTo` — for approvals, the chain's next step approver if one exists,
otherwise the tenant's owner/admin (the same fallback the approval engine
already uses). One escalation per item.

### 5.6 Where the code runs

- `reminderQueue` worker: **scheduler-service** (it already owns cross-module
  Prisma access and the tenant loop), as a second Worker with concurrency 5 —
  the cron worker stays serial at concurrency 1.
- Delivery: unchanged notification-service workers.
- Producers: the existing handlers in leave/recruitment/performance/gateway
  call `scheduleReminder`/`cancelReminders` from `@hrms/notifications`.
- `SCHEDULER_ENABLED` gating applies to the sweep cron (dev must not sweep
  prod data — memory: local DB _is_ prod). Delayed-job producers in dev write
  only to the dev Redis, which no prod worker reads.

## 6. Action Centre

Extend, don't duplicate: `/approvals/pending-all` already aggregates three
providers behind capability checks. Generalise it into a provider registry:

`GET /api/v1/me/actions` → `{ needsAction: Item[], updates: Item[], resolved: Item[] }`

```ts
interface ActionItem {
  id: string;                 // provider:entityId
  module: "attendance" | "leave" | "approvals" | "kyc" | "payroll" | ...;
  title: string; explanation: string;
  priority: "low" | "medium" | "high" | "critical";
  dueAt?: string; status: string;
  link: string;               // same route as the reminder's deep link
}
```

- **needsAction** — providers that query live data (no copy of business
  state): chain approvals (existing), KYC reviews (existing), join requests
  (existing), my KYC, my missing punch today / correctable days, my
  self-assessment, reviews to write, interviews to score, my tax declaration
  revisions, tax verifications (HR), payroll runs to approve, unacknowledged
  assets, open exit checklist items.
- **updates** — unread in-app notifications (needs G2's `readAt`).
- **resolved** — `ReminderLog` rows with `resolvedAt` in the last 7 days.
- Every provider declares the capability it needs; the handler calls
  `resolveCapabilities` once and skips providers the caller lacks, so a
  module the user can't open contributes nothing. All queries run in the
  caller's tenant DB.
- `/approvals/pending-all` stays (it becomes the `approvals` provider set), so
  the sidebar badge, dashboard widget and `/approvals` keep working.
- Web: new `/actions` page (sections as above, filter by module), sidebar
  entry with the count, and a "Needs your attention" dashboard widget
  registered in the existing widget registry (capability `self`).
- Live refresh: the existing `notification` socket channel already makes
  `ApprovalsBadgeContext` refetch; reuse it.

## 7. Preferences and org policy

**User (`NotificationPreference`, tenant DB, one per user)**

- Per category: in-app on/off, push on/off, email on/off.
- Quiet hours: start/end, days (default off).
- Daily digest for low-priority items (on/off).
- UI: extend Profile → Notifications (today: push devices only).
- Defaults when no row exists = today's behaviour (everything on), so nothing
  changes for existing users until they choose.

**Organisation (`ReminderPolicy`, tenant DB, edited by owner/admin)**

- Per reminder key: enabled, offsets (e.g. A1 minutes after start), repeat
  count, escalation hours, channels, `mandatory` (user can't mute push/email).
- Feature toggles: birthdays/anniversaries visible to team, team-lead digests.
- UI: new tab under `/settings` ("Reminders").
- Platform-mandatory (not editable): security notices (K7), subscription /
  payment failures (K5).

`notificationWorker` will also apply user channel prefs to **existing**
non-reminder notifications by category, so "turn off email for leave" works
everywhere, not only for reminders. Mandatory/security events bypass.

## 8. Schema / API changes

| Change                                                                                                                  | Kind               | Notes                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Notification.link String?`, `category String?`, `entityRef String?`                                                    | additive, optional | Old rows render as today                                                                                                                       |
| `NotificationRecipient.readAt DateTime?`                                                                                | additive           | `isCleared` keeps meaning "removed from bell"; new `PUT /notifications/:id/read`. Bell shows unread dot + "mark all read"; badge counts unread |
| `ReminderLog`                                                                                                           | new collection     | unique `dedupeKey`; index `[tenantId, recipientId, resolvedAt]`; TTL on `sentAt`                                                               |
| `NotificationPreference`                                                                                                | new                | unique `[tenantId, userId]`                                                                                                                    |
| `ReminderPolicy`                                                                                                        | new                | unique `[tenantId, key]`                                                                                                                       |
| `reminderQueue` + `ReminderJobData`                                                                                     | new queue          | in `@hrms/queue`                                                                                                                               |
| `SchedulerJobName += "evaluateReminders"`                                                                               | additive           |                                                                                                                                                |
| `GET /me/actions`, `GET/PUT /me/notification-preferences`, `GET/PUT /settings/reminders`, `PUT /notifications/:id/read` | new routes         | Swagger spec updated (this branch is the Swagger audit)                                                                                        |
| FCM payload `data.link`, SW `notificationclick`                                                                         | additive           |                                                                                                                                                |

Indexes go in as tenant-local schema indexes per the established process
(memory: never `db push` master). Needs `db:migrate` on deploy.

## 9. Implementation plan

1. **Foundations** — schema additions, `reminderQueue`, `ReminderLog` claim,
   definition registry, preference/policy resolution, `link`/`readAt`
   persistence, push `data.link` + SW click, read/unread in the bell. No
   behaviour change for existing notifications.
2. **Approvals (B1, B4, X1, X2, A6, D8, I1, E9)** — one definition over
   `ApprovalStepInstance`, scheduled from `instantiateApproval`/`actOnStep`,
   cancelled on act/cancel. Biggest value per line of code: covers 5 modules.
3. **Attendance (A1–A3)** — sweep definitions + `evaluateReminders` cron.
4. **KYC (E1–E4)** — replace `sendKycReminders` body with sweep definitions
   (capped schedule, HR digest by `kyc` capability, all channels). Same cron
   slot retired.
5. **Performance, recruitment, tax (F1–F4, G1–G3, D1–D2, B2)** — the missing
   event notifications plus their reminders.
6. **Action Centre** — `/me/actions`, `/actions` page, widget, sidebar.
7. **Preferences & org policy UI.**
8. Wave 2 items as separate PRs after wave 1 is live and the ledger shows
   real volumes.

Each step is its own PR (you merge fast; I'll `gh pr view` before pushing).

### Test plan (jest, `@hrms/db/testing` fake Prisma, `fakeRedis`)

- Working day vs weekend vs holiday vs approved full-day leave vs pending
  leave vs half-day leave (A1).
- Punch-in arriving between scheduling and dispatch → `resolve()` says not due.
- Duplicate execution: same job twice, sweep + delayed job overlap, two
  workers racing → exactly one `ReminderLog` row / one `notify()`.
- Two tenants with different start times / work weeks; a user id from tenant B
  never resolved in tenant A.
- Roles: approver vs delegate vs requester; HR capability vs `department`
  string; employee without `kyc` capability gets no HR digest; Action Centre
  providers hidden without capability.
- Preference matrix (category × channel), mandatory override, quiet hours
  deferral and critical bypass, low-priority never emails.
- Push failure / invalid token, email failure → retry → DLQ, ledger keeps
  job ids.
- Escalation fires once after threshold; not if acted on; goes to delegate-
  aware next approver.
- Cancelled/withdrawn/rejected requests, terminated employee, inactive tenant.
- Time boundaries: run at 23:59/00:01 IST; UTC day-key alignment (G10); a
  reminder due inside quiet hours that crosses midnight.
- Overnight shifts: not supported by the data model (G9) — test asserts A2's
  22:00 final call doesn't fire on a non-working next day; real overnight
  support is a follow-up feature.

## 10. Decisions needed

1. **Wave 1 scope** — the 21 reminders above, in the order of §9?
2. **Missing modules (§3)** — confirm tasks, expenses, goals/peer feedback,
   policy acknowledgement, document expiry, regularisation requests and
   per-employee/overnight shifts are **out of scope** here (each is a feature
   in its own right).
3. **Time zone** — keep platform-wide IST for now (all tenants today), or add
   `Tenant.timeZone` in foundations so sweeps are tenant-local from day one?
   (Recommend: add the field now, default `Asia/Kolkata`; small, avoids a
   rewrite.)
4. **Punch reminder defaults** — A1 at start + max(grace, 60 min) (10:00 with
   today's 09:00 / 30 min defaults); A2 at start + `fullDayMinHours` + 60 min
   (18:00) plus 22:00 final. OK?
5. **Approval nudges** — +24 h, +48 h, escalate to owner/admin at 72 h, in
   working hours only. OK as the default?
6. **KYC job** — replace the current daily per-employee HR emails with a
   single daily digest per HR person (and target by `kyc` capability instead
   of the "HUMAN RESOURCES" department name). This changes current
   behaviour; OK?
7. **Bell semantics** — introduce read/unread (badge = unread; clear still
   removes). OK?
8. **Branch** — start a new branch `feature/reminders` off `main` (current
   branch is `chore/swagger-audit`).

## 11. Decisions (approved 2026-11-12)

1. Wave 1 approved: all 21 reminders, in §9 order.
2. Tasks, expenses, goals/OKRs, peer feedback, policy acknowledgement,
   document expiry, regularisation requests and per-employee/overnight shifts
   are out of scope. The engine must let them plug in later (new definition +
   category; no engine changes).
3. `Tenant.timeZone` (IANA, default `Asia/Kolkata`) drives all reminder
   scheduling, date comparisons and deadlines. The UTC-midnight attendance
   key is documented separately ([../attendance-day-key.md](../attendance-day-key.md))
   and is not changed in this work.
4. Missing punch-in: shift start + max(grace, 60 min). Missing punch-out:
   around 18:00 when the org's working hours support it, final call 22:00.
   Both revalidate right before dispatch and exclude non-working days,
   holidays and approved leave. Org-wide shift only (limitation documented).
5. Approval nudges at 24 h and 48 h, escalation to owner/admin at 72 h, in
   tenant working hours only. Each reminder rechecks that the step is still
   pending with that approver (delegates and engine routing respected).
   Never escalate decided, cancelled or reassigned requests.
6. KYC: one daily digest per HR user, recipients resolved by KYC permission,
   each digest limited to what that user may see, tenant-isolated.
7. Bell: real read/unread. Badge = unread, opening marks read, clearing
   removes, read state is separate from reminder history, deep links on
   rows and push taps.
8. Branch `feature/reminders` from latest `main`, one PR per logical step,
   no merge or deploy without verification.

Cross-cutting requirements: no notification fatigue (dedupe across sweeps,
retries and workers), the Action Centre extends `/approvals/pending-all`,
every actionable notification deep-links, delivery is observable (scheduled
/ recipients / channels / outcome / skip or cancel reason), and strict tenant
isolation.

## 12. PR sequence

| PR  | Scope                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Delivery foundations: `link`/`category` on notifications, read/unread, push tap navigation, `Tenant.timeZone`, links on existing events, list/clear id fix |
| 2   | Reminder engine core: `ReminderLog` ledger, preferences + org policy resolution, `reminderQueue` + worker, `evaluateReminders` sweep cron                  |
| 3   | Approvals reminders + escalation (B1, B4, X1, X2, A6, D8, I1, E9)                                                                                          |
| 4   | Attendance punch reminders (A1–A3)                                                                                                                         |
| 5   | KYC digest replacing `sendKycReminders` (E1–E4)                                                                                                            |
| 6   | Performance, recruitment, tax, upcoming leave (F1–F4, G1–G3, D1–D2, B2)                                                                                    |
| 7   | Action Centre (`/me/actions`, extends `/approvals/pending-all`)                                                                                            |
| 8   | Preferences and org reminder policy UI                                                                                                                     |
