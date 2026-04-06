# API Reference

All endpoints are served by the API gateway at `https://<host>:9002`.

**Authentication:** Protected endpoints require `Authorization: Bearer <access_token>` in the request header.  
**CSRF:** State-changing requests (POST, PUT, DELETE) require the `X-CSRF-Token` header.  
**Rate limits:** Auth endpoints — 20 req / 15 min per IP. General — 200 req / min per IP. Public — 50 req / 15 min per IP.

Interactive documentation: `https://localhost:9002/api-docs` (Swagger UI)

---

## Authentication

| Method | Endpoint                            | Auth   | Description                                        |
| ------ | ----------------------------------- | ------ | -------------------------------------------------- |
| POST   | `/api/auth/google`                  | No     | Initiate Google OAuth flow                         |
| GET    | `/api/auth/google/callback`         | No     | OAuth callback — exchanges code for tokens         |
| POST   | `/api/webauthn-credential-check`    | No     | Check if a WebAuthn credential exists for an email |
| POST   | `/api/webauthn-login-options`       | No     | Generate WebAuthn authentication challenge         |
| POST   | `/api/webauthn-verify-login`        | No     | Verify WebAuthn assertion and issue tokens         |
| GET    | `/api/profile`                      | JWT    | Get the current user's profile                     |
| POST   | `/api/refresh-token`                | Cookie | Exchange refresh token for a new access token      |
| GET    | `/api/logout`                       | JWT    | Invalidate refresh token and clear cookie          |
| GET    | `/api/webauthn-register`            | JWT    | Get credential registration options                |
| POST   | `/api/webauthn-verify-registration` | JWT    | Verify and store a new WebAuthn credential         |
| GET    | `/api/webauthn-credentials`         | JWT    | List enrolled passkey credentials                  |
| DELETE | `/api/disable-webauthn`             | JWT    | Remove all enrolled credentials                    |

---

## Employee Management

| Method | Endpoint                  | Auth | Description                                  |
| ------ | ------------------------- | ---- | -------------------------------------------- |
| GET    | `/api/employee/:username` | JWT  | Fetch an employee's profile                  |
| PUT    | `/api/employee`           | JWT  | Update own employee profile fields           |
| POST   | `/api/kyc`                | JWT  | Submit KYC documents                         |
| PUT    | `/api/kyc`                | JWT  | Update an existing KYC submission            |
| POST   | `/api/kyc-approval`       | JWT  | Approve or reject a KYC submission (HR only) |
| GET    | `/api/kyc-list`           | JWT  | Paginated list of all KYC submissions        |
| GET    | `/api/kyc-insights`       | JWT  | KYC aggregate statistics                     |
| GET    | `/api/employee-insights`  | JWT  | Headcount and department statistics          |

---

## Attendance

| Method | Endpoint                     | Auth | Description                                         |
| ------ | ---------------------------- | ---- | --------------------------------------------------- |
| POST   | `/api/attendance/checkin`    | JWT  | Record today's check-in                             |
| POST   | `/api/attendance/checkout`   | JWT  | Record today's check-out                            |
| GET    | `/api/attendance`            | JWT  | Fetch attendance records (filterable by date range) |
| POST   | `/api/attendance-correction` | JWT  | Submit an attendance correction request             |
| GET    | `/api/attendance-insights`   | JWT  | On-time rate, absent count, WFH statistics          |

---

## Leave Management

| Method | Endpoint              | Auth | Description                                       |
| ------ | --------------------- | ---- | ------------------------------------------------- |
| POST   | `/api/leave`          | JWT  | Apply for leave                                   |
| GET    | `/api/leave`          | JWT  | List leave applications (own or all for managers) |
| PUT    | `/api/leave/:id`      | JWT  | Update a pending leave application                |
| DELETE | `/api/leave/:id`      | JWT  | Withdraw a leave application                      |
| POST   | `/api/leave-approval` | JWT  | Approve or reject a leave application             |
| GET    | `/api/leave-balance`  | JWT  | Check leave balance by type                       |
| GET    | `/api/leave-insights` | JWT  | Aggregate leave statistics                        |

---

## Payroll

| Method | Endpoint                          | Auth | Description                        |
| ------ | --------------------------------- | ---- | ---------------------------------- |
| GET    | `/api/salary-structure/:username` | JWT  | Fetch salary component breakdown   |
| PUT    | `/api/salary-structure`           | JWT  | Update salary components (HR only) |
| POST   | `/api/payslip`                    | JWT  | Generate a payslip for a month     |
| GET    | `/api/payslip`                    | JWT  | List payslips for an employee      |

---

## Recruitment

