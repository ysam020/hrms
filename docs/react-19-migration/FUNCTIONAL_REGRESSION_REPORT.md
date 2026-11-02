# Functional Regression Report

**Environment:** both production builds (React 18 baseline and the React 19 branch) served locally. `/api/v1/*` is answered by fictional fixtures inside the browser. Socket.IO runs against a real Socket.IO 4.8.3 server attached to the static server. Passkeys use Chromium's virtual authenticator, with the fixture server **cryptographically verifying** each assertion. No backend, database, Redis or queue was contacted: the local gateway uses the production database, so it was deliberately not used.

**Result:** every flow behaves identically on React 18 and React 19, except two pre-existing bugs that this branch fixes intentionally.

## Cross-cutting flows

| Flow                                                                                                                                                                                                              | React 18                                           | React 19 branch  | Status                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| Session boot: refresh-cookie exchange with CSRF, profile with bearer token                                                                                                                                        | ✔                                                  | ✔                | Same                                                       |
| Access token never in web storage                                                                                                                                                                                 | ✔                                                  | ✔                | Same                                                       |
| 401 on a list → one refresh → retry → rows shown                                                                                                                                                                  | ✔ (2 list calls, 6 rows)                           | ✔                | Same                                                       |
| Refresh refused → signed out → `/login`                                                                                                                                                                           | ✔                                                  | ✔                | Same                                                       |
| 402 subscription lapsed → `/subscription` (owner)                                                                                                                                                                 | ✔                                                  | ✔                | Same                                                       |
| Approve leave: `PUT /update-leave-status {leaveId, action}` with `x-csrf-token` and `Idempotency-Key`                                                                                                             | ✔                                                  | ✔                | Same                                                       |
| Expired session → `/login` keeps the return path                                                                                                                                                                  | ✔                                                  | ✔                | Same                                                       |
| **Deliberate sign-out → `/login` with no return path**                                                                                                                                                            | ✘ kept `from: /attendance/view-leave-applications` | ✔ none           | **Fixed** (bug in the original)                            |
| **Superseded slow list response ignored** (filter Pending → Approved)                                                                                                                                             | ✘ showed Pending rows under "Approved"             | ✔ shows Approved | **Fixed** (bug in the original)                            |
| Unknown route → Not Found                                                                                                                                                                                         | ✔                                                  | ✔                | Same (no fix needed)                                       |
| Passkey sign-in: options → `navigator.credentials.get` → verify (challenge, origin, ECDSA signature valid) → temp-token login → `/dashboard`                                                                      | ✔                                                  | ✔                | Same                                                       |
| Socket.IO: connects with the access token; live `notification` raises the badge 2 → 3 and appears in the panel; server drop → reconnect → notifications refetched; max 1 concurrent connection                    | ✔                                                  | ✔                | Same                                                       |
| PWA: worker active and controlling, 169 precached entries, offline reload renders the dashboard in offline mode                                                                                                   | ✔                                                  | ✔                | Same (pixel-identical)                                     |
| Face punch: Punch In → camera stream (synthetic device) → WASM face-math loaded → face-api weights requested → detection rejects the synthetic feed ("Face not consistently detected") → closing stops the camera | ✔                                                  | ✔                | Same; **successful** recognition not testable here         |
| Hidden sidebar is `inert`                                                                                                                                                                                         | ✔                                                  | ✔ (after fix)    | **React 19 regression found and fixed**                    |
| Exiting overlays (`Presence`) are `inert`                                                                                                                                                                         | ✔                                                  | ✔ (after fix)    | **React 19 regression found and fixed** (failed unit test) |

## Feature areas (34)

`V` visual (3 viewports), `I` interactive state, `F` functional flow, `U` unit/integration tests in the repo. "Empty" means the fixtures returned no rows, so layout and empty states were compared but not populated data.

