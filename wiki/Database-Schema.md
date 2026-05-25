# Database Schema

HRMS uses **MongoDB** accessed via **Prisma** ORM. The schema is defined in `packages/database/src/prisma/schema.prisma`. All services import the Prisma client via the `@hrms/db` package.

---

## Database Layout (Multi-Tenant Silo)

Every organisation gets its own dedicated MongoDB database. The master database holds only cross-tenant platform records.

```
MongoDB cluster
├── hrms-master          ← Tenant, TenantMembership, TenantInvite, User (identity only)
├── hrms-acme-corp       ← all business data for tenant "acme-corp"
├── hrms-globex          ← all business data for tenant "globex"
└── …
```

Business models (attendance, leave, salary, etc.) live exclusively in the tenant database. The `prismaWithTenant` proxy (see [Architecture Overview](Architecture-Overview)) routes each Prisma query to the correct physical database using Node.js `AsyncLocalStorage`.

---

## Master Database Models

These models exist only in `hrms-master`.

### Tenant

Represents one organisation. `dbName` is the routing key used by the connection pool.

| Field                    | Type      | Notes                                                     |
| ------------------------ | --------- | --------------------------------------------------------- |
| `id`                     | ObjectId  |                                                           |
| `name`                   | String    | Display name of the organisation                          |
| `slug`                   | String    | URL-safe unique identifier; also used to derive `dbName`  |
| `dbName`                 | String    | Unique MongoDB database name, e.g. `hrms-acme-corp`       |
| `plan`                   | String    | Billing plan identifier                                   |
| `billing`                | String?   | Billing cycle — `monthly` \| `annual`                     |
| `industry`               | String?   |                                                           |
| `companySize`            | String?   |                                                           |
| `razorpaySubscriptionId` | String?   | Razorpay subscription ID                                  |
| `subscriptionStatus`     | String    | `active` \| `grace_period` \| `cancelling` \| `expired`   |
| `planActivatedAt`        | DateTime? |                                                           |
| `planExpiresAt`          | DateTime? |                                                           |
| `paymentMethod`          | String?   | `card` \| `upi` \| `netbanking` \| `emandate` \| `wallet` |
| `paymentMethodSummary`   | String?   | Human-readable, e.g. `"Visa •••• 1111"`                   |
| `helpPhone`              | String?   |                                                           |
| `helpEmail`              | String?   |                                                           |
| `officeAddress`          | String?   |                                                           |
| `website`                | String?   |                                                           |
| `isActive`               | Boolean   |                                                           |
| `createdAt`              | DateTime  |                                                           |

### TenantMembership

Maps a `User` to the `Tenant`(s) they belong to. A user can belong to multiple tenants; switching tenants reissues the JWT.

| Field       | Type      | Notes                                                 |
| ----------- | --------- | ----------------------------------------------------- |
| `id`        | ObjectId  |                                                       |
| `tenantId`  | ObjectId  |                                                       |
| `userId`    | ObjectId  |                                                       |
| `role`      | String    | `owner` \| `admin` \| `hr` \| `manager` \| `employee` |
| `invitedBy` | ObjectId? |                                                       |
| `joinedAt`  | DateTime  |                                                       |

Composite unique: `(tenantId, userId)` — one membership record per user per org.

### TenantInvite

Pending invitation for a user who hasn't joined yet.

| Field       | Type     | Notes                          |
| ----------- | -------- | ------------------------------ |
| `id`        | ObjectId |                                |
| `tenantId`  | ObjectId |                                |
| `email`     | String   | Invitee's email                |
| `role`      | String   | Role to assign on acceptance   |
| `token`     | String   | Unique invite token (URL-safe) |
| `expiresAt` | DateTime |                                |
| `used`      | Boolean  |                                |
| `invitedBy` | ObjectId |                                |
| `createdAt` | DateTime |                                |

### User

Identity record. Exists in master DB; accessed in tenant context via `prismaWithTenant` which auto-injects `tenantId` via a Prisma `$extends` hook.

