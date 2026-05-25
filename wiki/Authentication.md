# Authentication

HRMS uses an **email-first, passwordless authentication** model combined with a **multi-tenant architecture**. Users never create a password. Authentication uses WebAuthn (biometric/device passkey) or Google OAuth 2.0. A single user account can belong to multiple organisations and switch between them.

---

## Login Flow

```
User enters email
       │
       ▼
Does a WebAuthn credential exist for this email?
       │
  ┌────┴────┐
 Yes        No
  │          │
  ▼          ▼
WebAuthn   Google OAuth 2.0
challenge  redirect
  │          │
  └────┬─────┘
       │
       ▼
Is this the user's first login (no tenant yet)?
       │
  ┌────┴────────────────┐
 Yes (new user)         No (returning user)
  │                      │
  ▼                      ▼
pendingSetup JWT        Multi-tenant check:
(org setup flow)        Does user belong to > 1 tenant?
                              │
                        ┌─────┴──────┐
                        Yes          No
                        │             │
                        ▼             ▼
                 Tenant selector  Full JWT issued
                 screen           (single active tenant)
                        │
                        ▼
                 POST /tenants/select
                        │
                        ▼
                 Full JWT with chosen tenant context
```

---

## 1. WebAuthn (Passkeys)

WebAuthn allows users to authenticate using their device's biometrics (Face ID, Touch ID, Windows Hello) or a hardware security key — no password required.

### Registration

1. User must already be authenticated (via Google OAuth for first session).
2. Click "Register Passkey" in profile/security settings.
3. Client calls `GET /api/webauthn-register` to receive `PublicKeyCredentialCreationOptions`.
4. Browser prompts biometric/PIN via `navigator.credentials.create()`.
5. Client sends the credential: `POST /api/webauthn-verify-registration`.
6. Server verifies the attestation against the challenge stored in Redis.
7. Credential stored in `User.webAuthnCredentials` (JSON array).

### Authentication

1. User enters email on the login page.
2. Client calls `POST /api/webauthn-credential-check` → returns `hasCredential: true/false`.
3. If found: client calls `POST /api/webauthn-login-options` for a challenge.
4. Browser prompts biometric/PIN via `navigator.credentials.get()`.
5. Client sends the assertion: `POST /api/webauthn-verify-login`.
6. Server verifies the challenge and signature; increments sign-count (replay prevention).
7. JWT access token + refresh token issued.

### Managing Credentials

| Endpoint                            | Method | Auth | Purpose                   |
| ----------------------------------- | ------ | ---- | ------------------------- |
| `/api/webauthn-credentials`         | GET    | JWT  | List enrolled credentials |
| `/api/disable-webauthn`             | DELETE | JWT  | Remove all credentials    |
| `/api/webauthn-verify-registration` | POST   | JWT  | Enroll a new credential   |

---

## 2. Google OAuth 2.0

Used when no WebAuthn credential is enrolled.

### Flow

1. User enters email; no passkey found.
2. Client calls `POST /api/auth/google` → redirects to Google consent screen.
3. Google redirects to `GET /api/auth/google/callback` with an authorization code.
4. Server exchanges code for Google access token; fetches user profile.
5. User created (first time) or matched (returning) in master MongoDB.
6. If user has no tenant → `pendingSetup: true` JWT issued.
7. If user has one tenant → full JWT issued.
8. If user has multiple tenants → full JWT issued; client shows tenant selector.

### Configuration

```
GOOGLE_CLIENT_ID       # From Google Cloud Console
GOOGLE_CLIENT_SECRET   # From Google Cloud Console
GOOGLE_CALLBACK_URL    # Must match Google Console redirect URI
                       # e.g. https://your-domain.com/api/auth/google/callback
```

---

## 3. Pending Setup Flow

New users who have authenticated but haven't created an organisation yet receive a **pending-setup JWT** — a limited-scope token that can only access org-setup endpoints.

```
pendingSetup JWT payload: { userId, pendingSetup: true }

Allowed endpoints:
  POST /api/tenants/complete-org-setup   — create the org
  GET  /api/payment/pending-setup        — check payment status

All business routes are blocked by requireTenant middleware:
  if (req.user.pendingSetup) return 403
```

Once the org is created and the Razorpay subscription is confirmed, the auth service issues a full JWT replacing the pending-setup token.

---

## 4. Multi-Tenant User Context

A user can belong to multiple organisations. Each JWT carries the **active** tenant context.

### JWT payload (full, after org selection)

```json
{
  "userId": "...",
  "tenantId": "...",
  "tenantRole": "admin",
  "dbName": "hrms-acme-corp",
  "email": "...",
  "iat": ...,
  "exp": ...
}
```