| #   | Area                         | Coverage             | Notes                                                              |
| --- | ---------------------------- | -------------------- | ------------------------------------------------------------------ |
| 1   | Analytics                    | V (empty)            | Charts with no data                                                |
| 2   | Announcements                | V (empty)            |                                                                    |
| 3   | Approvals                    | V                    | Pending-approvals badge in the shell                               |
| 4   | Assets                       | V (empty) ×2         |                                                                    |
| 5   | AI assistants                | V (empty), U         |                                                                    |
| 6   | Attendance                   | V ×4, F (face punch) | Refactored module; JSX unchanged                                   |
| 7   | Leave                        | V ×2, I ×3, F ×3, U  | Refactored into service + rules; stale-response fix                |
| 8   | Audit log                    | V (empty)            |                                                                    |
| 9   | Auth / session               | V, I, F ×9, U        | Google OAuth round-trip not tested (external)                      |
| 10  | Calendar                     | V (empty)            |                                                                    |
| 11  | Chat                         | V (empty)            | Hook dependency fix in `useChat`                                   |
| 12  | Dashboard (Today)            | V, I ×3, F, U        | Populated widgets                                                  |
| 13  | Employees                    | V ×3                 | Populated list and profile                                         |
| 14  | Help & tours                 | V                    | Tour engine has unit tests; a tour mid-run was not exercised       |
| 15  | Helpdesk                     | V (empty)            |                                                                    |
| 16  | Holidays                     | V (empty)            |                                                                    |
| 17  | Insights (shared)            | V ×2                 | Via employee and attendance insights                               |
| 18  | KYC                          | V ×2                 | Memo dependency fix in `KycForm`                                   |
| 19  | Landing                      | V ×3                 | Prerendered HTML diffed: only `useId` format and one image preload |
| 20  | Organization                 | V (empty)            |                                                                    |
| 21  | Payroll / salary / tax       | V ×4 (empty)         |                                                                    |
| 22  | Performance                  | V ×2 (empty)         |                                                                    |
| 23  | Permissions                  | V (empty)            |                                                                    |
| 24  | Policies                     | V (empty)            |                                                                    |
| 25  | Profile                      | V                    |                                                                    |
| 26  | Public pages                 | V ×2                 | Careers apply submit and org setup not exercised                   |
| 27  | Recruitment                  | V ×2                 |                                                                    |
| 28  | Reports                      | V (empty)            |                                                                    |
| 29  | Resignations                 | V ×2 (empty)         |                                                                    |
| 30  | Settings                     | V ×2                 |                                                                    |
| 31  | Subscription                 | V, F (402)           | Populated tenant                                                   |
| 32  | Support (+ platform console) | V ×4, I              | Populated tickets                                                  |
| 33  | System (not found)           | V, F                 |                                                                    |
| 34  | WFH                          | V (empty)            |                                                                    |

Shell and cross-cutting: navigation (desktop sidebar, mobile drawer), command palette, notifications (popover, live socket), offline/PWA and dark mode are covered above.

## Not tested, and why

| Item                                                                   | Reason                                                                            | How to close                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Any flow against the real gateway                                      | Local gateway = production database                                               | Stand up a staging gateway with synthetic tenants; rerun these flows with the fixture router off |
| Google OAuth                                                           | External redirect                                                                 | Staging with a test Google account                                                               |
| Successful face recognition                                            | Needs a real face and an enrolled descriptor                                      | Manual check on a device                                                                         |
| FCM push delivery                                                      | Needs Firebase credentials and a device                                           | Staging Firebase project                                                                         |
| S3 multipart / signed uploads (leave certificate, support attachments) | Needs storage                                                                     | Staging bucket                                                                                   |
| Populated data in the "empty" modules                                  | Fixtures not written for those endpoints                                          | Extend `fixtures.mjs`, or use staging                                                            |
| Backend Jest suite (`pnpm test` runs it before web tests)              | Backend unchanged; it needs `prisma generate`, which the isolated install skipped | Run in CI as usual                                                                               |

## Security checks (client side)

- **Authentication** was not weakened: same boot, refresh, CSRF, idempotency and logout behaviour (flows above).
- **Authorization** is unchanged: same route guards and navigation per persona; the extracted `leaveRules` match the original and are unit-tested.
- **Tenant isolation:** the client never chooses a tenant (it comes from the token); unchanged.
- **Session restoration:** the only change is that a deliberate sign-out no longer forwards the next person to the previous person's page.
- **Error reports:** redacted in production (tokens, JWTs, emails, PAN/Aadhaar-shaped numbers, query strings).