```
User
├── id                          ObjectId
├── tenantId                    ObjectId?     (auto-injected by prismaWithTenant)
├── username                    String (unique)
├── email                       String? (unique) — primary identifier
├── official_email              String?
│
├── # Personal
├── first_name / middle_name / last_name   String?
├── dob                         DateTime?
├── blood_group                 String?
├── mobile                      String?  (AES-256 encrypted)
├── profile_photo               String?  (S3 URL)
│
├── # Employment
├── role                        String[]
├── permissions                 String[]
├── isSuperUser                 Boolean  (cross-tenant admin elevation)
├── wfh                         Boolean
├── wfhHomeLatitude/Longitude   Float?   (WFH geofence anchor)
├── assets                      String[]
├── employeeStatus              String   — Active | Resigned | Terminated | Absconded
├── designation / department    String?
├── joining_date                DateTime?
├── reporting_manager           String?
│
├── # KYC Documents
├── aadhar_no / pan_no          String?  (AES-256 encrypted)
├── aadhar_photo_front/back     String?  (S3 URLs)
├── pan_photo                   String?  (S3 URL)
├── education_certificates      String[] (S3 URLs)
├── experience_certificate      String?  (S3 URL)
├── kycStatus                   String   — Pending | Submitted | Approved | Rejected
│
├── # Banking & Tax (encrypted)
├── bank_account_no             String?
├── bank_name / ifsc_code       String?
├── pf_no / uan_no / esic_no    String?
│
├── # Salary Components
├── salary                      Float?
├── salaryBasicPay / salaryHra / salaryConveyance   Float?
├── salaryPf / salaryEsi / salaryPt                 Float?
│
├── # Security
├── webAuthnCredentials         Json    — enrolled passkey credential objects
├── fcmTokens                   Json    — FCM device token objects
│
└── loginEvents                 LoginEvent[]
```

> **Encrypted fields:** `mobile`, `aadhar_no`, `pan_no`, `bank_account_no`, and related PII are encrypted with AES-256 via `@hrms/crypto` at write time and decrypted at read time. The database stores only ciphertext.

---

## Tenant Database Models

All models below reside in the per-org tenant database (`hrms-<slug>`). They carry a `tenantId` field for cross-DB auditability but are never co-mingled at query time.

### AttendanceRecord

One record per employee per day. `@@unique([username, date])` prevents duplicate entries.

| Field          | Type     | Description                                            |
| -------------- | -------- | ------------------------------------------------------ |
| `id`           | ObjectId |                                                        |
| `username`     | String   | References `User.username`                             |
| `date`         | DateTime | Calendar date (UTC midnight)                           |
| `timeIn`       | String?  | Check-in time (HH:MM)                                  |
| `timeOut`      | String?  | Check-out time (HH:MM)                                 |
| `workingHours` | Float?   | Computed on check-out                                  |
| `status`       | String?  | `Present` \| `Absent` \| `Leave` \| `WFH` \| `Holiday` |
| `isCorrected`  | Boolean  | True if HR corrected the record                        |
| `correctedBy`  | String?  | Username of the HR who corrected                       |

### LeaveApplication

| Field                | Type     | Description                                                  |
| -------------------- | -------- | ------------------------------------------------------------ |
| `id`                 | ObjectId |                                                              |
| `username`           | String   | Applicant                                                    |
| `from` / `to`        | String   | Leave date range                                             |
| `leaveType`          | String   | `Casual` \| `Sick` \| `Earned` \| `Unpaid` \| `Compensatory` |
| `days`               | Float    | Supports half-day (0.5)                                      |
| `status`             | String   | `Pending` \| `Approved` \| `Rejected` \| `Withdrawn`         |
| `reason`             | String?  |                                                              |
| `sickLeave`          | Boolean? | True when medical certificate is required per org settings   |
| `medicalCertificate` | String?  | S3 URL                                                       |
| `appliedOn`          | String?  |                                                              |
| `approvedByUsername` | String?  |                                                              |
| `approvedOn`         | String?  |                                                              |

### LeaveBalance

