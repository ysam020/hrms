# Microservices

All backend business logic is split across independent gRPC microservices. The API gateway is the only public-facing service; all others are internal and communicate via gRPC on the Docker network. Some business routes in the gateway also query the database directly via `prismaWithTenant` (rules, policies, audit logs, tenant settings) — these do not need a dedicated microservice because the gateway is the only caller.

---

## Service Map

| Service                                       | gRPC Port | Domain                                          |
| --------------------------------------------- | --------- | ----------------------------------------------- |
| [auth-service](#auth-service)                 | 50051     | Authentication, tokens, passkeys, OAuth         |
| [user-service](#user-service)                 | 50052     | User accounts                                   |
| [employee-service](#employee-service)         | 50053     | Employee profiles, KYC, org                     |
| [attendance-service](#attendance-service)     | 50054     | Check-in/out, reports, geofencing               |
| [leave-service](#leave-service)               | 50055     | Leave applications, approvals, balance          |
| [recruitment-service](#recruitment-service)   | 50056     | Job openings, applications, interviews          |
| [hrm-service](#hrm-service)                   | 50057     | Appraisals, HR activities                       |
| [salary-service](#salary-service)             | 50058     | Salary structures, payslips                     |
| [analytics-service](#analytics-service)       | 50059     | Workforce and business analytics                |
| [notification-service](#notification-service) | 50060     | FCM tokens, push dispatch, in-app notifications |
| [scheduler-service](#scheduler-service)       | —         | BullMQ cron workers + background tasks          |

---

## Gateway-Direct Routes (no separate service)

The following domains are handled directly by the API gateway via `prismaWithTenant`:

| Domain            | Routes                       | Notes                                            |
| ----------------- | ---------------------------- | ------------------------------------------------ |
| Business Rules    | `/rules/*`                   | Full CRUD + dry-run testing + status toggle      |
| Policies          | `/policies/*`                | CRUD + PDF generation/download                   |
| Tenant Settings   | `/tenant-settings/*`         | Versioned CRUD + pending change management       |
| Audit Logs        | (written inline in handlers) | Append-only; readable via Developer/Analytics    |
| Chat              | `/chat/*`                    | REST (history) + Socket.IO (real-time)           |
| AI Chatbot        | `/chatbot/message`           | SSE streaming, tool-calling loop (up to 5 iters) |
| AI Insights       | `/ai-insights`               | One-shot analytical streaming report             |
| Developer         | `/developer/*`               | Log streaming, identity verification             |
| Payments          | `/payment/*`                 | Razorpay subscription lifecycle                  |
| Tenant management | `/tenants/*`                 | Org setup, profile, tenant switching             |

---

## auth-service

**Port:** 50051  
**Proto:** `packages/proto-definitions/src/proto/auth/auth.proto`

Handles all authentication and token management operations.

### Key handlers

| Handler                         | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `getProfile`                    | Fetch user profile with all fields                     |
| `refreshToken`                  | Issue a new access token from a valid refresh token    |
| `logout`                        | Invalidate refresh token in Redis                      |
| `webAuthnRegistrationOptions`   | Generate `PublicKeyCredentialCreationOptions`          |
| `webAuthnRegistrationVerify`    | Verify attestation; persist credential to `User`       |
| `webAuthnAuthenticationOptions` | Generate `PublicKeyCredentialRequestOptions`           |
| `webAuthnAuthenticationVerify`  | Verify assertion; issue tokens                         |
| `googleOAuthCallback`           | Exchange authorization code; upsert user; issue tokens |
| `loginRiskScore`                | Compute 6-signal risk score; persist `LoginEvent`      |

### Key dependencies

- `@hrms/cache` — refresh tokens and WebAuthn challenges stored in Redis
- `@hrms/db` — reads/writes `User.webAuthnCredentials` and `LoginEvent`
- `@hrms/crypto` — JWT signing/verification

---

## user-service

**Port:** 50052  
**Proto:** `packages/proto-definitions/src/proto/user/user.proto`

Manages user account creation and account-level operations (distinct from employee profile data managed by employee-service).

---

## employee-service

**Port:** 50053  
**Proto:** `packages/proto-definitions/src/proto/employee/employee.proto`

Manages the employee profile, KYC documents, and org metadata.

### Key handlers

| Handler               | Description                                        |
| --------------------- | -------------------------------------------------- |
| `getEmployee`         | Fetch full employee record by username             |
| `updateEmployee`      | Update allowed profile fields (explicit allowlist) |
| `getAllUsers`         | Paginated user list for the current tenant         |
| `submitKyc`           | Submit identity documents for review               |
| `approveKyc`          | HR approves a KYC submission                       |
| `rejectKyc`           | HR rejects with reason                             |
| `getKycList`          | Paginated KYC submissions                          |
| `getKycInsights`      | Aggregate KYC statistics                           |
| `getEmployeeInsights` | Headcount and department distribution              |

> **Security note:** `updateEmployee` uses an explicit allowlist of field names. It never forwards `role`, `permissions`, `isSuperUser`, salary fields, or any sensitive PII from the request body.

---

## attendance-service

**Port:** 50054  
**Proto:** `packages/proto-definitions/src/proto/attendance/attendance.proto`

Tracks daily attendance. Integrates with `TenantSettings` for geofencing and late-arrival thresholds.

### Key handlers

| Handler                 | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `checkIn`               | Record check-in; validates geofence if enabled     |
| `checkOut`              | Record check-out; compute working hours            |
| `getAttendance`         | Fetch records (filterable by username, date range) |
| `requestCorrection`     | Employee submits a correction request              |
| `approveCorrection`     | HR approves or rejects a correction                |
| `getAttendanceSummary`  | Monthly summary for a specific employee            |
| `getAllAttendances`     | Paginated org-wide attendance                      |
| `getAttendanceInsights` | On-time rate, absent count, WFH stats              |

**Geofencing:** When `TenantSettings.geofencingEnabled = true`, check-in is rejected if the employee's GPS coordinates fall outside `geofenceRadiusMeters` of the office (or their designated WFH home location).

---

## leave-service

**Port:** 50055  
**Proto:** `packages/proto-definitions/src/proto/leave/leave.proto`

Manages the full leave lifecycle: application → approval/rejection → balance update.

### Leave types

Standard: Casual, Sick, Earned/Paid, Unpaid, Half-day, Compensatory.  
Custom types can be configured per org in `TenantSettings.customLeaveTypes`.

### Key handlers

| Handler                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `applyLeave`           | Submit a leave application                  |
| `getLeaveApplications` | List applications (own or all for managers) |
| `updateLeaveStatus`    | Manager approves, rejects, or withdraws     |
| `getLeaveBalance`      | Current balance for each leave type         |
| `getLeaveInsights`     | Aggregate leave statistics                  |

Leave quotas (e.g. `sickLeavesPerYear`) are read from the active `TenantSettings` row. The scheduler resets and accrues balances on the 1st of each month.

---

## recruitment-service

**Port:** 50056  
**Proto:** `packages/proto-definitions/src/proto/recruitment/recruitment.proto`

Manages open positions and the candidate pipeline.

### Key handlers

| Handler                 | Description                            |
| ----------------------- | -------------------------------------- |
| `createJobOpening`      | Create a new job posting               |
| `getJobOpenings`        | List (with status filter, pagination)  |
| `updateJobOpening`      | Edit opening details or status         |
| `deleteJobOpening`      | Remove a posting                       |
| `applyForJob`           | Public endpoint — no auth required     |
| `getJobApplications`    | List applications for a posting        |
| `scheduleInterview`     | Create an interview slot               |
| `rescheduleInterview`   | Modify interview time                  |
| `reassignInterviewer`   | Reassign the interviewing panel        |
| `hireCandidate`         | Mark as hired; optionally create user  |
| `rejectApplication`     | Mark as rejected with reason           |
| `updateCandidateStatus` | Move candidate through pipeline stages |
| `getPublicJobListings`  | Career page data — no auth required    |
| `getJobOpeningInsights` | Funnel metrics, vacancy fill rates     |

**AI resume scoring:** On application submission, an async BullMQ job is queued. A worker parses the resume PDF via `pdf-parse`, sends content to Ollama for scoring against the job description, and persists `aiScore` (0–100) and `aiNotes` on the `JobApplication`. Applications below a configurable threshold can be auto-rejected.

---

## hrm-service

**Port:** 50057  
**Proto:** `packages/proto-definitions/src/proto/hrm/hrm.proto`

General HR functions not tied to a specific transaction.

### Capabilities

- **HR Activities** — company events, announcements; status lifecycle managed by scheduler.
- **Appraisals** — performance reviews and feedback forms.
- **Holidays** — per-org holiday calendar; birthdays and work anniversaries.

---

## salary-service

**Port:** 50058  
**Proto:** `packages/proto-definitions/src/proto/salary/salary.proto`

Defines salary structures and generates payslips.

### Salary components (stored on `User`)

| Field              | Description                        |
| ------------------ | ---------------------------------- |
| `salary`           | Gross CTC                          |
| `salaryBasicPay`   | Basic pay component                |
| `salaryHra`        | House Rent Allowance               |
| `salaryConveyance` | Conveyance allowance               |
| `salaryPf`         | Provident Fund deduction           |
| `salaryEsi`        | Employee State Insurance deduction |
| `salaryPt`         | Professional Tax deduction         |

### Key handlers

| Handler                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `getSalaryStructure`    | Fetch component breakdown for an employee |
| `updateSalaryStructure` | HR updates salary components (HR only)    |
| `generatePayslip`       | Compute and persist a monthly payslip     |
| `getPayslips`           | List payslips for an employee             |
| `generateSalarySlip`    | Render and return a PDF payslip           |

---

## analytics-service

**Port:** 50059  
**Proto:** `packages/proto-definitions/src/proto/analytics/analytics.proto`

Aggregates data to power dashboard charts and KPI cards. Responses are serialised as **binary Protobuf** (`Content-Type: application/x-protobuf`) for performance on large datasets. The API gateway sets `isProto: true` on these Axios requests and the client decodes the `ArrayBuffer`.

### Analytics domains

| Dashboard   | Metrics                                                     |
| ----------- | ----------------------------------------------------------- |
| Workforce   | Headcount by department, turnover rate, new hires           |
| Attendance  | Daily present/absent/WFH/leave distribution, on-time rate   |
| Salary      | Median salary, salary bands, cost-per-department            |
| Recruitment | Open positions, applications per opening, funnel conversion |

A separate `analyticsRoutesRouter` in the gateway handles superuser-level cross-tenant analytics queries directly via `prismaWithTenant`.

---

## notification-service

**Port:** 50060  
**Proto:** `packages/proto-definitions/src/proto/notification/notification.proto`

Manages device tokens and dispatches push notifications via Firebase Cloud Messaging.

### Key handlers

| Handler                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `registerFcmToken`      | Store a device's FCM token                      |
| `sendPushNotification`  | Dispatch FCM message to a user's devices        |
| `createNotification`    | Persist an in-app notification record           |
| `getNotifications`      | Fetch in-app notifications for the current user |
| `clearNotification`     | Dismiss a single notification                   |
| `clearAllNotifications` | Dismiss all notifications for a user            |
| `disablePushNotif`      | Unregister all FCM tokens for a user            |

The scheduler-service runs `cleanupFcmTokens` nightly to remove expired or revoked device tokens.

---

## scheduler-service

**Port:** N/A — no gRPC server; workers only  
**Queue:** BullMQ on Redis

Runs background jobs on cron schedules. Also processes async jobs queued by other services (AI resume scoring, Razorpay webhook side effects, email dispatch).

### Scheduled jobs

| Job                         | Cron schedule | Runs at                | Purpose                                                              |
| --------------------------- | ------------- | ---------------------- | -------------------------------------------------------------------- |
| `updateExpiredHrActivities` | `0 1 * * *`   | 1:00 AM daily          | Mark past HR events as expired                                       |
| `updateExpiredJobOpenings`  | `0 1 * * *`   | 1:00 AM daily          | Close job postings past their application deadline                   |
| `updateEmployeeStatus`      | `15 0 * * *`  | 12:15 AM daily         | Transition employees: probation → active, pending resignation → left |
| `reconcileAttendance`       | `15 0 * * *`  | 12:15 AM daily         | Auto-mark `Absent` if no check-in recorded for previous day          |
| `updateLeaveBalance`        | `30 0 1 * *`  | 1st of month, 12:30 AM | Reset monthly leave quotas; accrue earned leave                      |
| `sendKycReminders`          | `0 9 * * *`   | 9:00 AM daily          | Email employees who haven't submitted KYC                            |
| `cleanupFcmTokens`          | `0 2 * * *`   | 2:00 AM daily          | Remove expired or revoked FCM device tokens                          |

### Async (event-driven) jobs

| Job                | Triggered by                      | Purpose                                                  |
| ------------------ | --------------------------------- | -------------------------------------------------------- |
| `parseResumeScore` | Job application submitted         | `pdf-parse` → Ollama resume scoring → persist `aiScore`  |
| `razorpayWebhook`  | Razorpay payment webhook          | Update `subscriptionStatus`, `planExpiresAt` on `Tenant` |
| `sendEmail`        | KYC reminders, login alerts, etc. | Nodemailer-based email dispatch                          |

See [Background Jobs](Background-Jobs) for queue architecture details.

---

## Adding a New Microservice

1. Create `apps/new-service/` with a standard TypeScript/Node.js structure.
2. Add `.proto` definitions in `packages/proto-definitions/src/proto/new-service/`.
3. Run `pnpm proto:gen` to generate TypeScript bindings.
4. Implement gRPC handlers using `@hrms/grpc-server`.
5. Register the gRPC client in `apps/api-gateway/src/grpc/clients.ts`.
6. Add REST routes in `apps/api-gateway/src/routes/`.
7. Add handler functions in `apps/api-gateway/src/handlers/`.
8. Update all `docker-compose*.yml` files with the new service.
9. Add the new `*_SERVICE_PORT` environment variable to `.env.example` and Deployment docs.