| Method | Endpoint                       | Auth | Description                              |
| ------ | ------------------------------ | ---- | ---------------------------------------- |
| POST   | `/api/job-openings`            | JWT  | Create a job opening                     |
| GET    | `/api/job-openings`            | JWT  | List job openings (with status filter)   |
| PUT    | `/api/job-openings/:id`        | JWT  | Update a job opening                     |
| DELETE | `/api/job-openings/:id`        | JWT  | Close or delete a job opening            |
| GET    | `/api/job-applications/:jobId` | JWT  | List applications for a specific opening |
| POST   | `/api/interviews`              | JWT  | Schedule an interview                    |
| GET    | `/api/public/careers`          | No   | Public career listings (no auth)         |
| POST   | `/api/job-applications`        | No   | Submit a job application (no auth)       |

---

## HR Activities & Policies

| Method | Endpoint             | Auth | Description                           |
| ------ | -------------------- | ---- | ------------------------------------- |
| GET    | `/api/hr-activities` | JWT  | List HR events and announcements      |
| POST   | `/api/hr-activities` | JWT  | Create an HR activity                 |
| GET    | `/api/policies`      | JWT  | List company policy documents         |
| POST   | `/api/policies`      | JWT  | Upload a policy document (Super User) |
| GET    | `/api/holidays`      | JWT  | Holiday calendar                      |

---

## Chat

| Method | Endpoint                     | Auth | Description                               |
| ------ | ---------------------------- | ---- | ----------------------------------------- |
| GET    | `/api/conversations`         | JWT  | List chat rooms for the current user      |
| GET    | `/api/conversations/:roomId` | JWT  | Fetch messages in a chat room (paginated) |
| POST   | `/api/messages`              | JWT  | Send a message                            |
| DELETE | `/api/messages/:messageId`   | JWT  | Delete a message                          |
| POST   | `/api/file-upload`           | JWT  | Upload a file attachment (SSRF-protected) |

Real-time events are delivered via Socket.IO (see [Real-time Features](Real-time-Features)).

---

## Notifications

| Method | Endpoint                 | Auth | Description                                   |
| ------ | ------------------------ | ---- | --------------------------------------------- |
| POST   | `/api/fcm-token`         | JWT  | Register a device's FCM token                 |
| GET    | `/api/notifications`     | JWT  | Get in-app notifications for the current user |
| PUT    | `/api/notifications/:id` | JWT  | Mark a notification as cleared                |

---

## Permissions & Roles

| Method | Endpoint           | Auth             | Description                        |
| ------ | ------------------ | ---------------- | ---------------------------------- |
| GET    | `/api/roles`       | JWT              | List all roles                     |
| POST   | `/api/roles`       | JWT + Super User | Create a role                      |
| PUT    | `/api/roles/:id`   | JWT + Super User | Update a role                      |
| GET    | `/api/permissions` | JWT              | Get the current user's permissions |
| POST   | `/api/team`        | JWT              | Create a team                      |
| PUT    | `/api/team/:id`    | JWT              | Update a team                      |
| GET    | `/api/rules`       | JWT              | List business rules                |
| POST   | `/api/rules`       | JWT + Super User | Create a business rule             |

---

## Analytics

| Method | Endpoint                     | Auth | Description                               |
| ------ | ---------------------------- | ---- | ----------------------------------------- |
| GET    | `/api/analytics/employees`   | JWT  | Workforce analytics (headcount, turnover) |
| GET    | `/api/analytics/attendance`  | JWT  | Attendance analytics (daily breakdown)    |
| GET    | `/api/analytics/salary`      | JWT  | Salary analytics (median, distribution)   |
| GET    | `/api/analytics/recruitment` | JWT  | Recruitment funnel metrics                |

---

## Admin

| Method | Endpoint           | Auth             | Description                               |
| ------ | ------------------ | ---------------- | ----------------------------------------- |
| POST   | `/api/broadcast`   | JWT + Super User | Send a broadcast message to all employees |
| GET    | `/api/audit-logs`  | JWT + Super User | Paginated audit trail                     |
| POST   | `/api/admin-login` | None             | Emergency admin login (hidden, not in UI) |

---

## Standard Response Shape

All endpoints return a consistent JSON envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable message"
}
```

Error responses:

```json
{
  "success": false,
  "message": "Descriptive error message",
  "status": 400
}
```

### Common HTTP status codes

| Code  | Meaning                                    |
| ----- | ------------------------------------------ |
| `200` | Success                                    |
| `201` | Created                                    |
| `400` | Bad request / validation error             |
| `401` | Unauthenticated (missing or expired token) |
| `403` | Forbidden (insufficient role/permission)   |
| `404` | Resource not found                         |
| `429` | Rate limit exceeded                        |
| `500` | Internal server error                      |
