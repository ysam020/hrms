# API Reference

All endpoints are served by the API gateway at `https://<host>:9002`.

**Authentication:** Protected endpoints require `Authorization: Bearer <access_token>`.  
**CSRF:** State-changing requests (POST, PUT, DELETE) require the `X-CSRF-Token` header.  
**Rate limits:** Auth endpoints — 20 req / 15 min per IP. General — 200 req / min per IP.  
**Subscription guard:** Most business endpoints require an active subscription. Expired tenants receive `HTTP 402`.

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
| POST   | `/api/refresh-token`                | Cookie | Exchange refresh token for a new access token      |
| GET    | `/api/logout`                       | JWT    | Invalidate refresh token and clear cookie          |
| GET    | `/api/profile`                      | JWT    | Get the current user's profile                     |
| GET    | `/api/webauthn-register`            | JWT    | Get credential registration options                |
| POST   | `/api/webauthn-verify-registration` | JWT    | Verify and store a new WebAuthn credential         |
| GET    | `/api/webauthn-credentials`         | JWT    | List enrolled passkey credentials                  |
| DELETE | `/api/disable-webauthn`             | JWT    | Remove all enrolled credentials                    |

---

## Tenant Management

| Method | Endpoint                              | Auth               | Description                                      |
| ------ | ------------------------------------- | ------------------ | ------------------------------------------------ |
| GET    | `/api/tenants/invite/:token`          | No                 | Resolve an invite token (pre-login landing page) |
| GET    | `/api/tenants/available`              | JWT                | List all tenants the current user belongs to     |
| POST   | `/api/tenants`                        | JWT                | Create a new organisation (pending-setup flow)   |
| POST   | `/api/tenants/complete-pending-setup` | JWT (pendingSetup) | Complete org setup after initial creation        |
| POST   | `/api/tenants/select`                 | JWT                | Switch active tenant; issues a new JWT           |
| GET    | `/api/tenants/me`                     | JWT + tenant       | Get current tenant details                       |
| POST   | `/api/tenants/complete-org-setup`     | JWT + tenant       | Mark org profile setup complete                  |
| GET    | `/api/tenants/members`                | JWT + subscription | List tenant members                              |
| POST   | `/api/tenants/invite`                 | JWT + subscription | Invite a user to the organisation                |
| DELETE | `/api/tenants/invite/:id`             | JWT + subscription | Revoke a pending invite                          |
| GET    | `/api/tenants/org-profile`            | JWT + subscription | Get org profile (name, logo, address, etc.)      |
| PUT    | `/api/tenants/org-profile`            | JWT + subscription | Update org profile                               |

---

## Payments & Billing

| Method | Endpoint                               | Auth               | Description                                             |
| ------ | -------------------------------------- | ------------------ | ------------------------------------------------------- |
| POST   | `/api/payment/create-subscription`     | JWT                | Create a Razorpay subscription for a new org            |
| GET    | `/api/payment/pending-setup`           | JWT (pendingSetup) | Check subscription activation status during setup       |
| POST   | `/api/payment/cancel-subscription`     | JWT + subscription | Schedule subscription cancellation                      |
| POST   | `/api/payment/reactivate-subscription` | JWT + subscription | Reactivate a cancelling subscription                    |
| POST   | `/api/payment/webhook`                 | Razorpay HMAC sig  | Razorpay payment event webhook (raw body, no CSRF/auth) |

---

## Tenant Settings

| Method | Endpoint                           | Auth               | Description                                        |
| ------ | ---------------------------------- | ------------------ | -------------------------------------------------- |
| GET    | `/api/tenant-settings`             | JWT + subscription | Get active settings (latest `effectiveFrom ≤ now`) |
| PUT    | `/api/tenant-settings`             | JWT + subscription | Create a new settings version (owner/admin only)   |
| DELETE | `/api/tenant-settings/pending/:id` | JWT + subscription | Cancel a pending (future-dated) settings version   |

---

## Employee Management

| Method | Endpoint                     | Auth               | Description                                  |
| ------ | ---------------------------- | ------------------ | -------------------------------------------- |
| GET    | `/api/get-all-users`         | JWT + subscription | Paginated user list for the current tenant   |
| GET    | `/api/employee-insights`     | JWT + subscription | Headcount and department statistics          |
| PUT    | `/api/edit-employee-details` | JWT + subscription | Update own employee profile fields           |
| POST   | `/api/edit-kyc`              | JWT + subscription | Submit or update KYC documents               |
| POST   | `/api/complete-kyc`          | JWT + subscription | Mark KYC submission as complete              |
| GET    | `/api/get-kyc-insights`      | JWT + subscription | KYC aggregate statistics                     |
| POST   | `/api/kyc-approval`          | JWT + subscription | Approve or reject a KYC submission (HR only) |
| GET    | `/api/view-all-kycs`         | JWT + subscription | Paginated KYC submission list                |

