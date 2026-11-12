# Swagger / OpenAPI Audit Report

Date: 2026-11-12. Scope: every HTTP route in the monorepo, and the Swagger spec
served at `/api-docs`.

## How the API and its docs are built

- **HTTP surface.** Only `apps/api-gateway` serves HTTP. The 11 other services
  in `apps/` speak gRPC only and have no HTTP routes. Routers are mounted in
  `src/routes/index.ts` (`rootRouter`, plus an inner `businessRouter`). The MCP
  router and 8 other routes are registered directly on the app in
  `src/server.ts`.
- **Spec.** OpenAPI **3.0.0**. `swagger-jsdoc` merges the plain YAML fragments
  in `apps/api-gateway/docs/swagger/*.yml` with the definition in
  `src/config/swagger.ts`. `src/config/swaggerSetup.ts` serves it with
  `swagger-ui-express` at `/api-docs`. Outside production this always happens;
  in production it needs `ENABLE_API_DOCS=true`. There is one spec, with no
  JSDoc annotations. The project's conventions were kept.
- **Method.**
  1. A TypeScript-AST extractor walked every router call and applied the real
     mount prefixes and mount guards.
  2. A handler analyser followed each route to its handler, and into helpers
     that receive `req`, `req.body` or `req.query`. It recorded the body,
     query and path fields each handler reads, the status codes and messages
     it can return, and the top-level keys of each response.
  3. All 120 Zod request schemas were converted to JSON Schema, and every
     operation was compared field by field against the spec.
  4. Every finding was then checked by hand in the code. Analyser false
     positives were dropped and are listed in §F.

  The extractor's inventory of operations is in
  `apps/api-gateway/docs/swagger-endpoint-comparison.json`.

## A. Audit summary

| Metric                                              |                                                                                                                                                                                                                                                                 Count |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| Implemented operations (method + path)              |                                        **422**. 420 come from static extraction and 2 more are registered with a path array (`/.well-known/oauth-protected-resource[/mcp]`). Not counted: 2 catch-all `ALL` handlers that return 405 and the CORS `OPTIONS` handlers. |
| Documented operations before                        |                                                                                                                                                                                                                                                   **346** (297 paths) |
| Documented operations after                         |                                                                                                                                                                   **426** (364 paths). That is 422 plus 4 documented 405 stubs (GET/DELETE `/mcp` and `/mcp/public`). |
| Missing endpoints added                             |                                                                                                                                                                                              **76** implemented operations (80 spec operations including the 4 stubs) |
| Obsolete documented endpoints                       |                                                                                                                                                                                                                 **0**. Every documented path and method still exists. |
| Incorrect request schemas or parameters (corrected) |                                                                                                                                                                                                                                      **8** operations, listed in §D.2 |
| Incorrect response schemas (corrected)              |                                                                                                                                            **1** body (`apply-for-job`). **28** operations had error status codes that the handlers return but the spec did not list. |
| Authentication / security discrepancies             | **332** authenticated operations listed `bearerAuth` only, but the `access_token` cookie is also accepted. **14** public operations had no explicit `security: []`. **190** mutations didn't list the required `X-CSRF-Token` header or the `Idempotency-Key` header. |
| Spec defects that broke validation before           |                                                                          **2**. A path parameter declared `required: false`, and an unquoted flow-map description in `aiConnections.yml` that produced 3 stray keys. **The original spec failed OpenAPI validation.** |
| Existing operations updated                         |                                                                                                                **346 / 346**. All of them got at least an `operationId`, cookie auth or explicit public security, an `Access:` line and the standard error responses. |

## B. Module-wise coverage

The modules are the spec's operation tags. "Updated" counts operations that
were documented before and changed in this pass.

