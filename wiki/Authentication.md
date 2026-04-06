# Authentication

HRMS uses an **email-first, passwordless authentication** model. Users never create a password. Instead they authenticate via WebAuthn (biometric/device passkey) or Google OAuth 2.0. A hidden admin endpoint exists for emergency recovery.

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
Issue access token (JWT) + refresh token (httpOnly cookie)
```

---

## 1. WebAuthn (Passkey)

WebAuthn allows users to authenticate using their device's biometrics (Face ID, Touch ID, Windows Hello, etc.) or a hardware security key — no password required.

### Registration

1. User must already be logged in (via Google OAuth for their first session).
2. Click "Register Passkey" in the profile/security settings.
3. Client fetches registration options: `GET /api/webauthn-register`
4. Browser shows a biometric/PIN prompt via `navigator.credentials.create()`.
5. Client sends the credential: `POST /api/webauthn-verify-registration`
6. Server verifies the signature against the challenge stored in Redis.
7. Credential is stored in `User.webAuthnCredentials` (JSON field).

### Authentication

1. User enters their email on the login page.
2. Client calls `POST /api/webauthn-credential-check` with the email.
3. If a credential is found, client fetches challenge options: `POST /api/webauthn-login-options`
4. Browser shows biometric/PIN prompt via `navigator.credentials.get()`.
5. Client sends the assertion: `POST /api/webauthn-verify-login`
6. Server verifies the challenge and signature, increments sign-count (replay prevention).
7. JWT access token + refresh token issued.

### Managing credentials

| Endpoint                        | Method        | Purpose                   |
| ------------------------------- | ------------- | ------------------------- |
| `GET /api/webauthn-credentials` | Authenticated | List enrolled credentials |
| `DELETE /api/disable-webauthn`  | Authenticated | Remove all credentials    |

---

## 2. Google OAuth 2.0

Used when no WebAuthn credential is enrolled for the email address.

### Flow

1. User enters email; no passkey found.
2. Client redirects to `POST /api/auth/google` (initiates the OAuth flow).
3. User sees Google's consent screen.
4. Google redirects to `GET /api/auth/google/callback` with an authorization code.
5. Server exchanges the code for a Google access token.
6. Server fetches the user's profile from Google (email, name, photo).
7. User is created (first time) or matched (returning) in MongoDB.
8. JWT access token + refresh token issued.

### Configuration

```
GOOGLE_CLIENT_ID      # From Google Cloud Console
GOOGLE_CLIENT_SECRET  # From Google Cloud Console
GOOGLE_CALLBACK_URL   # Must match the redirect URI registered in Google Cloud Console
                      # e.g. https://your-domain.com/api/auth/google/callback
```

---

## 4. Token Lifecycle

### Access Token (JWT)

| Property  | Value                                  |
| --------- | -------------------------------------- |
| Algorithm | HS256                                  |
| Lifetime  | 15 minutes (configurable)              |
| Storage   | In-memory only (React state)           |
| Transport | `Authorization: Bearer <token>` header |
| Payload   | `{ userId, email, role[] }`            |

The access token is **never written to `localStorage` or cookies**. It is lost on page refresh and silently renewed via the refresh token.

### Refresh Token

| Property            | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| Lifetime            | 7 days                                                       |
| Server-side storage | Redis (key: `refresh:<userId>`)                              |
| Cookie              | `httpOnly; Secure; SameSite=Strict; Path=/api/refresh-token` |
| Rotation            | New token issued on every refresh; old token deleted         |

The refresh token cookie is scoped to a single path (`/api/refresh-token`) so it is never sent with any other request.

### Token refresh flow (client-side)

```
Axios request interceptor runs
       │
       ▼
Is access token expiring within 60 seconds?
       │
  ┌────┴────┐
 Yes        No
  │          │
  ▼          ▼
POST /api/refresh-token   Attach token to request
(shared promise to          and proceed
 deduplicate concurrent
 refresh calls)
  │
  ▼
New access token received
  │
  ▼
Retry original request with new token
```

### Logout

`GET /api/logout` (authenticated)

1. Deletes the refresh token from Redis.
2. Clears the refresh token cookie.
3. Client clears the in-memory access token.

---

## 5. CSRF Protection

State-changing requests (POST, PUT, DELETE) are protected by the **double-CSRF pattern**:

1. A CSRF secret is stored in an `httpOnly` cookie.
2. A per-request CSRF token (derived from the secret) is included in `X-CSRF-Token` header.
3. The server validates the header token against the cookie secret.

This protects against cross-site request forgery because a third-party site cannot read the `httpOnly` cookie to generate a valid header token.

---

## 6. Session Security Summary

| Mechanism                 | Implementation                          |
| ------------------------- | --------------------------------------- |
| Access token storage      | In-memory (React state)                 |
| Refresh token storage     | `httpOnly` cookie + Redis               |
| CSRF protection           | Double-CSRF pattern                     |
| Cookie flags              | `httpOnly`, `Secure`, `SameSite=Strict` |
| Transport security        | HTTPS only                              |
| Rate limiting (auth)      | 20 requests / 15 minutes per IP         |
| Token rotation            | Refresh token replaced on every use     |
| Logout invalidation       | Refresh token deleted from Redis        |
| Passkey replay prevention | WebAuthn sign-count incremented per use |