### Switching tenants

```
POST /api/tenants/select   { tenantId: "..." }
```

The server verifies the user is a member of the target tenant, then issues a new JWT with the selected tenant's context. All subsequent requests use the new tenant's database.

### Tenant memberships

`TenantMembership` in the master DB tracks which users belong to which tenants and their role within each. A user can be an `admin` in one org and an `employee` in another.

---

## 5. Superuser Concept

`User.isSuperUser = true` grants cross-tenant administrative privileges. Superusers can:

- Access analytics across tenants.
- Perform platform-level operations not tied to a specific org.
- Access certain endpoints that reject ordinary `admin` roles.

Superuser status is set directly in the database and is **not** a role that can be assigned via the UI.

---

## 6. Token Lifecycle

### Access Token (JWT)

| Property  | Value                                   |
| --------- | --------------------------------------- |
| Algorithm | HS256                                   |
| Lifetime  | 15 minutes                              |
| Storage   | In-memory only (React state)            |
| Transport | `Authorization: Bearer <token>` header  |
| Payload   | `{ userId, tenantId, dbName, role, … }` |

The access token is **never written to `localStorage` or cookies**. It is lost on page refresh and silently renewed via the refresh token.

### Refresh Token

| Property            | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| Lifetime            | 7 days                                                       |
| Server-side storage | Redis (key: `refresh:<userId>`)                              |
| Cookie              | `httpOnly; Secure; SameSite=Strict; Path=/api/refresh-token` |
| Rotation            | New token issued on every refresh; old token invalidated     |

The refresh cookie is scoped to a single path so it is never sent on any other request.

### Client-Side Refresh Flow

```
Axios request interceptor
       │
       ▼
Token expiring within 60 seconds?
       │
  ┌────┴────┐
 Yes        No
  │          │
  ▼          ▼
POST /api/refresh-token        Attach current token
(deduplicated promise —        and proceed
 only one inflight at a time)
  │
  ▼
New access token received
  │
  ▼
Update in-memory store + retry original request
```

On `401 Unauthorized`: same flow, then retry once. If refresh fails, redirect to `/login`.

### Logout

`GET /api/logout` (authenticated):

1. Deletes the refresh token from Redis.
2. Clears the refresh token cookie.
3. Invalidates the CSRF token.
4. Client clears in-memory access token.

---

## 7. CSRF Protection

State-changing requests (POST, PUT, DELETE) are protected by the **double-CSRF double-submit pattern**:

1. A CSRF secret is stored in an `httpOnly` cookie (`csrf-secret`).
2. A per-request CSRF token derived from the secret is included in the `X-CSRF-Token` header.
3. The server validates the header token against the cookie secret.

A third-party site cannot read the `httpOnly` cookie to derive a valid header token, preventing CSRF attacks.

**Client behaviour:** The Axios interceptor lazily fetches the CSRF token on the first state-changing request and caches it. Concurrent requests share a single fetch promise (no duplicate calls). The token is invalidated and re-fetched on logout or 403 response.

---

## 8. Login Risk Scoring

Every successful login generates a `LoginEvent` record with a composite risk score built from 6 weighted signals:

| Signal                          | Points |
| ------------------------------- | ------ |
| New device fingerprint          | 15     |
| New country                     | 20     |
| New city                        | 10     |
| Unusual login hour (2 AM–5 AM)  | 10     |
| New login method                | 10     |
| Multiple failed attempts before | 15     |

| Total score | Action                                       |
| ----------- | -------------------------------------------- |
| < 30        | No action                                    |
| ≥ 30        | Alert email sent to user                     |
| ≥ 50        | `isAnomaly = true`; suspicious sign-in email |

Risk scores are stored on `LoginEvent` and queryable through the Developer/Security dashboard.

---

## 9. Security Summary

| Mechanism                 | Implementation                                       |
| ------------------------- | ---------------------------------------------------- |
| Access token storage      | In-memory (React state)                              |
| Refresh token storage     | `httpOnly` cookie + Redis                            |
| CSRF protection           | Double-CSRF pattern                                  |
| Cookie flags              | `httpOnly`, `Secure`, `SameSite=Strict`              |
| Transport security        | HTTPS only                                           |
| Rate limiting (auth)      | 20 requests / 15 minutes per IP                      |
| Token rotation            | Refresh token replaced on every use                  |
| Logout invalidation       | Refresh token deleted from Redis                     |
| Passkey replay prevention | WebAuthn sign-count incremented per use              |
| Tenant isolation          | `dbName` in JWT; AsyncLocalStorage routes DB queries |
| Pending setup protection  | `requireTenant` blocks all business routes           |
| Login anomaly detection   | 6-signal risk score on every login                   |