| Module                                   | Actual Endpoints | Documented Endpoints (before) | Missing | Updated |
| ---------------------------------------- | ---------------: | ----------------------------: | ------: | ------: |
| AI Assistants                            |                5 |                             5 |       0 |       5 |
| AI Insights                              |                1 |                             1 |       0 |       1 |
| Analytics                                |                8 |                             8 |       0 |       8 |
| Approval Chains                          |               10 |                            10 |       0 |      10 |
| Assets                                   |               16 |                            16 |       0 |      16 |
| Attendance                               |               10 |                             8 |       2 |       8 |
| Authentication                           |                6 |                             6 |       0 |       6 |
| Bulk Onboarding                          |                4 |                             4 |       0 |       4 |
| Careers Page                             |               11 |                             4 |       7 |       4 |
| Chat                                     |               12 |                            12 |       0 |      12 |
| Compensation Analytics                   |                4 |                             4 |       0 |       4 |
| Dashboard                                |                4 |                             0 |       4 |       0 |
| Employee                                 |               11 |                            11 |       0 |      11 |
| Exit Policy                              |               15 |                            15 |       0 |      15 |
| General (calendar, uploads, policies UI) |               18 |                            13 |       5 |      13 |
| Google Calendar                          |                3 |                             3 |       0 |       3 |
| Helpdesk                                 |                6 |                             6 |       0 |       6 |
| HR Activities                            |                7 |                             7 |       0 |       7 |
| Interview Pipelines                      |               10 |                            10 |       0 |      10 |
| Leave                                    |                6 |                             5 |       1 |       5 |
| Leave Policy                             |                4 |                             4 |       0 |       4 |
| MCP & OAuth                              |               13 |                             0 |      13 |       0 |
| Notice Period Policies                   |                4 |                             4 |       0 |       4 |
| Notification                             |                3 |                             3 |       0 |       3 |
| Onboarding                               |                2 |                             2 |       0 |       2 |
| Org Structure                            |                9 |                             9 |       0 |       9 |
| Overtime                                 |                2 |                             2 |       0 |       2 |
| Payment (subscription & billing)         |               11 |                            11 |       0 |      11 |
| Payroll                                  |               10 |                             9 |       1 |       9 |
| Payroll Components                       |               16 |                            16 |       0 |      16 |
| Performance Reviews                      |                9 |                             9 |       0 |       9 |
| Permissions                              |               10 |                            10 |       0 |      10 |
| Platform Console (owner / SaaS admin)    |               15 |                             0 |      15 |       0 |
| Platform Support                         |               10 |                             0 |      10 |       0 |
| Policies                                 |                6 |                             6 |       0 |       6 |
| Presence                                 |                6 |                             0 |       6 |       0 |
| Recruitment                              |               18 |                            18 |       0 |      18 |
| Recruitment Analytics                    |                4 |                             4 |       0 |       4 |
| Reports                                  |                7 |                             7 |       0 |       7 |
| Resignation (offboarding)                |               11 |                            11 |       0 |      11 |
| Salary                                   |                7 |                             7 |       0 |       7 |
| Support                                  |               11 |                             0 |      11 |       0 |
| System                                   |                1 |                             0 |       1 |       0 |
| Tax Declaration                          |                9 |                             9 |       0 |       9 |
| Teams                                    |                6 |                             6 |       0 |       6 |
| Tenant                                   |               15 |                            15 |       0 |      15 |
| Tenant Settings                          |                3 |                             3 |       0 |       3 |
| User Management                          |                6 |                             6 |       0 |       6 |
| Walkthrough                              |                3 |                             0 |       3 |       0 |
| WebAuthn                                 |                9 |                             9 |       0 |       9 |
| Website Leads                            |                1 |                             0 |       1 |       0 |
| Work From Home                           |                5 |                             5 |       0 |       5 |
| Workforce Analytics                      |               13 |                            13 |       0 |      13 |
| **Total**                                |          **426** |                       **346** |  **80** | **346** |

The "Actual" column counts spec operations, so MCP & OAuth includes the 4
405 stubs.

## C. Missing endpoints (added)

Each was traced through its route, middleware, Zod schema, handler and
services. The new files are `common.yml`, `presence.yml`, `dashboard.yml`,
`walkthrough.yml`, `support.yml`, `platformAdmin.yml`, `leads.yml`,
`careerDrafts.yml`, `attendanceFace.yml`, `uploads.yml`, `mcp.yml` and
`system.yml`. One path was added to `leave.yml`.

- **Attendance:** `POST /api/v1/attendance/face/challenge`,
  `POST /api/v1/attendance/face/verify`
- **Careers Page (application drafts):**
  - `POST /api/v1/public/careers/{slug}/jobs/{jobId}/drafts`
  - `POST …/drafts/recover`
  - `POST …/drafts/recover/verify`
  - `GET`, `PUT` and `DELETE /api/v1/public/careers/{slug}/drafts/{draftId}`
  - `POST …/drafts/{draftId}/submit`

  The `X-Draft-Token` header and the 409 codes (ALREADY_APPLIED,
  DRAFT_EXISTS, STALE, SUBMITTED, IN_PROGRESS) are documented.

