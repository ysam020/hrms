# Database Schema

HRMS uses **MongoDB** accessed via **Prisma** ORM. The schema is defined in `packages/database/src/prisma/schema.prisma`. All services import the singleton Prisma client from `@hrms/db`.

---

## User

The central model — represents both a system user (for auth) and an employee.

```
User
├── id                      ObjectId
├── username                String (unique)
├── email                   String (required, unique — primary identifier)
├── official_email          String
│
├── # Personal
├── first_name              String
├── last_name               String
├── middle_name             String
├── dob                     String (DD/MM/YYYY)
├── blood_group             String
├── mobile                  String (AES-256 encrypted)
├── profile_photo           String (S3 URL)
│
├── # Employment
├── role                    String[]
├── permissions             String[]
├── isSuperUser             Boolean
├── employeeStatus          String  — Active | Resigned | Terminated | Absconded
├── designation             String
├── department              String
├── joining_date            String
├── reporting_manager       String
│
├── # KYC Documents
├── aadhar_no               String (encrypted)
├── aadhar_photo_front      String (S3 URL)
├── aadhar_photo_back       String (S3 URL)
├── pan_no                  String (encrypted)
├── pan_photo               String (S3 URL)
├── education_certificates  String[] (S3 URLs)
├── experience_certificate  String (S3 URL)
├── kycStatus               String  — Pending | Submitted | Approved | Rejected
│
├── # Permanent Address
├── permanent_address_line_1   String
├── permanent_address_line_2   String
├── permanent_address_city     String
├── permanent_address_state    String
├── permanent_address_pincode  String
│
├── # Communication Address (mirrors permanent address fields)
│
├── # Banking & Tax
├── bank_account_no         String (encrypted)
├── bank_name               String
├── ifsc_code               String
├── pf_no                   String
├── uan_no                  String
├── esic_no                 String
│
├── # Salary Components
├── salary                  Float
├── salaryBasicPay          Float
├── salaryHra               Float
├── salaryConveyance        Float
├── salaryPf                Float
├── salaryEsi               Float
├── salaryPt                Float
│
├── # Security
├── webAuthnCredentials     Json   — passkey credential objects
├── fcmTokens               Json   — FCM device token objects
├── events                  Json   — internal event log
│
├── # Relations
├── attendanceRecords       AttendanceRecord[]
├── leaveApplications       LeaveApplication[]
├── leaveBalance            LeaveBalance?
├── notifications           NotificationRecipient[]
└── salaryStructures        SalaryStructure[]
```

> Sensitive fields (`mobile`, `aadhar_no`, `pan_no`, `bank_account_no`, etc.) are encrypted with AES-256 at write time and decrypted at read time by `@hrms/crypto`. The Prisma schema stores only ciphertext.

---

## AttendanceRecord

One record per employee per day. The `@@unique([username, date])` constraint prevents duplicate entries.

| Field          | Type     | Description                                            |
| -------------- | -------- | ------------------------------------------------------ |
| `id`           | ObjectId |                                                        |
| `username`     | String   | References `User.username`                             |
| `date`         | DateTime | Calendar date (UTC midnight)                           |
| `timeIn`       | String?  | Check-in time (HH:MM format)                           |
| `timeOut`      | String?  | Check-out time (HH:MM format)                          |
| `workingHours` | Float?   | Computed on check-out                                  |
| `status`       | String?  | `Present` \| `Absent` \| `Leave` \| `WFH` \| `Holiday` |
| `isCorrected`  | Boolean  | True if HR corrected the record                        |
| `correctedBy`  | String?  | Username of the HR who corrected                       |

---

## LeaveApplication

| Field                | Type     | Description                                                  |
| -------------------- | -------- | ------------------------------------------------------------ |
| `id`                 | ObjectId |                                                              |
| `username`           | String   | Applicant                                                    |
| `from`               | String   | Leave start date                                             |
| `to`                 | String   | Leave end date                                               |
| `leaveType`          | String   | `Casual` \| `Sick` \| `Earned` \| `Unpaid` \| `Compensatory` |
| `days`               | Float    | Number of days (supports half-day = 0.5)                     |
| `status`             | String   | `Pending` \| `Approved` \| `Rejected` \| `Withdrawn`         |
| `reason`             | String?  |                                                              |
| `sickLeave`          | Boolean? | True if medical certificate required                         |
| `medicalCertificate` | String?  | S3 URL                                                       |
| `appliedOn`          | String?  |                                                              |
| `approvedByUsername` | String?  |                                                              |
| `approvedOn`         | String?  |                                                              |