---

## Attendance

| Method | Endpoint                                           | Auth               | Description                             |
| ------ | -------------------------------------------------- | ------------------ | --------------------------------------- |
| POST   | `/api/add-attendance`                              | JWT + subscription | Record check-in or check-out            |
| POST   | `/api/attendance-correction`                       | JWT + subscription | Submit an attendance correction request |
| GET    | `/api/get-attendance-summary/:userId/:year/:month` | JWT + subscription | Monthly summary for a specific employee |
| GET    | `/api/get-all-attendances/:year/:month`            | JWT + subscription | Paginated org-wide attendance           |
| GET    | `/api/get-attendances/:year/:month`                | JWT + subscription | Current user's monthly attendance       |

---

## Leave Management

| Method | Endpoint                      | Auth               | Description                                      |
| ------ | ----------------------------- | ------------------ | ------------------------------------------------ |
| POST   | `/api/add-leave`              | JWT + subscription | Apply for leave                                  |
| GET    | `/api/get-leave-applications` | JWT + subscription | List applications (own or all for managers)      |
| POST   | `/api/update-leave-status`    | JWT + subscription | Approve, reject, or withdraw a leave application |

---

## Payroll

| Method | Endpoint                                         | Auth               | Description                        |
| ------ | ------------------------------------------------ | ------------------ | ---------------------------------- |
| GET    | `/api/get-user-salary/:userId/:year/:month`      | JWT + subscription | Fetch salary component breakdown   |
| PUT    | `/api/update-salary`                             | JWT + subscription | Update salary components (HR only) |
| GET    | `/api/generate-salary-slip/:userId/:year/:month` | JWT + subscription | Generate and return a PDF payslip  |

---

## Recruitment

| Method | Endpoint                       | Auth               | Description                            |
| ------ | ------------------------------ | ------------------ | -------------------------------------- |
| POST   | `/api/add-job-opening`         | JWT + subscription | Create a job opening                   |
| GET    | `/api/view-job-openings`       | JWT + subscription | List job openings (with status filter) |
| PUT    | `/api/edit-job-opening/:id`    | JWT + subscription | Update a job opening                   |
| DELETE | `/api/delete-job-opening/:id`  | JWT + subscription | Delete a job opening                   |
| POST   | `/api/apply-for-job`           | No                 | Submit a job application (public)      |
| GET    | `/api/public/careers`          | No                 | Public career listings                 |
| GET    | `/api/get-job-titles`          | JWT + subscription | List unique job titles                 |
| POST   | `/api/schedule-interview`      | JWT + subscription | Schedule an interview                  |
| POST   | `/api/reschedule-interview`    | JWT + subscription | Reschedule an interview                |
| POST   | `/api/reassign-interviewer`    | JWT + subscription | Reassign the interviewing panel        |
| POST   | `/api/hire-candidate`          | JWT + subscription | Mark candidate as hired                |
| POST   | `/api/reject-application`      | JWT + subscription | Reject an application                  |
| PUT    | `/api/update-candidate-status` | JWT + subscription | Move candidate through pipeline stages |
| GET    | `/api/job-openings-insights`   | JWT + subscription | Funnel metrics and vacancy fill rates  |

---

## HR Activities & Policies

| Method | Endpoint                      | Auth               | Description                            |
| ------ | ----------------------------- | ------------------ | -------------------------------------- |
| POST   | `/api/add-hr-activity`        | JWT + subscription | Create an HR event or announcement     |
| PUT    | `/api/edit-hr-activity/:id`   | JWT + subscription | Update an HR activity                  |
| GET    | `/api/get-hr-activities`      | JWT + subscription | Paginated HR activities list           |
| DELETE | `/api/delete-hr-activity/:id` | JWT + subscription | Delete an HR activity                  |
| POST   | `/api/policies`               | JWT + subscription | Create a policy document (owner/admin) |
| GET    | `/api/policies`               | JWT + subscription | Paginated policy list                  |
| PUT    | `/api/policies/:id`           | JWT + subscription | Update a policy document               |
| DELETE | `/api/policies/:id`           | JWT + subscription | Soft-delete a policy document          |
| GET    | `/api/policies/:id/pdf`       | JWT + subscription | Download policy as PDF                 |