- **Dashboard:** `GET /api/v1/dashboard`, `GET /api/v1/dashboard/data`,
  `PUT /api/v1/dashboard/preferences`, `DELETE /api/v1/dashboard/preferences`
- **General (resumable uploads):** `POST /api/v1/upload/multipart/start`,
  `POST …/part-url`, `GET …/{uploadId}/parts`, `POST …/complete`,
  `POST …/abort`
- **Leave:** `GET /api/v1/get-available-paid-leaves`. This is the variant
  without the optional `:userId?`.
- **MCP & OAuth:**
  - `GET /.well-known/oauth-authorization-server`
  - `GET /.well-known/oauth-protected-resource` and `GET …/mcp`
  - `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`,
    `POST /oauth/revoke`
  - `POST /mcp`, `POST /mcp/public`
  - 405 stubs for GET and DELETE on both MCP paths

  A new `mcpOAuth` security scheme lists all 11 scopes.

- **Payroll:** `POST /api/v1/integrations/razorpayx/webhook`
- **Platform Console** (each operation lists the `PraestoAdmin:*` action it
  needs):
  - `GET /overview`, `GET /tenants`, `GET /tenants/{tenantId}`,
    `POST /tenants/{tenantId}/sync`
  - `GET /subscriptions`, `GET /payments`, `POST /billing/sync`,
    `GET /revenue`, `GET /audit-logs`
  - `GET /leads`, `GET /leads/metrics`, `GET /leads/owners`,
    `GET /leads/{leadId}`, `PATCH /leads/{leadId}`,
    `POST /leads/{leadId}/notes`

  All of these are under `/api/v1/platform/admin`.

- **Platform Support** (`/api/v1/platform/support`):
  - `GET /stats`, `GET /agents`
  - `GET /tickets`, `GET /tickets/{ticketId}`, `PATCH /tickets/{ticketId}`
  - `POST /tickets/{ticketId}/replies`, `POST /tickets/{ticketId}/duplicate`
  - `POST /attachments`, `POST /attachments/{id}/complete`,
    `GET /attachments/{id}/url`
- **Presence:** `GET /api/v1/presence/me`, `PUT /api/v1/presence/me`,
  `POST …/me/restore`, `DELETE …/me/message`, `GET /api/v1/presence/people`,
  `GET /api/v1/presence?ids=`
- **Support** (`/api/v1/support`):
  - `GET /context`, `GET /stats`
  - `GET /tickets`, `POST /tickets`, `GET /tickets/{ticketId}`
  - `POST …/replies`, `POST …/reopen`, `POST …/close`
  - `POST /attachments`, `POST /attachments/{id}/complete`,
    `GET /attachments/{id}/url`
- **System:** `GET /health`
- **Walkthrough:** `GET`, `PUT` and `DELETE /api/v1/walkthrough/progress`
- **Website Leads:** `POST /api/v1/public/leads`

## D. Corrected documentation

### D.1 Cross-cutting changes (all existing operations)

Each of these was checked against the gateway's middleware and applied to
every documented operation:

- **Security.**
  - Authenticated operations went from `bearerAuth` to
    `bearerAuth` **or** `cookieAuth`. The cookie is `access_token`;
    `authenticate()` reads the header first and falls back to the cookie.
  - Public operations now declare `security: []`.
  - The new `cookieAuth` and `mcpOAuth` schemes are defined in `common.yml`
    and `mcp.yml`.
- **Headers.**
  - `X-CSRF-Token` is now listed on every POST/PUT/PATCH/DELETE under
    `/api/v1`. It is required because `doubleCsrfProtection` runs globally.
    The two Razorpay webhooks are exempt because they are mounted before it.
  - `Idempotency-Key` is now listed on mutations behind the business,
    support, platform, walkthrough and presence mounts.
- **Standard responses** (shared components):
  - `400` on routes with Zod validation
  - `401`
  - `402` for `requireActiveSubscription`
  - `403` for role guards, `requireTenant` (PENDING_TENANT_SETUP) and CSRF
  - `429`: every `/api` route is rate-limited
  - `500`
  - `503` AUTH_CHECK_UNAVAILABLE, from the live account check in
    `authenticate`