---

## LeaveBalance

One record per employee. `balances` is a JSON map of leave type → available days.

| Field                             | Type            | Description                        |
| --------------------------------- | --------------- | ---------------------------------- |
| `id`                              | ObjectId        |                                    |
| `username`                        | String (unique) |                                    |
| `accumulatedPLBeforeCurrentMonth` | Float           | Privileged/Earned leave carry-over |
| `balances`                        | Json            | `{ "Casual": 10, "Sick": 5, … }`   |
| `createdAt` / `updatedAt`         | DateTime        |                                    |

---

## JobOpening

| Field                 | Type      | Description                             |
| --------------------- | --------- | --------------------------------------- |
| `id`                  | ObjectId  |                                         |
| `jobTitle`            | String    |                                         |
| `numberOfVacancies`   | Int?      |                                         |
| `jobPostingDate`      | DateTime? |                                         |
| `applicationDeadline` | DateTime  | Scheduler closes the opening after this |
| `jobDescription`      | String    |                                         |
| `requiredSkills`      | String    |                                         |
| `experience`          | Float     | Years of experience required            |
| `budget`              | Float[]   | Salary range `[min, max]`               |
| `department`          | String?   |                                         |
| `hiringManager`       | String    | Username                                |
| `candidatesHired`     | Int       |                                         |
| `status`              | String    | `Open` \| `Closed` \| `On Hold`         |
| `createdBy`           | String    | Username                                |
| `createdOn`           | DateTime? |                                         |

---

## JobApplication

| Field           | Type      | Description                                                            |
| --------------- | --------- | ---------------------------------------------------------------------- |
| `id`            | ObjectId  |                                                                        |
| `jobOpeningId`  | ObjectId  | References `JobOpening`                                                |
| `applicantName` | String    |                                                                        |
| `email`         | String    |                                                                        |
| `mobile`        | String    |                                                                        |
| `resume`        | String    | S3 URL                                                                 |
| `status`        | String    | `Applied` \| `Shortlisted` \| `Interviewed` \| `Offered` \| `Rejected` |
| `appliedOn`     | DateTime? |                                                                        |

---

## Resignation

Captures the full exit interview and off-boarding status.

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
| `fnfDone`                    | Boolean?  | Full and Final Settlement complete                     |
| `status`                     | String    | `Submitted` \| `Approved` \| `Rejected` \| `Withdrawn` |

---

## ChatRoom and Message

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

---

## Notification and NotificationRecipient

### Notification

| Field        | Type      | Description                                          |
| ------------ | --------- | ---------------------------------------------------- |
| `id`         | ObjectId  |                                                      |
| `title`      | String?   |                                                      |
| `message`    | String?   |                                                      |
| `timeStamp`  | DateTime? |                                                      |
| `eventType`  | String    | `leave_approval` \| `kyc_reminder` \| `general` \| … |
| `activityId` | String?   | Related resource ID                                  |
| `priority`   | String    | `low` \| `medium` \| `high`                          |

### NotificationRecipient

Junction table linking notifications to users.

| Field            | Type     | Description                         |
| ---------------- | -------- | ----------------------------------- |
| `id`             | ObjectId |                                     |
| `notificationId` | ObjectId |                                     |
| `userId`         | ObjectId |                                     |
| `isCleared`      | Boolean  | User has dismissed the notification |

---

## SalaryStructure

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

---

## AuditLog

Append-only log of all write actions performed via the gateway.

| Field            | Type     | Description                             |
| ---------------- | -------- | --------------------------------------- |
| `id`             | ObjectId |                                         |
| `performedBy`    | String   | Username of actor                       |
| `action`         | String   | e.g. `UPDATE_EMPLOYEE`, `APPROVE_LEAVE` |
| `targetUsername` | String?  | Subject of the action                   |
| `details`        | Json?    | Diff or payload snapshot                |
| `timestamp`      | DateTime |                                         |
| `ipAddress`      | String?  |                                         |

---

## Policy, Holiday, HrActivity, Role, Team, Rule

These models are straightforward document stores. Refer to `packages/database/src/prisma/schema.prisma` for the complete field list on each.