One record per employee. `balances` is a JSON map of leave type → available days.

| Field                             | Type            | Description                      |
| --------------------------------- | --------------- | -------------------------------- |
| `id`                              | ObjectId        |                                  |
| `username`                        | String (unique) |                                  |
| `accumulatedPLBeforeCurrentMonth` | Float           | Earned leave carry-over          |
| `balances`                        | Json            | `{ "Casual": 10, "Sick": 5, … }` |
| `createdAt` / `updatedAt`         | DateTime        |                                  |

### JobOpening

| Field                 | Type     | Description                             |
| --------------------- | -------- | --------------------------------------- |
| `id`                  | ObjectId |                                         |
| `jobTitle`            | String   |                                         |
| `numberOfVacancies`   | Int?     |                                         |
| `applicationDeadline` | DateTime | Scheduler closes the opening after this |
| `jobDescription`      | String   |                                         |
| `requiredSkills`      | String   |                                         |
| `experience`          | Float    | Years required                          |
| `budget`              | Float[]  | Salary range `[min, max]`               |
| `department`          | String?  |                                         |
| `hiringManager`       | String   | Username                                |
| `candidatesHired`     | Int      |                                         |
| `status`              | String   | `Open` \| `Closed` \| `On Hold`         |
| `createdBy`           | String   | Username                                |

### JobApplication

| Field           | Type      | Description                                                            |
| --------------- | --------- | ---------------------------------------------------------------------- |
| `id`            | ObjectId  |                                                                        |
| `jobOpeningId`  | ObjectId  | References `JobOpening`                                                |
| `applicantName` | String    |                                                                        |
| `email`         | String    |                                                                        |
| `mobile`        | String    |                                                                        |
| `resume`        | String    | S3 URL                                                                 |
| `aiScore`       | Float?    | AI resume score (0–100) from async BullMQ job                          |
| `aiNotes`       | String?   | AI evaluation notes                                                    |
| `status`        | String    | `Applied` \| `Shortlisted` \| `Interviewed` \| `Offered` \| `Rejected` |
| `appliedOn`     | DateTime? |                                                                        |

### Resignation

| Field                        | Type      | Description                                            |
| ---------------------------- | --------- | ------------------------------------------------------ |
| `id`                         | ObjectId  |                                                        |
| `username`                   | String?   |                                                        |
| `resignationDate`            | String?   | Date submitted                                         |
| `lastDate`                   | String?   | Requested last working day                             |
| `lastWorkingDay`             | DateTime? | Approved last day                                      |
| `reason`                     | String?   |                                                        |
| `overallJobSatisfaction`     | Float     | 1–5 rating                                             |
| `qualityOfCommunication`     | String?   |                                                        |
| `supportFromManager`         | String?   |                                                        |
| `collaborationWithinTheTeam` | String?   |                                                        |
| `overallCompanyCulture`      | String?   |                                                        |
| `suggestions`                | String?   |                                                        |
| `assetsReturned`             | Boolean?  |                                                        |
| `fnfDone`                    | Boolean?  | Full-and-Final Settlement complete                     |
| `status`                     | String    | `Submitted` \| `Approved` \| `Rejected` \| `Withdrawn` |

### SalaryStructure

Monthly payslip snapshot per employee.

| Field         | Type      | Description            |
| ------------- | --------- | ---------------------- |
| `id`          | ObjectId  |                        |
| `username`    | String    |                        |
| `month`       | String    | `YYYY-MM`              |
| `grossSalary` | Float     |                        |
| `basicPay`    | Float     |                        |
| `hra`         | Float     |                        |
| `conveyance`  | Float     |                        |
| `pf`          | Float     |                        |
| `esi`         | Float     |                        |
| `pt`          | Float     |                        |
| `netPayable`  | Float     | Gross minus deductions |
| `generatedOn` | DateTime? |                        |

### ChatRoom