---

## Business Rules

| Method | Endpoint                | Auth               | Description                            |
| ------ | ----------------------- | ------------------ | -------------------------------------- |
| GET    | `/api/rules`            | JWT + subscription | List all rules for the current tenant  |
| POST   | `/api/rules`            | JWT + subscription | Create a new rule (owner/admin)        |
| PUT    | `/api/rules/:id`        | JWT + subscription | Update a rule                          |
| DELETE | `/api/rules/:id`        | JWT + subscription | Delete a rule                          |
| PUT    | `/api/rules/:id/status` | JWT + subscription | Toggle rule status (active/inactive)   |
| POST   | `/api/rules/test`       | JWT + subscription | Dry-run test a rule without persisting |

---

## Permissions & Roles

| Method | Endpoint                           | Auth               | Description                          |
| ------ | ---------------------------------- | ------------------ | ------------------------------------ |
| GET    | `/api/get-roles`                   | JWT + subscription | List all roles                       |
| POST   | `/api/create-role`                 | JWT + subscription | Create a role (Super User)           |
| DELETE | `/api/delete-role/:id`             | JWT + subscription | Delete a role                        |
| PUT    | `/api/update-role-permissions/:id` | JWT + subscription | Update role permissions              |
| GET    | `/api/get-user-permissions/:user`  | JWT + subscription | Get effective permissions for a user |
| PUT    | `/api/save-user-permissions`       | JWT + subscription | Assign custom permissions to a user  |
| PUT    | `/api/update-superuser/:user`      | JWT + subscription | Grant/revoke superuser status        |
| POST   | `/api/add-team-members`            | JWT + subscription | Add members to a team                |
| DELETE | `/api/delete-user-role`            | JWT + subscription | Remove a role from a user            |
| GET    | `/api/get-teams`                   | JWT + subscription | List all teams                       |
| POST   | `/api/create-team`                 | JWT + subscription | Create a team                        |
| DELETE | `/api/delete-team/:id`             | JWT + subscription | Delete a team                        |
| PUT    | `/api/delete-user-from-team`       | JWT + subscription | Remove a user from a team            |

---

## Calendar, Holidays & Audit

| Method | Endpoint                         | Auth               | Description                      |
| ------ | -------------------------------- | ------------------ | -------------------------------- |
| GET    | `/api/get-holidays/:year`        | JWT + subscription | Holiday calendar for a year      |
| POST   | `/api/add-holiday`               | JWT + subscription | Add a holiday                    |
| PUT    | `/api/delete-holiday`            | JWT + subscription | Remove a holiday                 |
| GET    | `/api/get-calendar-events`       | JWT + subscription | List calendar events             |
| GET    | `/api/birthdays-anniversaries`   | JWT + subscription | Birthdays and work anniversaries |
| POST   | `/api/add-event`                 | JWT + subscription | Create a calendar event          |
| PUT    | `/api/edit-calendar-event/:id`   | JWT + subscription | Update a calendar event          |
| DELETE | `/api/delete-calendar-event/:id` | JWT + subscription | Delete a calendar event          |
| GET    | `/api/audit-logs`                | JWT + subscription | Query audit log (admin only)     |

---

## Notifications

| Method | Endpoint                          | Auth               | Description                                    |
| ------ | --------------------------------- | ------------------ | ---------------------------------------------- |
| POST   | `/api/save-fcm-token`             | JWT + subscription | Register a device's FCM token                  |
| GET    | `/api/get-notifications`          | JWT + subscription | Get in-app notifications for the current user  |
| DELETE | `/api/clear-notification/:id`     | JWT + subscription | Dismiss a single notification                  |
| DELETE | `/api/clear-all-notifications`    | JWT + subscription | Dismiss all notifications                      |
| POST   | `/api/disable-push-notifications` | JWT + subscription | Unregister all FCM tokens for the current user |

---

## Chat

| Method | Endpoint                                   | Auth               | Description                               |
| ------ | ------------------------------------------ | ------------------ | ----------------------------------------- |
| GET    | `/api/chat/conversations`                  | JWT + subscription | List chat rooms for the current user      |
| POST   | `/api/chat/conversations/start`            | JWT + subscription | Start or find a direct conversation       |
| GET    | `/api/chat/conversations/:roomId/messages` | JWT + subscription | Paginated message history                 |
| PUT    | `/api/chat/conversations/:roomId/read`     | JWT + subscription | Mark all messages as read                 |
| GET    | `/api/chat/unread-counts`                  | JWT + subscription | Unread count per room                     |
| POST   | `/api/chat/upload`                         | JWT + subscription | Upload a file attachment (SSRF-protected) |
| DELETE | `/api/chat/messages/:messageId`            | JWT + subscription | Soft-delete a message                     |
| DELETE | `/api/chat/conversations/:roomId`          | JWT + subscription | Delete a conversation (for self)          |
| GET    | `/api/og-preview`                          | JWT + subscription | Open Graph link preview (`?url=…`)        |