- **Explicit error statuses** that handlers return but the spec didn't list,
  added with the handler's own message. 28 operations, for example:
  - `assets/issues` 404
  - `edit-hr-activity` 409
  - `save-face-descriptor` 409
  - `complete-pending-setup` 409
  - `tenants/org-profile` 404
  - `payment/create-subscription` 400
  - `refresh-token` 503 SESSION_CHECK_UNAVAILABLE
  - `webauthn-login` 503
  - `payment/webhook` 503 (the same event is still being processed)
- **Access line.** Every description now ends with an `Access:` line listing
  the route-level guards: authentication, organisation, subscription,
  `requireSuperUser`, `requirePrivileged`, `requireHrPrivileged`,
  `requireSubscriptionManager`, `authorize(...)`, `requirePlatformAdmin(...)`,
  `requireSupportAgent` and `requireWfhEnabled`.
- **operationId.** Every operation now has a unique `operationId`, taken from
  its handler name. None had one before.
- **`swagger.ts`.** The `info.description` now explains authentication, CSRF,
  the guard chain, idempotency and the response envelope. The configuration
  and integration are otherwise unchanged.

### D.2 Endpoint-specific corrections

| Endpoint                                         | Problem                                                                                                                                                                         | Fix                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/add-attendance`                    | `faceAttestation` was missing; so was 403 FACE_ATTESTATION_REQUIRED                                                                                                             | Added both. The attestation is only enforced when `ATTENDANCE_FACE_ATTESTATION=enforce`.                                                                                   |
| `PUT /api/v1/edit-kyc`                           | 16 fields accepted by `completeKycSchema` were missing (addresses, document photos, certificates)                                                                               | Added them.                                                                                                                                                                |
| `PUT /api/v1/leave-policy`                       | Documented `effectiveFrom` and `note` as working                                                                                                                                | Marked them `deprecated` and "currently ignored", and rewrote the description. This is a code bug; see §G-1.                                                               |
| `GET /api/v1/public/careers/{slug}`              | Documented a `status` override that the handler removed                                                                                                                         | The parameter is marked deprecated/ignored. The description now covers the internal-only and deadline filtering.                                                           |
| `POST /api/v1/apply-for-job/{slug}`              | The body still had `aadharNo`, which was dropped, and was missing the configurable form (`profile`, `answers`, `coverLetter`, `consent`, `resumeName`)                          | The body is now `jobTitleId`/`jobTitle` plus the shared `CareerApplicationData` schema. The 200 response gained `data.id`, and the 400 response gained per-field `errors`. |
| `POST /api/v1/add-job-opening`                   | 16 fields read by `validateJobOpening` were missing, including the required `employmentType`/`workplaceType`. `visibility` was missing `both`. The 400 response lacked `field`. | Added the shared `JobOpeningInput` and `JobOpeningValidationError` schemas.                                                                                                |
| `PUT /api/v1/edit-job-opening/{_id}`             | Same as above. It also didn't say that omitted "clearable" fields get cleared.                                                                                                  | Same fix, and the description now explains the clearing behaviour.                                                                                                         |
| `GET /api/v1/get-available-paid-leaves/{userId}` | Path parameter declared `required: false`, which is invalid OpenAPI 3                                                                                                           | Split into two paths that share a new `LeaveBalanceResponse` schema.                                                                                                       |
| `ai-connections` requests: GET, approve, deny    | An unquoted flow-map description produced 3 invalid response keys                                                                                                               | Quoted it.                                                                                                                                                                 |

## E. Obsolete endpoints

**None.** All 346 previously documented operations match an implemented
route with the same method and path, so nothing was removed. Three
documented _inputs_ no longer have any effect. They were kept and marked
`deprecated: true` with an explanation, so existing clients aren't misled:

- `effectiveFrom` and `note` on `PUT /leave-policy`
- `?status` on `GET /public/careers/{slug}`

## F. Validation results

- **OpenAPI validation.** `@apidevtools/swagger-parser` 10.0.3 was already in
  the dependency tree, so nothing was added. The spec produced by the real
  `src/config/swagger.ts` is **VALID**. The original spec was **INVALID**
  because of the defects in §D.2.
- **Duplicate operationIds:** 0 (426 of 426 operations have one).
- **Broken `$ref`s:** 0 of 83 distinct refs.
- **Examples.** 8,694 request, response, parameter and property examples were
  validated against their schemas with Ajv 8 (also already installed), with
  `nullable` handled. **0 failures.** A negative test confirmed the checker
  catches a bad example.
- **Swagger UI.** It was served through the project's own
  `configureSwagger()` and opened in a real browser (Playwright). It renders
  "Praesto API Documentation 1.0.0 OAS 3.0" with **53 tags and 426
  operations, no error panels, and 0 console errors or warnings**.
- **Coverage, both directions:**
  - Every implemented operation is documented.
  - The only documented operations with no statically extracted route are
    the two `.well-known/oauth-protected-resource` paths, which the extractor
    can't see because they are registered with a path array. They were
    verified by hand.
- **Other checks.**
  - `gatewayStartupCost.test.ts` passes (8 of 8).
  - ESLint is clean on `swagger.ts`.
  - `tsc` reports no errors in the touched files. The only existing errors
    are unrelated: `@hrms/crypto` is unresolved in the `cache` and
    `notifications` packages.
  - Prettier was applied to the YAML.
  - The diff to existing YAML is additive: 126 deleted lines in total. They are single-line descriptions rewritten as block scalars to take the `Access:` line, plus the targeted corrections in §D.2.
- **Flags still raised by the analyser, all checked by hand and not defects
  in the docs:**
  - `chat/conversations/{id}/messages ?page`: only `limit` and `before` are
    used, and the spec says so.
  - `complete-kyc` `username`: Zod accepts it but the handler ignores it, so
    it is deliberately left undocumented.
  - `edit-kyc` and `save-fcm-token`: the spec marks fields as required that
    Zod treats as optional. The spec is right, because the handlers return
    400 without them.
  - `apply-for-job` fields: they are read through
    `submitApplication → sanitizeApplicationData`, which is deeper than the
    analyser follows.
  - The `leave-policy` and `public/careers` items are the deprecations in §E.

## G. Remaining issues that need manual attention

1. **Possible bug in `PUT /api/v1/leave-policy`.** `handlers/leavePolicy.ts`
   reads `effectiveFrom` and `note`. But `validate(updateLeavePolicySchema)`
   replaces `req.body` with Zod's parsed output, which only contains
   `leavePolicies`. So a future-dated leave policy takes effect immediately,
   and the note is lost. The code was not changed, per the audit rules. The
   fix is to add both fields to the Zod schema.
2. **Edit-job-opening clears omitted fields.** The clearable fields are
   cleared when they are _omitted_, not only when sent empty. The docs now
   say this; confirm it is the intended behaviour.
3. **Response bodies of the 346 previously documented operations were not
   re-verified field by field.** For those operations this audit verified
   request bodies, query and path parameters, status codes, security and
   guards. It did not deep-diff every response property. 47 handlers pass a
   downstream gRPC response straight through (`apiResponse(res, …, response)`),
   so their shape comes from the proto/service and can't be confirmed from
   gateway code alone. The highest-value follow-up is to compare those
   against `packages/proto-definitions`.
4. **Some new schemas are only partly specified.** The nested aggregates of
   the platform console (`overview`, `subscriptions`, `revenue` series, `mrr`,
   `trials`) and the per-widget `data` of `GET /dashboard/data` are typed as
   `object` or `array` with descriptions. Their exact fields come from
   `services/platformMetrics.ts` and the 25 dashboard widget loaders, and
   weren't expanded.
5. **Handler-level RBAC.** The `Access:` line covers route-level guards
   only. Scope rules inside handlers are described only where the existing
   prose already explained them. These include self, team and organisation
   scopes, and checks such as `isPrivileged`, `canManageKyc` and Support
   capabilities.
6. **Downstream errors.** Errors from gRPC services are mapped through
   `grpcToHttpStatus`, so many operations can also return 404, 409 or 504
   from a downstream service. These are not listed per operation.
7. **Not documented as operations:** the CORS `OPTIONS` preflight handlers
   on the MCP and OAuth paths, and the Socket.IO endpoint.
8. **The audit scripts are not in the repo.** They are the AST extractor,
   the handler analyser, the Zod dumper, the comparator, the surgical YAML
   fixer and the validators. Re-running the audit later means recreating
   them, or asking for them to be added under `scripts/` as a CI check.