| Field           | Type      | Description                        |
| --------------- | --------- | ---------------------------------- |
| `id`            | ObjectId  |                                    |
| `participants`  | String[]  | Usernames                          |
| `type`          | String    | `direct` \| `group`                |
| `name`          | String?   | Group name                         |
| `lastMessageId` | String?   |                                    |
| `lastActivity`  | DateTime? |                                    |
| `deletedFor`    | String[]  | Users who deleted the conversation |

### Message

| Field          | Type     | Description             |
| -------------- | -------- | ----------------------- |
| `id`           | ObjectId |                         |
| `chatRoomId`   | ObjectId | References `ChatRoom`   |
| `sender`       | String   | Username                |
| `content`      | String?  | Text content            |
| `type`         | String   | `text` \| `file`        |
| `fileUrl`      | String?  | S3 URL                  |
| `fileName`     | String?  |                         |
| `fileMimeType` | String?  |                         |
| `fileSize`     | Float?   |                         |
| `replyToId`    | String?  | Threaded reply          |
| `readBy`       | String[] | Usernames who have read |
| `isDeleted`    | Boolean  | Soft delete flag        |

### Notification / NotificationRecipient

**Notification:** Title, message, `eventType`, `priority`, timestamp.  
**NotificationRecipient:** Junction table; `isCleared` tracks dismissal per user.

### Policy

HR policy documents (e.g. leave policy, code of conduct).

| Field           | Type      | Description                                |
| --------------- | --------- | ------------------------------------------ |
| `id`            | ObjectId  |                                            |
| `tenantId`      | ObjectId? |                                            |
| `policyType`    | String    | Category tag                               |
| `policyName`    | String?   |                                            |
| `content`       | String    | Full policy text (used for PDF generation) |
| `status`        | String    | `Active` \| `Inactive`                     |
| `createdBy`     | String    | Username                                   |
| `createdOn`     | DateTime? |                                            |
| `lastUpdatedOn` | DateTime? |                                            |
| `lastUpdatedBy` | String?   |                                            |
| `deletedBy`     | String?   | Soft delete — username of deleter          |
| `deletedOn`     | DateTime? |                                            |

### Rule

Configurable HR automation rules. Conditions and actions are stored as JSON, evaluated by the rules engine.

| Field            | Type      | Description                                             |
| ---------------- | --------- | ------------------------------------------------------- |
| `id`             | ObjectId  |                                                         |
| `tenantId`       | ObjectId? |                                                         |
| `name`           | String    |                                                         |
| `category`       | String    | Domain tag (e.g. `leave`, `attendance`)                 |
| `description`    | String?   |                                                         |
| `priority`       | Int       | Evaluation order when multiple rules match              |
| `status`         | String    | `draft` \| `active` \| `inactive`                       |
| `tags`           | String[]  |                                                         |
| `conditions`     | Json?     | Array of condition objects `{ field, operator, value }` |
| `conditionLogic` | String    | `AND` \| `OR`                                           |
| `actions`        | Json?     | Array of action objects `{ type, params }`              |
| `effectiveFrom`  | DateTime? | Rule becomes active from this date                      |
| `effectiveTo`    | DateTime? | Rule expires on this date                               |
| `executionCount` | Int       | How many times the rule has fired                       |
| `lastExecuted`   | DateTime? |                                                         |
| `createdAt`      | DateTime? |                                                         |
| `updatedAt`      | DateTime? | (`@updatedAt`)                                          |

### Team

| Field          | Type       | Description            |
| -------------- | ---------- | ---------------------- |
| `id`           | ObjectId   |                        |
| `tenantId`     | ObjectId?  |                        |
| `teamName`     | String     |                        |
| `teamLeaderId` | ObjectId   | References `User.id`   |
| `members`      | ObjectId[] | References `User.id[]` |

### TenantSettings

Immutable versioned rows. The active settings = latest row where `effectiveFrom ≤ now()`. A future-dated row is a pending (scheduled) change.

