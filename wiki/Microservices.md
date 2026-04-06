# Microservices

All backend logic is split across independent gRPC microservices. The API gateway is the only public-facing service; all others are internal and communicate via gRPC on localhost.

---

## Service Map

| Service                                       | gRPC Port | Domain                                  |
| --------------------------------------------- | --------- | --------------------------------------- |
| [auth-service](#auth-service)                 | 50051     | Authentication, tokens, passkeys, OAuth |
| [user-service](#user-service)                 | 50052     | User accounts                           |
| [employee-service](#employee-service)         | 50053     | Employee profiles, KYC, org             |
| [attendance-service](#attendance-service)     | 50054     | Check-in/out, reports                   |
| [leave-service](#leave-service)               | 50055     | Leave applications, approvals, balance  |
| [recruitment-service](#recruitment-service)   | 50056     | Job openings, applications, interviews  |
| [hrm-service](#hrm-service)                   | 50057     | Appraisals, policies, HR activities     |
| [salary-service](#salary-service)             | 50058     | Salary structures, payslips             |
| [analytics-service](#analytics-service)       | 50059     | Business analytics dashboards           |
| [notification-service](#notification-service) | 50060     | FCM tokens, push notifications          |
| [scheduler-service](#scheduler-service)       | —         | Background BullMQ jobs                  |

---

## auth-service

**Port:** 50051  
**Proto:** `packages/proto-definitions/src/proto/auth/auth.proto`

Responsible for all authentication and token management operations.

### Handlers

| Handler                         | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `getProfile`                    | Fetch user profile with all fields                  |
| `refreshToken`                  | Issue a new access token from a valid refresh token |
| `logout`                        | Invalidate refresh token in Redis                   |
| `webAuthnRegistrationOptions`   | Generate credential creation options                |
| `webAuthnRegistrationVerify`    | Verify credential and persist to User model         |
| `webAuthnAuthenticationOptions` | Generate authentication challenge                   |
| `webAuthnAuthenticationVerify`  | Verify assertion and issue tokens                   |
| `googleOAuthCallback`           | Exchange authorization code for tokens; upsert user |

### Key dependencies

- `@hrms/cache` — stores refresh tokens and WebAuthn challenges in Redis
- `@hrms/db` — reads/writes `User.webAuthnCredentials`
- `@hrms/crypto` — JWT signing/verification

---

## user-service

**Port:** 50052  
**Proto:** `packages/proto-definitions/src/proto/user/user.proto`

Manages user account creation and account-level operations (distinct from employee-level profile data).

---

## employee-service

**Port:** 50053  
**Proto:** `packages/proto-definitions/src/proto/employee/employee.proto`

Manages the employee profile, KYC documents, and organizational structure.

### Handlers

| Handler               | Description                                        |
| --------------------- | -------------------------------------------------- |
| `getEmployee`         | Fetch full employee record by username             |
| `updateEmployee`      | Update allowed profile fields (allowlist approach) |
| `submitKyc`           | Submit identity documents for verification         |
| `approveKyc`          | HR approves a KYC submission                       |
| `rejectKyc`           | HR rejects with reason                             |
| `getKycList`          | Paginated list of KYC submissions                  |
| `getKycInsights`      | Aggregate KYC statistics                           |
| `getEmployeeInsights` | Headcount, department distribution                 |

### Security note

The `updateEmployee` handler uses an explicit allowlist of field names — it never forwards `role`, `permissions`, `isSuperUser`, or any salary fields from the request body.

---

## attendance-service

**Port:** 50054  
**Proto:** `packages/proto-definitions/src/proto/attendance/attendance.proto`

Tracks daily attendance for all employees.

### Core model

```protobuf
message AttendanceRecord {
  string username     = 1;
  string date         = 2;
  string timeIn       = 3;
  string timeOut      = 4;
  float  workingHours = 5;
  string status       = 6;   // Present | Absent | Leave | WFH
  bool   isCorrected  = 7;
  string correctedBy  = 8;
}
```

### Handlers

| Handler                 | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `checkIn`               | Record check-in time for today                     |
| `checkOut`              | Record check-out time and compute working hours    |
| `getAttendance`         | Fetch records (filterable by username, date range) |
| `requestCorrection`     | Employee submits a correction request              |
| `getAttendanceInsights` | On-time rate, absent count, WFH stats              |

---

## leave-service

**Port:** 50055  
**Proto:** `packages/proto-definitions/src/proto/leave/leave.proto`

Manages the full leave lifecycle: application → approval/rejection → balance update.

### Leave types

Casual, Sick, Earned, Unpaid, Half-day, Compensatory

### Handlers

| Handler                        | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `applyLeave`                   | Submit a leave application                  |
| `getLeaveApplications`         | List applications (own or all for managers) |
| `updateLeaveApplication`       | Edit a pending application                  |
| `withdrawLeave`                | Withdraw before approval                    |
| `approveLeave` / `rejectLeave` | Manager approves or rejects                 |
| `getLeaveBalance`              | Current balance for each leave type         |
| `getLeaveInsights`             | Aggregate leave statistics                  |

---

## recruitment-service

**Port:** 50056  
**Proto:** `packages/proto-definitions/src/proto/recruitment/recruitment.proto`

Manages open positions and the candidate pipeline.

### Handlers

| Handler                | Description                           |
| ---------------------- | ------------------------------------- |
| `createJobOpening`     | Create a new job posting              |
| `getJobOpenings`       | List (with status filter, pagination) |
| `updateJobOpening`     | Edit opening details or status        |
| `submitJobApplication` | Public endpoint — no auth required    |
| `getJobApplications`   | List applications for a posting       |
| `scheduleInterview`    | Create an interview slot              |
| `getPublicJobListings` | Career page data — no auth required   |

---

## hrm-service

**Port:** 50057  
**Proto:** `packages/proto-definitions/src/proto/hrm/hrm.proto`

Covers general HR functions not tied to a specific transaction (attendance, leave, payroll).

### Capabilities

- **HR Activities** — company events, announcements
- **Appraisals** — performance reviews, feedback forms
- **Policies** — upload and distribute company policy documents
- **Business Rules** — configurable rules engine for HR workflows

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

### Handlers

| Handler                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `getSalaryStructure`    | Fetch component breakdown for an employee |
| `updateSalaryStructure` | HR updates salary components              |
| `generatePayslip`       | Compute and persist a monthly payslip     |
| `getPayslips`           | List payslips for an employee             |

---

## analytics-service

**Port:** 50059  
**Proto:** `packages/proto-definitions/src/proto/analytics/analytics.proto`

Aggregates data across other services to power dashboard charts and KPI cards.

### Analytics domains

| Dashboard   | Metrics                                                     |
| ----------- | ----------------------------------------------------------- |
| Workforce   | Headcount by department, turnover rate, new hires           |
| Attendance  | Daily present/absent/WFH/leave, on-time rate                |
| Salary      | Median salary, salary bands, cost by department             |
| Recruitment | Open positions, applications per opening, funnel conversion |

---

## notification-service

**Port:** 50060  
**Proto:** `packages/proto-definitions/src/proto/notification/notification.proto`

Manages device tokens and dispatches push notifications via Firebase Cloud Messaging (FCM).

### Handlers

| Handler                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `registerFcmToken`     | Store a device's FCM token                      |
| `sendPushNotification` | Dispatch FCM message to a user's devices        |
| `createNotification`   | Persist an in-app notification record           |
| `getNotifications`     | Fetch in-app notifications for the current user |
| `markAsRead`           | Clear notification for a user                   |

### FCM token cleanup

The scheduler-service runs `cleanupFcmTokens` nightly to remove expired or revoked device tokens.

---

## scheduler-service

**Port:** N/A (no gRPC server — workers only)  
**Queue:** BullMQ on Redis

Runs background jobs on cron schedules using BullMQ.

### Scheduled jobs

| Job                         | Schedule     | Time                   | Purpose                                                        |
| --------------------------- | ------------ | ---------------------- | -------------------------------------------------------------- |
| `updateExpiredHrActivities` | `0 1 * * *`  | 1:00 AM                | Mark past HR events as expired                                 |
| `updateExpiredJobOpenings`  | `0 1 * * *`  | 1:00 AM                | Close job postings past deadline                               |
| `updateEmployeeStatus`      | `15 0 * * *` | 12:15 AM               | Transition employees (onboarding → active, resignation → left) |
| `reconcileAttendance`       | `15 0 * * *` | 12:15 AM               | Auto-mark absent if no check-in recorded                       |
| `updateLeaveBalance`        | `30 0 1 * *` | 1st of month, 12:30 AM | Reset and accrue monthly leave balance                         |
| `sendKycReminders`          | `0 9 * * *`  | 9:00 AM                | Email employees who haven't completed KYC                      |
| `cleanupFcmTokens`          | `0 2 * * *`  | 2:00 AM                | Remove expired push notification device tokens                 |

See [Background Jobs](Background-Jobs) for queue architecture details.

---

## Adding a New Microservice

1. Create `apps/new-service/` with a standard TypeScript/Node.js structure.
2. Add `.proto` definitions in `packages/proto-definitions/src/proto/new-service/`.
3. Run `pnpm proto:gen` to generate TypeScript bindings.
4. Implement gRPC handlers using `@hrms/grpc-server`.
5. Register the service in `apps/api-gateway/src/grpc/clients.ts`.
6. Add REST routes in `apps/api-gateway/src/routes/`.
7. Add handler functions in `apps/api-gateway/src/handlers/`.
8. Update all `docker-compose*.yml` files with the new service.