Real-time delivery via Socket.IO — see [Real-time Features](Real-time-Features).

---

## Resignation

| Method | Endpoint                      | Auth               | Description                                |
| ------ | ----------------------------- | ------------------ | ------------------------------------------ |
| POST   | `/api/add-resignation`        | JWT + subscription | Submit a resignation                       |
| GET    | `/api/view-resignations`      | JWT + subscription | Paginated resignations list                |
| PUT    | `/api/update-resignation/:id` | JWT + subscription | Approve, reject, or update resignation     |
| POST   | `/api/add-exit-feedback`      | JWT + subscription | Submit exit feedback / interview responses |
| GET    | `/api/resignation-insights`   | JWT + subscription | Resignation statistics                     |

---

## Face Recognition

| Method | Endpoint                     | Auth               | Description                                     |
| ------ | ---------------------------- | ------------------ | ----------------------------------------------- |
| GET    | `/api/check-face-descriptor` | JWT + subscription | Check if a face descriptor is enrolled          |
| POST   | `/api/save-face-descriptor`  | JWT + subscription | Enroll a face descriptor for biometric check-in |

---

## Analytics

| Method | Endpoint           | Auth               | Notes                                                            |
| ------ | ------------------ | ------------------ | ---------------------------------------------------------------- |
| GET    | `/api/analytics/…` | JWT + subscription | Returns binary Protobuf (`Content-Type: application/x-protobuf`) |

---

## AI Features

| Method | Endpoint               | Auth               | Description                                      |
| ------ | ---------------------- | ------------------ | ------------------------------------------------ |
| POST   | `/api/chatbot/message` | JWT + subscription | HRMS-scoped AI chatbot with tool calling (SSE)   |
| GET    | `/api/ai-insights`     | JWT + subscription | AI analytics report (`?module=…&period=…`) (SSE) |

Both endpoints stream responses as `text/event-stream`.

---

## File Uploads

| Method | Endpoint                    | Auth               | Description                                       |
| ------ | --------------------------- | ------------------ | ------------------------------------------------- |
| POST   | `/api/upload-file`          | JWT + subscription | Upload a file to S3; returns URL                  |
| POST   | `/api/upload/presigned-url` | JWT + subscription | Get a pre-signed S3 URL for direct browser upload |

---

## Developer Mode

WebAuthn identity verification required before accessing log endpoints.

| Method | Endpoint                                          | Auth      | Description                           |
| ------ | ------------------------------------------------- | --------- | ------------------------------------- |
| GET    | `/api/developer/status`                           | JWT       | Check if developer mode is active     |
| GET    | `/api/developer/verify-status`                    | JWT       | Check identity verification status    |
| POST   | `/api/developer/verify-identity`                  | JWT       | Initiate identity verification        |
| POST   | `/api/developer/verify-identity/webauthn-options` | JWT       | Get WebAuthn options for verification |
| POST   | `/api/developer/verify-identity/webauthn-verify`  | JWT       | Complete WebAuthn verification        |
| GET    | `/api/developer/logs/stream`                      | JWT + Dev | Stream live application logs (SSE)    |
| GET    | `/api/developer/logs/all`                         | JWT + Dev | Retrieve historical application logs  |

---

## Standard Response Shape

```json
// Success
{ "success": true, "data": { … } }

// Error
{ "success": false, "message": "Descriptive error", "status": 400 }

// Subscription expired
HTTP 402
{ "success": false, "message": "Subscription expired", "status": 402 }
```

Grace period headers (pass-through with warning):

```
X-Subscription-Grace-Period: true
X-Plan-Expires-At: <ISO 8601 timestamp>
```

### Common HTTP status codes

| Code  | Meaning                                    |
| ----- | ------------------------------------------ |
| `200` | Success                                    |
| `201` | Created                                    |
| `400` | Bad request / validation error             |
| `401` | Unauthenticated (missing or expired token) |
| `402` | Subscription expired                       |
| `403` | Forbidden (insufficient role/permission)   |
| `404` | Resource not found                         |
| `409` | Conflict (duplicate record)                |
| `429` | Rate limit exceeded                        |
| `500` | Internal server error                      |