| Field                    | Type      | Description                                       |
| ------------------------ | --------- | ------------------------------------------------- |
| `id`                     | ObjectId  |                                                   |
| `tenantId`               | ObjectId  |                                                   |
| `effectiveFrom`          | DateTime  | When this version activates (default: `now()`)    |
| `paidLeavesPerYear`      | Int       | Default: 12                                       |
| `sickLeavesPerYear`      | Int       | Default: 12                                       |
| `casualLeavesPerYear`    | Int       | Default: 6                                        |
| `medicalCertRequired`    | Boolean   | Require cert for sick leave                       |
| `customLeaveTypes`       | Json?     | Extra leave types beyond the standard set         |
| `workStartHour`          | Int       | 24-hour clock (default: 9)                        |
| `workStartMinute`        | Int       | Default: 0                                        |
| `lateGracePeriodMinutes` | Int       | Minutes after work-start before flagged Late (30) |
| `fullDayMinHours`        | Float     | Hours to count as a full day (default: 8)         |
| `halfDayMinHours`        | Float     | Hours to count as a half day (default: 4)         |
| `geofencingEnabled`      | Boolean   | Block check-in outside geofence radius            |
| `officeLatitude`         | Float?    | Office GPS coordinates                            |
| `officeLongitude`        | Float?    |                                                   |
| `officeName`             | String?   | Human-readable label shown to employees           |
| `geofenceRadiusMeters`   | Int       | Allowed radius in metres (default: 200)           |
| `probationPeriodDays`    | Int       | Default: 90                                       |
| `noticePeriodDays`       | Int       | Default: 30                                       |
| `createdBy`              | ObjectId? | Admin who created this version                    |
| `note`                   | String?   | Changelog note                                    |
| `createdAt`              | DateTime  |                                                   |

Composite unique: `(tenantId, effectiveFrom)` — one version per point in time.

### AuditLog

Append-only log of every write action performed via the gateway.

| Field         | Type      | Description                              |
| ------------- | --------- | ---------------------------------------- |
| `id`          | ObjectId  |                                          |
| `tenantId`    | ObjectId? |                                          |
| `userId`      | ObjectId? | Actor                                    |
| `action`      | String    | e.g. `UPDATE_EMPLOYEE`, `APPROVE_LEAVE`  |
| `entityType`  | String    | The model being mutated                  |
| `oldValue`    | Json?     | Snapshot of the record before the change |
| `newValue`    | Json?     | Snapshot of the record after the change  |
| `description` | String    |                                          |
| `ipAddress`   | String?   |                                          |
| `userAgent`   | String?   |                                          |
| `timestamp`   | DateTime? |                                          |

Indexes: `(tenantId, timestamp)`, `(tenantId, userId, timestamp)`, `(tenantId, entityType, timestamp)`.

### LoginEvent

Immutable record of every login attempt. Used for risk scoring and anomaly detection.

| Field                    | Type      | Description                                   |
| ------------------------ | --------- | --------------------------------------------- |
| `id`                     | ObjectId  |                                               |
| `tenantId`               | ObjectId? |                                               |
| `userId`                 | ObjectId  |                                               |
| `timestamp`              | DateTime  |                                               |
| `ip`                     | String    |                                               |
| `country` / `city`       | String?   | GeoIP-resolved                                |
| `latitude` / `longitude` | Float?    |                                               |
| `userAgent`              | String    |                                               |
| `deviceFingerprint`      | String    |                                               |
| `loginMethod`            | String    | `GOOGLE_OAUTH` \| `WEBAUTHN`                  |
| `userEmail`              | String?   |                                               |
| `riskScore`              | Int       | 0–100 composite score from 6 weighted signals |
| `riskReasons`            | String[]  | Triggered risk factors                        |
| `isAnomaly`              | Boolean   | True if score ≥ 50                            |

---

## Schema Change Workflow

```bash
# 1. Edit packages/database/src/prisma/schema.prisma
# 2. Regenerate the Prisma client
pnpm db:generate

# 3. Apply changes to the database (no migration file)
pnpm db:push

# 4. If the new field holds PII, add encrypt/decrypt calls in @hrms/crypto
```

The Prisma schema is the single source of truth. Do not create MongoDB indexes or collections manually — define them in the schema using `@@index` and `@@map`.
