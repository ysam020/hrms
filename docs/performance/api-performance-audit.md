# Praesto API Performance Audit (GET endpoints)

**Date:** 2026-10-31 · **Branch audited:** `feature/ui_refresh_walkthrough` (commit `72d7407`) · **Environment:** local Docker stack (`https://localhost`) reading the shared Atlas database

> **Update (2026-10-31): Fix 1 (single gateway guard) has been implemented and measured locally. Overall GET median went from 525 to 112 ms and P95 from 1,624 to 437 ms. See [§27 Remediation log](#27-remediation-log). Sections 1–26 remain the original baseline.**
>
> Everything under "Measured" comes from real browser requests captured with Playwright in this session. Anything marked **Estimate**, **Hypothesis** or **Recommendation** has not been measured. Raw samples are in [`api-performance-results.csv`](./api-performance-results.csv); the prioritised backlog is in [`api-performance-backlog.csv`](./api-performance-backlog.csv).

---

## 1. Executive summary

- **Scope:** 63 application routes visited three times each, 3 cold full page loads, 5 read-only interactions (search, pagination, a status filter, two detail views) and 35 controlled probes. In total: **349 GET requests across 89 distinct GET endpoints** (358 API requests including the auth POSTs).
- **Overall:** the median GET took **525 ms** and P95 was **1,624 ms**. **54 %** of GET requests took more than 500 ms, and **25 %** took more than 1 s.
- **Primary root cause (confirmed, high confidence): the gateway runs its auth/subscription middleware chain up to 27 times per request.** In [`apps/api-gateway/src/routes/index.ts`](../../apps/api-gateway/src/routes/index.ts), `subscriptionGuard` (`defaultLimiter → authenticate → requireTenant → requireActiveSubscription → idempotency`) is mounted _without a path_ in front of each of 26 routers. Express runs every path-less chain in order until a router matches. Each pass makes one Redis rate-limit round trip and one uncached `prisma.tenant.findUnique` against Atlas.
  - **Controlled test:** a request to a non-existent path (no handler work at all) takes a median of **935 ms**. Latency rises linearly with a router's mount position: **35.8 ms per guard pass** (R² = 0.94, 35 samples).
  - **Explains:** every Payroll, Assets, WFH, Helpdesk, Reports, Tax-declaration and Performance endpoint takes **1.0–1.6 s** even when it returns an empty 26-byte list. Settings endpoints take 0.8–1.1 s and Analytics about 0.43 s.
  - **Side effect (correctness/availability):** the Redis rate limiter is charged once per pass. One `/payroll/*` request consumes **29** units of the "5,000 per minute" budget (measured from `RateLimit-Remaining`), so users who share an IP can hit 429s about 25× sooner than intended.
- **Second tier:**
  - `GET /dashboard/data` (median 1.4 s, max **7.6 s**) runs after `GET /dashboard` in a serial waterfall.
  - `GET /audit-logs` took **9.3 s** cold and returned 760 KB decoded for 200 rows.
  - `GET /tenant-settings` is re-fetched on every Settings page (15 calls in this audit).
- **Network is not the bottleneck.** Browser time minus gateway-logged server time has a median of about **10 ms** across 288 matched requests. The latency is inside the gateway.
- **Recommended first fix (P1, small effort):** mount the guard once (§23, item 1). **Estimate**, not measured: late-mounted endpoints should drop by roughly 0.9 s each, and the rate limiter would count each request once.

## 2. Application architecture overview

| Layer             | What it is                                                                                                                                                                                                                                                                           | Where                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Frontend          | React SPA (Vite, react-router v6; the former "Praesto Next" app), served by nginx in Docker                                                                                                                                                                                          | `apps/web` (`src/app/router.tsx`, `src/app/navigation.ts`)                  |
| API client        | Axios instance with an in-memory bearer token, refresh-token rotation, CSRF double-submit, Idempotency-Key on mutations, and **same-URL GET cancellation** ("superseded")                                                                                                            | `apps/web/src/shared-core/core/http/axiosConfig.ts`                         |
| Fetch hooks       | `useFetchData` (Classic hook: stale-while-revalidate via IndexedDB for `/get-*` URLs, but **always refetches**). The dashboard has its own data layer with an offline cache. No React Query or SWR.                                                                                  | `shared-core/shared/hooks/useFetchData.tsx`, `features/dashboard/data.ts`   |
| API gateway       | Express on `http2-express-bridge` (HTTP/2 + TLS), helmet, CORS, cookie-parser, `doubleCsrfProtection`, `apiRequestLogger`, global rate limiters (`applyRateLimiters`), `auditLogMiddleware`, then `/api/v1` → `rootRouter`                                                           | `apps/api-gateway/src/server.ts`, `routes/index.ts`                         |
| Business logic    | Mixed: many handlers query Mongo directly from the gateway via Prisma; others call 12 gRPC services (user, employee, attendance, leave, recruitment, hrm, salary, notification, analytics, performance-review, auth, scheduler)                                                      | `apps/api-gateway/src/handlers/*`, `apps/*-service`                         |
| Data              | MongoDB Atlas via Prisma. **Master DB** (users, tenants, memberships) plus a **database per tenant**. Tenant clients come from an LRU pool of up to 50 `PrismaClient`s, each with `maxPoolSize=50`.                                                                                  | `packages/database/src/{prismaClient,tenantClientPool,prismaWithTenant}.ts` |
| Tenant resolution | The JWT carries `tenantId`/`dbName`. `authenticate` wraps the rest of the chain in two AsyncLocalStorage contexts (`gatewayTenantStorage`, `runWithTenant`). The `prismaWithTenant` proxy routes models to the tenant client and auto-injects `tenantId` into master `User` queries. | `middleware/authenticate.ts`, `packages/database/src/prismaWithTenant.ts`   |
| Redis             | Rate-limit stores (`rl:*` prefixes), idempotency keys, `@hrms/cache` cacheManager (used e.g. by birthdays and holidays)                                                                                                                                                              | `config/rateLimiters.ts`, `middleware/idempotency.ts`, `packages/cache`     |
| Queues / realtime | BullMQ (`packages/queue`), scheduler-service, Socket.IO (`packages/websocket`)                                                                                                                                                                                                       | —                                                                           |
| Observability     | Winston → Loki; Prometheus histograms `http_request_duration_ms{method,route,status}` and `grpc_request_duration_ms`; per-request "HTTP Request … duration" log line; Grafana                                                                                                        | `packages/logger/src/index.ts`, `docker-compose.monitoring.yml`             |

## 3. Testing methodology

1. **Recorder.** A Playwright `BrowserContext` listener captured every `/api/v1/` request: `request` → `requestfinished`/`requestfailed`. Timings come from `request.timing()`: total = `responseEnd` (request start to last body byte, including browser queueing); TTFB = `responseStart − requestStart`; download = `responseEnd − responseStart`; queue = `requestStart`.
2. **Payload size.** Playwright's `request.sizes()` reports 0 for these responses, so sizes come from the page's **Resource Timing API** (`encodedBodySize`, `decodedBodySize`, `nextHopProtocol`), collected after each route and matched by URL, route and pass. Responses that only occurred during full page loads have no size recorded.
3. **Navigation.** For each of the 63 routes in `navigation.ts`/`router.tsx`, the runner did `history.pushState` + `popstate`, which is how in-app link clicks navigate. It then waited until no API request had been in flight for 1.2 s, with a 20 s cap. Three passes in total: pass 1 is the first visit in the session; passes 2 and 3 are warm revisits.
4. **Cold loads.** Three full `page.goto('/dashboard')` loads (bootstrap: CSRF, refresh, profile and dashboard fan-out).
5. **Interactions.** Directory search (typed "kum" one key at a time), directory page 2, Leave Applications "Approved" filter, a helpdesk ticket detail and a job opening detail.
6. **Server-side correlation.** Each browser sample was matched to the gateway's own `HTTP Request {url,duration}` log line (same method and URL, ±1.5 s): **288 of 358 matched**. Routes mounted under a path prefix (`/payroll`, `/assets`, …) are logged without the prefix, so they were checked by hand (§7).
7. **Controlled probes.** In-page sequential `fetch` calls using the app's own bearer token (captured inside the Playwright process; never printed or stored). 7 endpoints chosen by router mount position, interleaved, 5 rounds each with a 150 ms gap. One probe targets a path that matches no route.
8. **Rate-limit check.** `RateLimit-Remaining` read on consecutive requests to endpoints at different mount positions.

**Thresholds** follow the brief: under 100, 100–200, 200–300, 300–500, 500–1,000 and over 1,000 ms. Unless stated otherwise, the "median" is the median of all samples for that endpoint, cold and warm combined.

## 4. Browser session and environment assumptions

- **Single user, single browser session, single gateway instance.** No load was generated. Probes were sequential.
- **Account:** the signed-in user is an **organisation owner** (hence the HR/admin capabilities), so every tenant module was accessible. The platform support console (`/platform/support`) made no API calls; the account is not a Praesto support agent. **No other tenant was accessed.**
- **Stack:** `hrms-dev-*` Docker containers on macOS: nginx web, api-gateway, 12 gRPC services, Redis, Prometheus, Loki and Grafana. **MongoDB is the shared Atlas cluster**, so every query pays Mac → Atlas network latency. Per-round-trip costs (for example the 35.8 ms per guard pass) will differ in production, where the gateway runs on EC2. **The multiplication factor (up to 27 passes) is a property of the code and applies in production too.**
- **Local-only artefact:** the local nginx (`docker/nginx.conf`) listens with `ssl` but **not `http2`**, so the browser used HTTP/1.1 (`nextHopProtocol = http/1.1` for all 296 sized responses). Chrome allows 6 connections per origin, so pages with more than 6 parallel calls queued the 7th and later requests for 190–430 ms (§17). Production fronting was not verified.
- The audit logged in once (Google sign-in, done by the user in the Playwright window). No logout, storage clearing or form submission happened. The one non-GET request the app made by itself was `POST /upload/view-url` on the KYC form (it returned 400 every time; see §17).

## 5. Module coverage matrix

All modules in the navigation were visited. "Requests measured" counts GET requests for that page across all passes and interactions.

| Module        | Page / action                            | GET endpoints                                                                                                                                                                                                                                                                                                                            | Requests measured | Endpoints with median > 300 ms | Coverage                  |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------: | -----------------------------: | ------------------------- |
| Dashboard     | `/dashboard (cold)`                      | `/approvals/pending-all`, `/birthdays-anniversaries`, `/chat/unread-counts`, `/csrf-token`, `/dashboard`, `/dashboard/data`, `/get-attendance-summary/:id/:year/:month`, `/get-attendances/:year/:month`, `/get-calendar-events`, `/get-holidays/:year`, `/get-hr-activities`, `/get-notifications`, `/profile`, `/walkthrough/progress` |                45 |                             10 | Complete                  |
| Calendar      | `/calendar`                              | `/get-calendar-events`, `/get-holidays/:year`                                                                                                                                                                                                                                                                                            |                 6 |                              2 | Complete                  |
| Chat          | `/chat`                                  | `/chat/conversations`, `/chat/unread-counts`                                                                                                                                                                                                                                                                                             |                 6 |                              2 | Complete                  |
| Profile       | `/profile`                               | `/get-employee-details/:username`                                                                                                                                                                                                                                                                                                        |                 3 |                              0 | Complete                  |
| Employees     | `/employee-management/employee-list`     | `/view-all-kycs`                                                                                                                                                                                                                                                                                                                         |                 3 |                              0 | Complete                  |
| Employees     | `/employee-management/insights`          | `/employee-insights`                                                                                                                                                                                                                                                                                                                     |                 3 |                              0 | Complete                  |
| Organization  | `/organization-tree`                     | `/get-org-chart`                                                                                                                                                                                                                                                                                                                         |                 3 |                              1 | Complete                  |
| Attendance    | `/attendance`                            | `/get-attendance-summary/:id/:year/:month`, `/get-attendances/:year/:month`                                                                                                                                                                                                                                                              |                 6 |                              0 | Complete                  |
| Attendance    | `/attendance/view-all-attendances`       | `/get-all-attendances/:year/:month`                                                                                                                                                                                                                                                                                                      |                 3 |                              0 | Complete                  |
| Attendance    | `/attendance/insights`                   | `/attendance-insights`                                                                                                                                                                                                                                                                                                                   |                 3 |                              0 | Complete                  |
| Leave         | `/attendance/view-leave-applications`    | `/get-leave-applications`                                                                                                                                                                                                                                                                                                                |                 3 |                              1 | Complete                  |
| Leave         | `/attendance/apply-leave`                | `/dashboard/data`, `/tenant-settings`                                                                                                                                                                                                                                                                                                    |                 6 |                              2 | Complete                  |
| WFH           | `/wfh/requests`                          | `/wfh/requests`                                                                                                                                                                                                                                                                                                                          |                 3 |                              1 | Complete                  |
| Holidays      | `/holidays`                              | `/get-holidays/:year`                                                                                                                                                                                                                                                                                                                    |                 3 |                              1 | Complete                  |
| KYC           | `/kyc/view-employee-kycs`                | `/view-all-kycs`                                                                                                                                                                                                                                                                                                                         |                 3 |                              0 | Complete                  |
| KYC           | `/kyc/complete-kyc`                      | `/csrf-token`, `/get-user-data/:username`                                                                                                                                                                                                                                                                                                |                 4 |                              1 | Complete                  |
| KYC           | `/kyc/insights`                          | `/get-kyc-insights`                                                                                                                                                                                                                                                                                                                      |                 3 |                              0 | Complete                  |
| Recruitment   | `/job-openings/view-job-openings`        | `/view-job-openings`                                                                                                                                                                                                                                                                                                                     |                 3 |                              0 | Complete                  |
| Recruitment   | `/job-openings/insights`                 | `/job-openings-insights`                                                                                                                                                                                                                                                                                                                 |                 3 |                              0 | Complete                  |
| Performance   | `/performance-reviews/reviews`           | `/get-all-users`, `/performance-reviews`, `/performance-reviews/cycles`                                                                                                                                                                                                                                                                  |                12 |                              2 | Complete                  |
| Performance   | `/performance-reviews/review-cycles`     | `/performance-reviews/cycles`                                                                                                                                                                                                                                                                                                            |                 3 |                              1 | Complete                  |
| Payroll       | `/payroll/my-payslips`                   | `/payroll/my-payslips`                                                                                                                                                                                                                                                                                                                   |                 3 |                              1 | Complete                  |
| Payroll       | `/payroll/salary-advances`               | `/payroll/advances`                                                                                                                                                                                                                                                                                                                      |                 3 |                              1 | Complete                  |
| Payroll       | `/payroll/my-tax-declaration`            | `/tax-declarations/mine`                                                                                                                                                                                                                                                                                                                 |                 3 |                              1 | Complete                  |
| Payroll       | `/payroll/payroll-runs`                  | `/payroll/runs`                                                                                                                                                                                                                                                                                                                          |                 3 |                              1 | Complete                  |
| Payroll       | `/payroll/salary-management`             | `/view-all-kycs`                                                                                                                                                                                                                                                                                                                         |                 3 |                              0 | Complete                  |
| Payroll       | `/payroll/tax-declarations`              | `/tax-declarations`                                                                                                                                                                                                                                                                                                                      |                 3 |                              1 | Complete                  |
| Assets        | `/assets/inventory`                      | `/assets`, `/assets/categories`                                                                                                                                                                                                                                                                                                          |                 6 |                              2 | Complete                  |
| Assets        | `/assets/issues`                         | `/assets/issues`                                                                                                                                                                                                                                                                                                                         |                 3 |                              1 | Complete                  |
| Assets        | `/assets/summary`                        | `/assets/summary`                                                                                                                                                                                                                                                                                                                        |                 3 |                              1 | Complete                  |
| Resignations  | `/resignation-process/view-resignations` | `/my-resignation`, `/view-resignations`                                                                                                                                                                                                                                                                                                  |                 6 |                              2 | Complete                  |
| Resignations  | `/resignation-process/exit-feedback`     | `/exit-interview-templates`, `/my-resignation`                                                                                                                                                                                                                                                                                           |                 6 |                              2 | Complete                  |
| Resignations  | `/resignation-process/insights`          | `/resignation-insights`                                                                                                                                                                                                                                                                                                                  |                 3 |                              0 | Complete                  |
| Announcements | `/hr-activities`                         | `/get-hr-activities`                                                                                                                                                                                                                                                                                                                     |                 3 |                              1 | Complete                  |
| Policies      | `/policy`                                | `/policies`                                                                                                                                                                                                                                                                                                                              |                 3 |                              0 | Complete                  |
| Helpdesk      | `/helpdesk`                              | `/helpdesk/tickets`                                                                                                                                                                                                                                                                                                                      |                 3 |                              1 | Complete                  |
| Analytics     | `/analytics/workforce`                   | `/get-age-distribution`, `/get-employee-departments`, `/get-employee-designations`, `/get-employee-status-distribution`, `/get-employment-type-breakdown`, `/get-headcount-growth`, `/get-joining-data`, `/get-tenure-distribution`                                                                                                      |                24 |                              8 | Complete                  |
| Analytics     | `/analytics/leave-attendance`            | `/get-attendance-trends`, `/get-leave-approval-rate`, `/get-leave-type-breakdown`, `/get-monthly-leave-patterns`, `/get-working-hours-distribution`                                                                                                                                                                                      |                21 |                              5 | Complete                  |
| Analytics     | `/analytics/recruitment`                 | `/get-applications-by-job-role`, `/get-hiring-funnel`, `/get-hiring-manager-performance`, `/get-job-openings-by-status`                                                                                                                                                                                                                  |                12 |                              4 | Complete                  |
| Analytics     | `/analytics/salary`                      | `/get-average-salary-by-designation`, `/get-compensation-breakdown`, `/get-salary-bands`, `/get-salary-distribution-by-department`                                                                                                                                                                                                       |                12 |                              4 | Complete                  |
| Reports       | `/reports/report-builder`                | `/reports/schema/employee`                                                                                                                                                                                                                                                                                                               |                 3 |                              1 | Complete                  |
| Reports       | `/reports/saved-reports`                 | `/reports/saved`                                                                                                                                                                                                                                                                                                                         |                 3 |                              1 | Complete                  |
| Permissions   | `/permissions/manage-roles`              | `/get-roles`                                                                                                                                                                                                                                                                                                                             |                 3 |                              1 | Complete                  |
| Permissions   | `/permissions/user-permissions`          | `/get-all-users`, `/get-role-and-permissions`                                                                                                                                                                                                                                                                                            |                 4 |                              1 | Complete                  |
| Permissions   | `/permissions/teams`                     | `/get-teams`                                                                                                                                                                                                                                                                                                                             |                 3 |                              1 | Complete                  |
| Settings      | `/settings/company`                      | `/tenants/org-profile`                                                                                                                                                                                                                                                                                                                   |                 3 |                              0 | Complete                  |
| Settings      | `/settings/leave`                        | `/tenant-settings`                                                                                                                                                                                                                                                                                                                       |                 3 |                              1 | Complete                  |
| Settings      | `/settings/attendance`                   | `/tenant-settings`                                                                                                                                                                                                                                                                                                                       |                 3 |                              1 | Complete                  |
| Settings      | `/settings/hr-policy`                    | `/tenant-settings`                                                                                                                                                                                                                                                                                                                       |                 3 |                              1 | Complete                  |
| Settings      | `/settings/work-week`                    | `/tenant-settings`                                                                                                                                                                                                                                                                                                                       |                 3 |                              1 | Complete                  |
| Settings      | `/settings/exit-policy`                  | `/exit-checklist-item-defs`, `/exit-interview-templates`, `/notice-period-policies`                                                                                                                                                                                                                                                      |                 9 |                              3 | Complete                  |
| Settings      | `/settings/payroll`                      | `/pay-cycles`, `/pt-slabs`, `/salary-component-definitions`, `/tds-slabs`                                                                                                                                                                                                                                                                |                12 |                              4 | Complete                  |
| Settings      | `/settings/recruitment-pipeline`         | `/interview-pipeline-templates`                                                                                                                                                                                                                                                                                                          |                 3 |                              1 | Complete                  |
| Settings      | `/settings/join-requests`                | `/tenants/join-requests`                                                                                                                                                                                                                                                                                                                 |                 3 |                              0 | Complete                  |
| Subscription  | `/subscription`                          | `/tenants/me`                                                                                                                                                                                                                                                                                                                            |                 3 |                              0 | Complete                  |
| Support       | `/support`                               | `/support/stats`, `/support/tickets`                                                                                                                                                                                                                                                                                                     |                 6 |                              0 | Complete                  |
| AI Assistants | `/ai-assistants`                         | `/ai-connections`                                                                                                                                                                                                                                                                                                                        |                 3 |                              1 | Complete                  |
| Audit Logs    | `/audit-logs`                            | `/audit-logs`                                                                                                                                                                                                                                                                                                                            |                 3 |                              1 | Complete                  |
| Dashboard     | `/dashboard`                             | `/birthdays-anniversaries`, `/dashboard`, `/dashboard/data`, `/get-attendance-summary/:id/:year/:month`, `/get-attendances/:year/:month`, `/get-calendar-events`, `/get-holidays/:year`, `/get-hr-activities`                                                                                                                            |                18 |                              6 | Complete                  |
| Employees     | `directory search (typed "kum")`         | `/view-all-kycs`                                                                                                                                                                                                                                                                                                                         |                 3 |                              0 | Complete                  |
| Employees     | `directory next page`                    | `/view-all-kycs`                                                                                                                                                                                                                                                                                                                         |                 1 |                              0 | Complete                  |
| Leave         | `leave applications filter Approved`     | `/get-leave-applications`                                                                                                                                                                                                                                                                                                                |                 2 |                              1 | Complete                  |
| Helpdesk      | `ticket detail`                          | `/helpdesk/tickets`, `/helpdesk/tickets/:id`                                                                                                                                                                                                                                                                                             |                 2 |                              2 | Complete                  |
| Recruitment   | `job opening detail`                     | `/view-applications/:id`, `/view-job-opening/:id`, `/view-job-openings`                                                                                                                                                                                                                                                                  |                 3 |                              1 | Complete                  |
| Approvals     | `/approvals`                             | — (inbox renders from `approvals/pending-all`, already loaded by the shell)                                                                                                                                                                                                                                                              |                 0 |                              0 | Complete                  |
| Attendance    | `/attendance/attendance-correction`      | — (no API calls on open)                                                                                                                                                                                                                                                                                                                 |                 0 |                              0 | Complete                  |
| Help          | `/help`, `/help/tours`                   | — (static content)                                                                                                                                                                                                                                                                                                                       |                 0 |                              0 | Complete                  |
| Support       | `/platform/support`                      | — (account is not a support agent; no calls)                                                                                                                                                                                                                                                                                             |                 0 |                              0 | Not authorised (expected) |

**Not exercised (documented blockers):**

- Chat conversation detail: opening a thread can mark messages read, which is a write.
- Employee profile of _another_ user and KYC review pages: skipped to avoid exposing a colleague's PII. The signed-in user's own profile (`/profile`) and KYC form were covered.
- Report execution (`POST /reports/run`), payslip PDF download and every create/approve/delete flow: excluded by the safety rules.
- Audit-log filter variations: not repeated after the 9.3 s cold load, to avoid loading production Atlas further.

## 6. Distinct GET endpoints observed

**89** distinct GET endpoint patterns (ObjectIds, years/months and usernames normalised). The full inventory with statistics is in §13.

## 7. Total GET requests measured

| Source                                                                                                            | Requests |
| ----------------------------------------------------------------------------------------------------------------- | -------: |
| SPA navigation, passes 1–3                                                                                        |      296 |
| Cold full page loads (3 × 15 GET)                                                                                 |       45 |
| Interactions (including the page loads they started from)                                                         |       11 |
| Aborted in browser (excluded from statistics)                                                                     |       −3 |
| Non-GET requests made by the app (3 × `POST /refresh-token`, 3 × `POST /upload/view-url`), excluded from rankings |        6 |
| Controlled probes (kept separate, §8 and §22)                                                                     |       35 |
| **GET requests in the endpoint ranking**                                                                          |  **349** |

Server-side spot check for prefix-mounted routes, from gateway logs (server-side duration, matching the browser's numbers within about 10 ms): `/performance-reviews?userId=` took 1,303 / 2,094 / 2,949 ms and `?reviewerId=` 1,382 / 2,096 / 2,655 ms. The performance-review gRPC service itself answered in 40–335 ms. `/wfh/requests` took 1,192–1,646 ms, `/helpdesk/tickets` 1,213–2,460 ms and `/payroll/my-payslips` 1,188–1,308 ms. By contrast, `/support/tickets` (also prefix-mounted, but _before_ the guards) took **100–129 ms**.

## 8. Overall latency distribution (measured, 349 GET requests)

| Bucket       | Requests | Share |
| ------------ | -------: | ----: |
| < 100 ms     |       19 |   5 % |
| 100–200 ms   |       29 |   8 % |
| 200–300 ms   |       31 |   9 % |
| 300–500 ms   |       81 |  23 % |
| 500–1,000 ms |      101 |  29 % |
| ≥ 1,000 ms   |       88 |  25 % |

**Median 525 ms, P95 1,624 ms.**

### Controlled probe: latency vs number of guard passes (measured)

| Probe                      | Guard passes | Status | Samples (ms)                 |   Median |
| -------------------------- | -----------: | -----: | ---------------------------- | -------: |
| `tenants/me`               |            0 |    200 | 268, 63, 76, 76, 124         |   **76** |
| `employee-insights`        |            2 |    200 | 79, 129, 77, 73, 76          |   **77** |
| `get-employee-departments` |           10 |    200 | 411, 372, 375, 330, 391      |  **375** |
| `tenant-settings`          |           16 |    200 | 900, 867, 662, 673, 700      |  **700** |
| `pt-slabs`                 |           23 |    200 | 1122, 819, 830, 863, 889     |  **863** |
| `payroll/advances`         |           27 |    200 | 1127, 1036, 1051, 1041, 1060 | **1051** |
| `unmatched-404`            |           26 |    404 | 926, 966, 896, 935, 953      |  **935** |

Linear fit across all 35 probe samples: **latency ≈ 74.6 ms + 35.8 ms × guard passes (R² = 0.942).** The unmatched path never reaches a handler, yet it costs as much as a real late-mounted endpoint.

### Rate-limit units charged per request (measured, `RateLimit-Remaining` deltas)

| Request                                                 | Units consumed | Expected |
| ------------------------------------------------------- | -------------: | -------: |
| `GET /tenants/me` (tenant router, before guards)        |              1 |        1 |
| `GET /employee-insights` (2nd guarded router)           |              4 |      1–2 |
| `GET /payroll/advances` (prefix router after 26 guards) |         **29** |      1–2 |

## 9–12. Endpoints by threshold (by median)

| Threshold                                  | Endpoints (count)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **> 1,000 ms** (critical for routine GETs) | **18**: `/performance-reviews`, `/wfh/requests`, `/reports/saved`, `/performance-reviews/cycles`, `/dashboard/data`, `/assets/issues`, `/assets`, `/assets/categories`, `/helpdesk/tickets`, `/assets/summary`, `/payroll/my-payslips`, `/payroll/advances`, `/helpdesk/tickets/:id`, `/tax-declarations`, `/tax-declarations/mine`, `/payroll/runs`, `/reports/schema/employee`, `/salary-component-definitions`                                                                                                                                                                                   |
| **500–1,000 ms** (high priority)           | **25**: `/exit-interview-templates`, `/interview-pipeline-templates`, `/tds-slabs`, `/pt-slabs`, `/exit-checklist-item-defs`, `/pay-cycles`, `/get-attendance-trends`, `/approvals/pending-all`, `/get-tenure-distribution`, `/notice-period-policies`, `/get-age-distribution`, `/tenant-settings`, `/audit-logs` (max 9,344), `/get-org-chart`, `/get-user-data/:username`, `/dashboard`, `/birthdays-anniversaries`, `/walkthrough/progress`, `/chat/conversations`, `/ai-connections`, `/chat/unread-counts`, `/get-teams`, `/get-role-and-permissions`, `/view-applications/:id`, `/get-roles` |
| **300–500 ms**                             | **25**: the 18 analytics `/get-*` endpoints, `/get-hr-activities`, `/get-calendar-events`, `/get-notifications`, `/get-holidays/:year`, `/my-resignation`, `/view-resignations`, `/get-leave-applications`, `/get-employee-designations` and others                                                                                                                                                                                                                                                                                                                                                 |
| **200–300 ms**                             | **9**: `/resignation-insights`, `/job-openings-insights`, `/get-all-attendances/:year/:month`, `/policies`, `/attendance-insights`, `/view-job-opening/:id`, `/get-attendance-summary/…`, `/view-job-openings`, `/view-all-kycs`                                                                                                                                                                                                                                                                                                                                                                    |
| **< 200 ms**                               | 12, almost all served by routers mounted _before_ the guard chain (`/tenants/*`, `/support/*`, `/profile`) or by the first two guarded routers (`/get-all-users`, `/employee-insights`, `/get-kyc-insights`, `/get-employee-details/:username`)                                                                                                                                                                                                                                                                                                                                                     |

The "Guard passes" column in §13 lines up with these buckets almost exactly. That is the strongest single piece of evidence in this audit.

## 13. Endpoint inventory, ranked by median

All durations in ms (browser, request start → last byte). "Server median" is the gateway-logged duration for matched samples (blank for prefix-mounted routes; see §7). P95 is shown only where n ≥ 5. "Guard passes" is the number of `subscriptionGuard` executions implied by the endpoint's router mount position.

| Endpoint                                   | Module(s)                     | Guard passes |   n |  Min | Median |  P95 |  Max | Server median | Payload (decoded / encoded) |
| ------------------------------------------ | ----------------------------- | -----------: | --: | ---: | -----: | ---: | ---: | ------------: | --------------------------: |
| `/performance-reviews`                     | Performance                   |           27 |   6 | 1313 |   2103 | 2889 | 2963 |               |               645 B / 349 B |
| `/wfh/requests`                            | WFH                           |           27 |   3 | 1198 |   1602 |      | 1655 |               |                 71 B / 88 B |
| `/reports/saved`                           | Reports                       |           27 |   3 | 1184 |   1490 |      | 2297 |               |               245 B / 201 B |
| `/performance-reviews/cycles`              | Performance                   |           27 |   6 | 1037 |   1400 | 2685 | 2946 |               |               332 B / 245 B |
| `/dashboard/data`                          | Dashboard, Leave              |           14 |  13 |  674 |   1399 | 6602 | 7622 |          1389 |             4.1 KB / 1.3 KB |
| `/assets/issues`                           | Assets                        |           27 |   3 | 1225 |   1344 |      | 1954 |               |               931 B / 431 B |
| `/assets`                                  | Assets                        |           27 |   3 | 1209 |   1335 |      | 1821 |               |              1.0 KB / 451 B |
| `/assets/categories`                       | Assets                        |           27 |   3 | 1223 |   1330 |      | 1333 |               |                 65 B / 82 B |
| `/helpdesk/tickets`                        | Helpdesk                      |           27 |   4 | 1219 |   1329 |      | 2470 |               |              1.9 KB / 542 B |
| `/assets/summary`                          | Assets                        |           27 |   3 | 1228 |   1279 |      | 1555 |               |               158 B / 143 B |
| `/payroll/my-payslips`                     | Payroll                       |           27 |   3 | 1199 |   1273 |      | 1314 |               |               880 B / 423 B |
| `/payroll/advances`                        | Payroll                       |           27 |   3 | 1058 |   1264 |      | 1930 |               |                 74 B / 91 B |
| `/helpdesk/tickets/:id`                    | Helpdesk                      |           27 |   1 | 1254 |   1254 |      | 1254 |               |                       — / — |
| `/tax-declarations`                        | Payroll                       |           27 |   3 | 1097 |   1236 |      | 1305 |               |                 71 B / 88 B |
| `/tax-declarations/mine`                   | Payroll                       |           27 |   3 | 1174 |   1192 |      | 1319 |               |               665 B / 353 B |
| `/payroll/runs`                            | Payroll                       |           27 |   3 | 1183 |   1184 |      | 2118 |               |               551 B / 334 B |
| `/reports/schema/employee`                 | Reports                       |           27 |   3 | 1099 |   1173 |      | 1218 |               |               448 B / 258 B |
| `/salary-component-definitions`            | Settings                      |           23 |   3 |  950 |   1081 |      | 1229 |          1070 |              2.3 KB / 477 B |
| `/exit-interview-templates`                | Resignations, Settings        |           21 |   6 |  808 |    977 | 1174 | 1178 |           968 |               674 B / 369 B |
| `/interview-pipeline-templates`            | Settings                      |           22 |   3 |  899 |    966 |      | 1031 |           959 |                 26 B / 46 B |
| `/tds-slabs`                               | Settings                      |           23 |   3 |  879 |    947 |      | 1050 |           937 |                 26 B / 46 B |
| `/pt-slabs`                                | Settings                      |           23 |   3 |  938 |    946 |      |  981 |           935 |                 26 B / 46 B |
| `/exit-checklist-item-defs`                | Settings                      |           21 |   3 |  897 |    937 |      | 1150 |           924 |               222 B / 192 B |
| `/pay-cycles`                              | Settings                      |           23 |   3 |  877 |    907 |      | 1241 |           895 |                 26 B / 46 B |
| `/get-attendance-trends`                   | Analytics                     |           10 |   6 |  358 |    903 | 1485 | 1638 |           494 |               816 B / 227 B |
| `/approvals/pending-all`                   | Dashboard                     |           17 |   3 |  835 |    895 |      | 1016 |           877 |                       — / — |
| `/get-tenure-distribution`                 | Analytics                     |           10 |   3 |  825 |    872 |      |  904 |           448 |               207 B / 139 B |
| `/notice-period-policies`                  | Settings                      |           20 |   3 |  770 |    872 |      | 1023 |           859 |               355 B / 250 B |
| `/get-age-distribution`                    | Analytics                     |           10 |   3 |  806 |    838 |      |  902 |           436 |               192 B / 137 B |
| `/tenant-settings`                         | Leave, Settings               |           16 |  15 |  726 |    794 | 1095 | 1128 |           788 |               721 B / 441 B |
| `/audit-logs`                              | Audit Logs                    |            9 |   3 |  774 |    774 |      | 9344 |           764 |          760.0 KB / 16.7 KB |
| `/get-org-chart`                           | Organization                  |           11 |   3 |  631 |    673 |      |  679 |           662 |            15.9 KB / 4.0 KB |
| `/get-user-data/:username`                 | KYC                           |            1 |   3 |  343 |    637 |      |  665 |           628 |             3.0 KB / 1.1 KB |
| `/dashboard`                               | Dashboard                     |           14 |   5 |  570 |    633 |  650 |  653 |           621 |              5.1 KB / 831 B |
| `/birthdays-anniversaries`                 | Dashboard                     |            9 |   5 |  505 |    630 | 1221 | 1339 |           351 |              1.8 KB / 466 B |
| `/walkthrough/progress`                    | Dashboard                     |           14 |   3 |  535 |    619 |      |  670 |               |                       — / — |
| `/chat/conversations`                      | Chat                          |           12 |   3 |  606 |    613 |      | 1444 |           605 |             6.1 KB / 2.0 KB |
| `/ai-connections`                          | AI Assistants                 |           13 |   3 |  538 |    594 |      |  837 |           583 |              1.4 KB / 472 B |
| `/chat/unread-counts`                      | Chat, Dashboard               |           12 |   6 |  450 |    558 |  748 |  796 |           549 |               206 B / 164 B |
| `/get-teams`                               | Permissions                   |           11 |   3 |  546 |    547 |      |  671 |           537 |            16.9 KB / 3.8 KB |
| `/get-role-and-permissions`                | Permissions                   |           11 |   3 |  509 |    536 |      |  681 |           528 |              3.5 KB / 714 B |
| `/view-applications/:id`                   | Recruitment                   |            5 |   1 |  522 |    522 |      |  522 |               |                       — / — |
| `/get-roles`                               | Permissions                   |           11 |   3 |  504 |    517 |      |  535 |           507 |              3.5 KB / 724 B |
| `/get-employee-designations`               | Analytics                     |           10 |   3 |  398 |    478 |      |  506 |           457 |              1.5 KB / 450 B |
| `/get-hr-activities`                       | Announcements, Dashboard      |            6 |   8 |  259 |    468 | 1076 | 1305 |           272 |              1.8 KB / 743 B |
| `/get-headcount-growth`                    | Analytics                     |           10 |   3 |  448 |    458 |      |  480 |           449 |               916 B / 202 B |
| `/get-joining-data`                        | Analytics                     |           10 |   3 |  448 |    454 |      |  481 |           448 |               820 B / 200 B |
| `/get-compensation-breakdown`              | Analytics                     |           10 |   3 |  412 |    445 |      |  525 |           434 |               181 B / 157 B |
| `/get-salary-distribution-by-department`   | Analytics                     |           10 |   3 |  401 |    444 |      |  524 |           435 |               278 B / 162 B |
| `/get-job-openings-by-status`              | Analytics                     |           10 |   3 |  379 |    443 |      |  453 |           429 |               125 B / 122 B |
| `/get-applications-by-job-role`            | Analytics                     |           10 |   3 |  371 |    443 |      |  489 |           431 |               253 B / 179 B |
| `/get-average-salary-by-designation`       | Analytics                     |           10 |   3 |  442 |    443 |      | 1220 |           432 |               288 B / 168 B |
| `/get-monthly-leave-patterns`              | Analytics                     |           10 |   3 |  381 |    436 |      |  482 |           423 |               317 B / 153 B |
| `/get-employment-type-breakdown`           | Analytics                     |           10 |   3 |  416 |    434 |      |  507 |           418 |               125 B / 121 B |
| `/get-employee-status-distribution`        | Analytics                     |           10 |   3 |  415 |    433 |      |  502 |           418 |               165 B / 136 B |
| `/get-working-hours-distribution`          | Analytics                     |           10 |   3 |  364 |    432 |      |  744 |           421 |               206 B / 146 B |
| `/get-employee-departments`                | Analytics                     |           10 |   3 |  416 |    429 |      |  450 |           410 |               348 B / 196 B |
| `/get-calendar-events`                     | Calendar, Dashboard           |            9 |   8 |  296 |    423 | 1108 | 1369 |           368 |               634 B / 358 B |
| `/get-leave-type-breakdown`                | Analytics                     |           10 |   3 |  326 |    421 |      | 1004 |           412 |               233 B / 159 B |
| `/get-notifications`                       | Dashboard                     |            8 |   3 |  401 |    417 |      |  446 |           407 |                       — / — |
| `/get-holidays/:year`                      | Calendar, Dashboard, Holidays |            9 |  11 |  333 |    400 |  924 | 1363 |           391 |               677 B / 238 B |
| `/get-salary-bands`                        | Analytics                     |           10 |   3 |  386 |    398 |      |  443 |           387 |               107 B / 114 B |
| `/get-leave-approval-rate`                 | Analytics                     |           10 |   3 |  364 |    382 |      |  483 |           372 |               139 B / 127 B |
| `/my-resignation`                          | Resignations                  |            5 |   6 |  236 |    379 |  751 |  838 |           372 |               828 B / 464 B |
| `/get-hiring-funnel`                       | Analytics                     |           10 |   3 |  369 |    372 |      |  467 |           360 |               149 B / 132 B |
| `/get-hiring-manager-performance`          | Analytics                     |           10 |   3 |  336 |    371 |      |  468 |           358 |               259 B / 173 B |
| `/view-resignations`                       | Resignations                  |            5 |   3 |  272 |    353 |      | 1145 |           343 |             5.8 KB / 1.2 KB |
| `/get-leave-applications`                  | Leave                         |            4 |   5 |  223 |    304 |  639 |  669 |           296 |              4.0 KB / 822 B |
| `/resignation-insights`                    | Resignations                  |            5 |   3 |  279 |    293 |      |  332 |           287 |               185 B / 160 B |
| `/job-openings-insights`                   | Recruitment                   |            5 |   3 |  265 |    281 |      |  290 |           275 |              1.0 KB / 505 B |
| `/get-all-attendances/:year/:month`        | Attendance                    |            3 |   3 |  225 |    272 |      |  308 |           261 |              4.1 KB / 718 B |
| `/policies`                                | Policies                      |            6 |   3 |  227 |    270 |      |  322 |           262 |            10.0 KB / 3.0 KB |
| `/attendance-insights`                     | Attendance                    |            3 |   3 |  197 |    250 |      |  271 |           241 |               804 B / 422 B |
| `/view-job-opening/:id`                    | Recruitment                   |            5 |   1 |  249 |    249 |      |  249 |           242 |                       — / — |
| `/get-attendance-summary/:id/:year/:month` | Attendance, Dashboard         |            3 |   8 |  143 |    220 |  798 | 1003 |           196 |               265 B / 192 B |
| `/view-job-openings`                       | Recruitment                   |            5 |   4 |  190 |    207 |      |  750 |           197 |              2.4 KB / 651 B |
| `/view-all-kycs`                           | Employees, KYC, Payroll       |            2 |  13 |  138 |    207 |  237 |  245 |           199 |             6.3 KB / 1.3 KB |
| `/get-attendances/:year/:month`            | Attendance, Dashboard         |            3 |   8 |  123 |    177 |  706 |  985 |           168 |              3.0 KB / 319 B |
| `/tenants/join-requests`                   | Settings                      |            0 |   3 |  136 |    151 |      |  374 |           140 |               207 B / 180 B |
| `/support/tickets`                         | Support                       |            0 |   3 |  106 |    134 |      |  138 |               |               597 B / 390 B |
| `/get-kyc-insights`                        | KYC                           |            2 |   3 |  112 |    118 |      |  189 |           109 |               174 B / 161 B |
| `/employee-insights`                       | Employees                     |            2 |   3 |   79 |    115 |      |  130 |           105 |               727 B / 290 B |
| `/get-all-users`                           | Performance, Permissions      |            1 |   4 |   62 |    113 |      |  398 |           102 |           111.3 KB / 6.3 KB |
| `/support/stats`                           | Support                       |            0 |   3 |   83 |     97 |      |  521 |               |                99 B / 103 B |
| `/tenants/me`                              | Subscription                  |            0 |   3 |   81 |     84 |      |  143 |            76 |               986 B / 560 B |
| `/get-employee-details/:username`          | Profile                       |            2 |   3 |   76 |     83 |      |  786 |            73 |              1.0 KB / 471 B |
| `/tenants/org-profile`                     | Settings                      |            0 |   3 |   75 |     82 |      |   86 |            75 |               287 B / 212 B |
| `/profile`                                 | Dashboard                     |            0 |   3 |   74 |     77 |      |   97 |            70 |                       — / — |
| `/csrf-token`                              | Dashboard, KYC                |            0 |   4 |    6 |      8 |      |    9 |               |               209 B / 162 B |

Cold vs warm: `/dashboard/data` took 5,922 and 7,622 ms on the first cold load, 1,204/1,904 and 825/1,416 on the next two, and 674–1,399 ms during SPA revisits. `/audit-logs` took 9,344 ms on the first visit and 774 / 774 ms afterwards (the server answered **304** to the browser's revalidation, so the server still ran the full handler). Every other endpoint varied by less than about 2× between passes.

## 14. Duplicate request analysis

| Pattern                                                                                                                  | Evidence (measured)                                                                                             | Cause (from code)                                                                                                                                                                                                                                                                                                     | Bug?                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/get-attendance-trends` requested **3×** on `/analytics/leave-attendance` in pass 1 (one aborted), 2× in passes 2 and 3 | 6 completed + 1 failed samples on one page                                                                      | `features/analytics/Analytics.tsx` lines 234 and 249: two `<Data url="/get-attendance-trends">` blocks (rate and hours charts), each with its own `useFetchData`. `axiosConfig.ts` cancels an in-flight same-URL GET ("superseded") instead of sharing it, so the duplicate either aborts the first call or both run. | Yes. Fetch once and pass the data to both charts.                  |
| `/tenant-settings`: **15 calls**, one per Settings sub-page plus Apply Leave                                             | ~790 ms each                                                                                                    | Each settings page and `ApplyLeavePage` fetch it independently; nothing is shared or cached on the client                                                                                                                                                                                                             | Yes, wasteful. The data rarely changes within a session.           |
| `/performance-reviews?userId=me` and `?reviewerId=me`                                                                    | Both run on every `/performance-reviews/reviews` visit, in parallel, with identical 645 B bodies in this tenant | Two lists ("mine" vs "to review")                                                                                                                                                                                                                                                                                     | Not a bug; two distinct queries. Combining them is optional (P3).  |
| `/exit-interview-templates` on both the Exit Feedback and Exit Policy pages; `/my-resignation` on both resignation pages | 6 samples each                                                                                                  | Independent page fetches                                                                                                                                                                                                                                                                                              | Minor; cache per session.                                          |
| Dashboard revisit (passes 2 and 3) refetches all 9 dashboard calls                                                       | 9 requests per visit                                                                                            | The dashboard data layer refetches on every mount (the offline cache only paints sooner)                                                                                                                                                                                                                              | By design. Revalidation is acceptable once the endpoints are fast. |
| React Strict Mode                                                                                                        | —                                                                                                               | Production build (no Strict Mode double effects observed; every duplicate above has a code-level cause)                                                                                                                                                                                                               | —                                                                  |

## 15. Excessive API fan-out

| Screen                       |        Calls on open | Notes                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | -------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today (cold load)**        | 16 (+ CSRF, refresh) | Waterfall: `csrf` (7 ms) → `refresh-token` (~240) → `profile` (~80) → {notifications, walkthrough, unread-counts, **dashboard**, approvals} → _only after `/dashboard` returns (~630 ms)_ → {attendances, attendance-summary, holidays, hr-activities, birthdays, calendar, **dashboard/data × 2**}. `dashboard/data` starts about **1,040 ms** after navigation in every cold sample. |
| Workforce analytics          |                    8 | One request per chart. Local HTTP/1.1 queued the 7th/8th for ~430 ms.                                                                                                                                                                                                                                                                                                                  |
| Leave & attendance analytics |                    7 | Includes the duplicate above.                                                                                                                                                                                                                                                                                                                                                          |
| Settings → Payroll           |                    4 | `tds-slabs`, `pt-slabs`, `pay-cycles`, `salary-component-definitions`, each 0.9–1.2 s purely from guard passes.                                                                                                                                                                                                                                                                        |
| Performance reviews          |                    4 | Includes `get-all-users?limit=500` (111 KB decoded) for name lookups.                                                                                                                                                                                                                                                                                                                  |

**Recommendation:** after the guard fix, fan-out of 4–8 small calls is acceptable. Do **not** merge analytics endpoints into one large payload. The dashboard waterfall is the one sequential dependency worth breaking (§17).

## 16. Large payload analysis

| Endpoint                                   |    Decoded | Encoded | Observation                                                                                                                                                          |
| ------------------------------------------ | ---------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/audit-logs?days=7`                       | **760 KB** | 16.7 KB | 200 rows (`NOTIFICATION_PRUNE_LIMIT`), each with full `oldValue`/`newValue` JSON plus user agent. Highly repetitive (45:1 compression). No pagination or projection. |
| `/get-all-users?limit=500` / `?limit=1000` | **111 KB** |  6.3 KB | Used by Performance reviews (name lookup) and User Permissions. Fast to serve (1st router), but parse and memory cost grow with headcount.                           |
| `/get-teams`                               |    16.9 KB |  3.8 KB | Teams with embedded member data.                                                                                                                                     |
| `/get-org-chart`                           |    15.9 KB |  4.0 KB | Whole org tree; acceptable for small tenants.                                                                                                                        |
| `/policies?limit=50`                       |    10.0 KB |  3.0 KB | Full policy bodies in the list.                                                                                                                                      |
| `/view-all-kycs?limit=25`                  |     6.3 KB |  1.3 KB | Fine.                                                                                                                                                                |

Compression is working (gzip or brotli via nginx/gateway). Payload size is **not** a driver of latency here: download time was ≤ 3 ms for every response.

## 17. Frontend bottlenecks

1. **Dashboard waterfall** (`features/dashboard/data.ts`): `/dashboard/data?ids=…` is only issued once `/dashboard` returns the layout, which adds ~630 ms to the critical path. The layout is already cached in IndexedDB (`dashboard-cache`). **Recommendation:** fire `/dashboard/data` with the cached widget ids in parallel with `/dashboard`, then reconcile if the layout changed. The server still authorises every widget id, so there is no security change.
2. **Same-URL GET cancellation** (`axiosConfig.ts` ~L288): a second identical GET aborts the first instead of joining it. That wastes server work (the server keeps running the aborted request) and caused the triple `/get-attendance-trends`. **Recommendation:** share the in-flight promise for identical GETs (keyed by URL plus token scope), keeping abort-on-unmount for the last subscriber.
3. **`useFetchData` "cache" never skips the network:** stale-while-revalidate paints cached `/get-*` data first but always refetches, so all 8 analytics calls repeat on every visit. **Recommendation (P3):** skip the network when the cache entry is younger than its TTL.
4. **`tenant-settings` refetched per page:** hoist it into a session-level provider or a hook with a module-level cache, invalidated on save.
5. **`POST /upload/view-url` returns 400** on every visit to `/kyc/complete-kyc` (3/3 visits). This is a functional bug, probably an empty key for a missing document, and costs ~380 ms per visit.
6. **Local only:** HTTP/1.1 nginx queues the 7th and later parallel requests (measured queue medians: `get-tenure-distribution` 432 ms, `get-age-distribution` 428 ms, `get-hr-activities` 207 ms, `birthdays-anniversaries` 191 ms). Adding `http2` to `listen 443 ssl` in `docker/nginx.conf` removes this locally. Confirm production serves HTTP/2 end to end.
7. Search is debounced correctly: typing "kum" produced **one** request (232 ms).

## 18. Backend bottlenecks

### Finding B1: Path-less `subscriptionGuard` runs once per router mount (primary root cause)

- **Endpoint:** every business route; cost grows with mount position (1–27 passes).
- **Module:** all.
- **Observed latency:** see §8 and §13. Unmatched path median 935 ms (n = 5); `/payroll/advances` 1,051 ms (n = 5 probes) / 1,264 ms (n = 3 in-app); `/employee-insights` 77 ms (n = 5).
- **Samples:** 35 controlled probes plus 349 in-app requests.
- **Frontend location:** n/a.
- **Backend location:** `apps/api-gateway/src/routes/index.ts` lines 98–151: `rootRouter.use(...subscriptionGuard, xRouter)` repeated for 26 path-less routers and 7 prefixed routers. Each pass runs:
  - `defaultLimiter`: a Redis-store `express-rate-limit` increment (`middleware/rateLimiter.ts`).
  - `authenticate`: `jwt.verify`, two cached lookups, and **two new nested AsyncLocalStorage contexts** (`middleware/authenticate.ts`).
  - `requireActiveSubscription`: **uncached** `prisma.tenant.findUnique` on the master DB (`middleware/requireActiveSubscription.ts`).
  - Several routers then add their own `authenticate` per route, and `tenantSettings.ts` adds `requireActiveSubscription` again.
- **Database location:** `tenants` collection by `_id` (cheap query; the cost is the round trip, repeated up to 27 times).
- **Evidence:** linear latency vs mount position (R² 0.94). A 404 with no handler costs 935 ms. Rate-limit units per request equal the number of passes plus the 2 pre-guard limiters (1 / 4 / 29). Gateway-logged server time equals browser time (±10 ms), which rules out the network.
- **Root cause:** **Confirmed** by measurements and implementation evidence.
- **Confidence:** High.
- **Recommended fix:** create one `businessRouter`, apply `subscriptionGuard` to it **once**, then mount all business routers inside it in the same order. Keep `/support`, `/platform/support` and `/walkthrough` outside it (they intentionally skip the subscription check) and mount them before it, as today. Optionally memoise `getSubscriptionAccess` per tenant for 30–60 s in process (Redis is not needed) to remove the Atlas trip from every request, accepting that up to 60 s can pass before an expiry takes effect.
- **Expected benefit (Estimate):** about 35.8 ms × (passes − 1) saved per request locally: ~0.93 s on `/payroll/*`, `/assets/*`, `/wfh/*`, `/helpdesk/*`, `/reports/*` and `/performance-reviews/*`; ~0.54 s on `/tenant-settings`; ~0.32 s on analytics. Production savings are proportional to production's Redis and Atlas round-trip times, which were not measured.
- **Risks:** (a) Unmatched `/api/v1/*` paths would get 401/402 from the single guard before their 404, the same as today. (b) Effective rate limits become the documented 5,000/min, which is looser than the accidental ~170/min on late routes; review the limit itself. (c) The idempotency middleware would run once instead of N times; check that it is safe to run once (it currently runs repeatedly and only acts on mutations with an Idempotency-Key, so once is the intended behaviour).
- **Validation:** rerun the probe script. Expected: `unmatched-404` close to `tenants/me` (~80–120 ms locally), slope near 0 ms per position, and `RateLimit-Remaining` decreasing by ≤ 3 per request.

### Finding B2: `GET /dashboard/data` is slow and highly variable

- **Endpoint:** `/dashboard/data?ids=…` (two calls per load: `org-today` plus up to 13 other widgets).
- **Module:** Today dashboard (also called from Apply Leave for `leave-balance`).
- **Observed latency:** n = 13; min 674, median 1,399, P95 6,602, max 7,622 ms. Server-side median 1,389 ms.
- **Frontend location:** `apps/web/src/features/dashboard/data.ts` (`DASHBOARD_ENDPOINTS.DATA`), `personal.tsx`.
- **Backend location:** `apps/api-gateway/src/handlers/dashboard.ts`, `getDashboardData` (L1007). It re-runs `resolveCaller` (user plus teams) and `loadLayout` (preferences plus `activeDepartments` groupBy), which `GET /dashboard` already did, and then runs the widget loaders concurrently. Each loader makes 1–3 dependent rounds of Prisma queries (for example `statusToday`, workforce, payroll and review-cycle loaders), and `leave-balance` calls leave-service over gRPC.
- **Database location:** many collections in the tenant DB plus master `users`; about 25–40 queries per call (count from code).
- **Evidence:** 14 guard passes ≈ 0.5 s of the median. The remaining ~0.9 s comes from the duplicated caller/layout work plus the slowest loader. The 6–7.6 s cold outliers happened on the first load after sign-in.
- **Root cause:** guard overhead **confirmed**. Per-widget cost **requires instrumentation**: no per-loader timing exists. The cold outlier is **hypothesised** to be Atlas cold reads or pool warm-up, not confirmed.
- **Confidence:** High for the guard share; medium for the rest.
- **Recommended fix:** (1) B1. (2) Log per-loader durations (one `logger.debug` with `{id, ms}`). (3) Cache org-wide widgets (`org-today`, `headcount-trend`, `workforce`, `joiners-leavers`, `attendance-trend`) in Redis for 60–120 s, keyed `t:{tenantId}:dash:{widget}:{settingsHash}`. Check capability **before** reading the cache, never cache personal widgets under a tenant-wide key, and invalidate on attendance or leave writes if needed. (4) Break the client waterfall (§17.1).
- **Expected benefit (Estimate):** about −0.47 s from B1. Caching removes most DB work on repeat loads within the TTL.
- **Risks:** staleness of up to the TTL on headcount and "who's in today"; cross-tenant leakage if the key omits `tenantId` (it must not).
- **Validation:** per-loader logs; dashboard cold and warm medians from the same Playwright runner.

### Finding B3: `GET /audit-logs` returns 200 full rows; 9.3 s cold

- **Endpoint:** `/audit-logs?days=7`. **Module:** Audit Logs (owners/admins).
- **Observed latency:** n = 3: 9,344, 774, 774 ms. The server logged 9,332 ms, then two 304s at 764 and 763 ms. Payload 760 KB decoded.
- **Frontend location:** `features/audit` (renders the list client-side).
- **Backend location:** `handlers/general.ts` `getAuditLogs` (L297): `prisma.auditLog.findMany({ where: { timestamp ≥ now − days }, orderBy: timestamp desc, take: 200 })` with no `select`, then `redactAuditValue` on old and new values for every row.
- **Database location:** tenant `auditlogs`. The index `[tenantId, timestamp]` exists in the schema. Whether the tenant proxy injects `tenantId` here, and whether the plan is IXSCAN, was **not verified**: the MongoDB MCP in this environment is connected to an unrelated local instance, and I did not connect to Atlas with credentials.
- **Evidence:** 9 guard passes ≈ 0.32 s; the rest is handler, DB and serialisation. The 12× cold/warm gap points at Atlas cache misses on large documents (**hypothesis**). ETag 304 saves transfer but not server work.
- **Root cause:** oversized, unpaginated response **confirmed** from code and payload. Cold cost **requires** `explain("executionStats")` on Atlas.
- **Confidence:** Medium.
- **Recommended fix:** cursor pagination (`timestamp < cursor`, `take: 50`); `select` without `oldValue`/`newValue`/`userAgent` in the list; fetch the diff on row expand (`GET /audit-logs/:id`).
- **Expected benefit (Estimate):** payload down about 10×; cold time proportional to the documents read.
- **Risks:** UI change for expand-to-view-diff; export features may need the full rows.
- **Validation:** read-only `explain` on Atlas; Playwright cold visit after a gateway restart.

### Finding B4: Performance reviews page about 2 s

- **Endpoints:** `/performance-reviews?userId=`, `?reviewerId=`, `/performance-reviews/cycles?limit=200`, plus `/get-all-users?limit=500`.
- **Observed latency:** reviews median 2,103 ms (n = 6, max 2,963); cycles median 1,400 ms (n = 6, max 2,946). Gateway logs agree. The gRPC service took 40–335 ms.
- **Backend location:** `handlers/performanceReview.ts` → `performanceReviewClient` gRPC. The router is prefixed and mounted after 26 path-less guards (27 passes).
- **Database location:** `performance_reviews`, indexed `[tenantId,userId]`, `[tenantId,status]` and unique `[cycleId,userId]`. **There is no index covering `reviewerId`.**
- **Evidence:** 27 × 35.8 ≈ 0.97 s of guard cost plus ≤ 0.34 s of gRPC. The rest (~0.5–1 s) appears only when the 4 requests run **concurrently**: 4 × 27 Atlas lookups at once. This is **hypothesised** to be connection-pool contention on the master Prisma client, which has no explicit pool size (unlike tenant clients, which have `maxPoolSize=50`).
- **Root cause:** guard share **confirmed**. Pool contention **requires instrumentation**. The missing `reviewerId` index is **not** the current cause (the gRPC side is fast) but will matter as data grows.
- **Recommended fix:** B1. Later, add `@@index([tenantId, reviewerId])`. That needs a schema change and `db:migrate`, which requires approval. Replace `get-all-users?limit=500` with the remote `UserCombobox` search or a projected `{id, name}` endpoint.
- **Validation:** same page in the runner; Prometheus `grpc_request_duration_ms` vs gateway duration.

### Other backend notes

- `/get-user-data/:username` (KYC form, 637 ms median at only 1 guard pass): sequential gRPC `getUser`, then a salary gRPC call (`handlers/user.ts`). These could run in parallel if independent (P3, verify first).
- `/approvals/pending-all` (895 ms): 17 guard passes ≈ 0.6 s. The handler already parallelises 3 sources.
- `/tenant-settings`: 16 path-less passes **plus** a route-level `[authenticate, requireTenant, requireActiveSubscription]`, giving 17 tenant lookups per call.
- `/walkthrough/progress` (619 ms): mounted after 14 path-less guards even though it deliberately skips the subscription check, so it still pays 14 passes.

## 19. MongoDB and Mongoose (Prisma) findings

- **ODM:** Prisma for MongoDB, not Mongoose. Comments about `.lean()` and `.populate()` don't apply; the Prisma equivalents are `select` and `include`.
- **Repeated identical query per request:** `tenants.findUnique({_id})` runs up to 27 times per request (B1). This is the dominant query-count problem.
- **Missing index (code evidence):** `PerformanceReview.reviewerId` is queried by the reviews page but not indexed. **Recommendation:** `@@index([tenantId, reviewerId])`. Trade-off: one more index write per review upsert and a few KB per tenant. It needs `db:migrate` against the shared Atlas cluster, so **approval is required**.
- **Unpaginated list:** `auditLog.findMany` takes 200 full documents (B3).
- **Connection budget (risk, not measured):** each tenant `PrismaClient` has `maxPoolSize=50`, with up to 50 cached clients, giving a theoretical ceiling of **2,500 connections per gateway process** on top of the master client and the 12 services' own clients. Check this against the Atlas tier's connection limit before raising any pool. **Do not increase pools.** B1 cuts master-DB query volume by up to about 25×.
- **Query plans:** not collected. The MongoDB MCP available here is connected to an unrelated local instance (`rentrecord`, `clamav`), and connecting to Atlas would have meant reading credentials from `local-secrets.json`, which I did not do. **Next step:** run read-only `explain("executionStats")` on Atlas for the audit-log and review queries.

## 20. Redis and caching opportunities

| Candidate                                                                                   | Key                                                         | Tenant / permission handling                                                                   | TTL                            | Invalidation                                                                                                                | Expected effect (Estimate)                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Subscription access (`getSubscriptionAccess`)                                               | in-process `Map<tenantId, {access, at}>` (Redis not needed) | Per tenant; not user data                                                                      | 30–60 s                        | Clear the entry in payment/subscription webhook handlers on the same instance; with multiple replicas, accept TTL staleness | Removes 1 Atlas round trip per request after B1     |
| Org-wide dashboard widgets                                                                  | `t:{tenantId}:dash:{widgetId}:{settingsHash}`               | Check capability **before** reading the cache; never cache personal widgets under a tenant key | 60–120 s                       | Optional delete on attendance/leave writes                                                                                  | Most of `/dashboard/data`'s DB work on repeat loads |
| `tenant-settings`                                                                           | `t:{tenantId}:tenant-settings`                              | Any member may read today; keep the same check                                                 | 10 min                         | Delete on `PUT /tenant-settings` and pending-settings cancel                                                                | ~1 Atlas query per settings page                    |
| Payroll/exit/recruitment reference lists (`tds-slabs`, `pt-slabs`, `pay-cycles`, templates) | `t:{tenantId}:ref:{name}`                                   | Same as handlers                                                                               | 10–30 min                      | Delete on the matching writes                                                                                               | Small; these are cheap once B1 is fixed             |
| Analytics `/get-*` aggregates                                                               | `t:{tenantId}:an:{endpoint}:{params}`                       | HR-gated routes: keep the authorisation middleware in front of the cache                       | 5 min (matches the client TTL) | Time-based only                                                                                                             | Medium for larger tenants                           |

Stampede protection: for dashboard and analytics, use a short in-process single-flight (`Map<key, Promise>`) so concurrent misses share one computation. **Caching never replaces the authorisation middleware.** Every cache read happens after `authenticate` and the route's role check, and every key includes `tenantId`.

## 21. Infrastructure findings

- **Network overhead between browser and gateway ≈ 10 ms** (median browser − server across 288 matched requests): no proxy or network problem locally.
- **Local nginx is HTTP/1.1** (no `http2` on `listen 443 ssl`), which adds 190–430 ms of queueing on pages with more than 6 parallel calls. This is local only; not verified for production.
- **Production gateway** (`docker-compose.prod.yml`): one instance with 1.0 CPU and 768 MB, sharing an EC2 host with 12 services. B1 also cuts CPU per request (up to 27 `jwt.verify` and 54 ALS contexts per request). The CPU impact was **not measured**.
- **Redis location:** the gateway's rate-limit keys (`rl:*`) were not in the Redis that the Redis MCP connects to (`hrms-dev-redis`, empty scan), so the gateway probably uses a different Redis endpoint. Its round-trip time is therefore unknown. That matters for B1's per-pass cost split (Redis vs Atlas), which **requires instrumentation**.
- **Event loop / CPU:** not measured.

## 22. Confirmed root causes vs hypotheses

| #   | Statement                                                                                           | Status                                                            |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Path-less `subscriptionGuard` repeated per router multiplies per-request latency by router position | **Confirmed** (controlled probes, R² 0.94; 404 probe; code)       |
| 2   | Rate limiter charged once per guard pass (29 units per `/payroll` request)                          | **Confirmed** (`RateLimit-Remaining` deltas; code)                |
| 3   | Latency is server-side, not network                                                                 | **Confirmed** (browser − server ≈ 10 ms, n = 288)                 |
| 4   | `/dashboard/data` waits for `/dashboard` (client waterfall)                                         | **Confirmed** (all 3 cold loads start it about 1,040 ms in; code) |
| 5   | `/dashboard/data` duplicates `resolveCaller`/`loadLayout`                                           | **Confirmed** (code); its time share is **unmeasured**            |
| 6   | `/get-attendance-trends` duplicate caused by two `<Data>` blocks plus axios cancel-dedupe           | **Confirmed** (code plus 3 requests including 1 aborted)          |
| 7   | `/tenant-settings` refetched per page                                                               | **Confirmed** (15 calls)                                          |
| 8   | Audit logs oversized and unpaginated                                                                | **Confirmed** (760 KB for 200 rows; code)                         |
| 9   | Audit-log 9.3 s cold caused by Atlas cache misses                                                   | **Hypothesis**; needs `explain` and Atlas metrics                 |
| 10  | Extra latency on concurrent pages caused by master Prisma pool contention                           | **Hypothesis**; needs pool-wait/query metrics                     |
| 11  | Per-guard cost split between Redis and Atlas                                                        | **Requires instrumentation**                                      |
| 12  | Missing `reviewerId` index affects latency                                                          | **Not currently** (gRPC 40–335 ms); a future risk                 |

## 23. Prioritised remediation backlog

Also available as [`api-performance-backlog.csv`](./api-performance-backlog.csv).

| #   | Priority                                                  | Item                                                                                                                        | Evidence                      | Effort       | Expected benefit (Estimate)                                              | Risk                                                    |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1   | **P1** (availability-adjacent) ✅ _Done locally; see §27_ | Mount `subscriptionGuard` once on a single business router; move `/walkthrough` and `/support` before it                    | B1; probes; rate-limit deltas | **Small**    | −0.3 to −0.95 s on ~60 % of GET endpoints; correct rate-limit accounting | Low; route order must be preserved; review limit values |
| 2   | P1                                                        | Memoise `getSubscriptionAccess` per tenant (30–60 s)                                                                        | B1                            | Small        | −1 Atlas round trip per request                                          | Expiry takes effect up to TTL late                      |
| 3   | P1                                                        | Dashboard: fire `/dashboard/data` with cached ids in parallel; stop re-running caller/layout; add per-loader timing         | B2; waterfall                 | Medium       | About −0.6 s off the Today critical path (cold), plus the loader share   | Low                                                     |
| 4   | P2                                                        | Cache org-wide dashboard widgets in Redis (tenant-keyed, capability-checked first)                                          | B2                            | Medium       | Most widget DB work on repeat loads                                      | Staleness up to TTL; key hygiene                        |
| 5   | P2                                                        | Paginate and project `/audit-logs`; fetch diffs on expand                                                                   | B3                            | Medium       | ~10× smaller payload; lower cold time                                    | UI change                                               |
| 6   | P2                                                        | Share `tenant-settings` across pages (client) and/or Redis-cache it (server)                                                | 15 calls × ~0.8 s             | Small        | −1 call per settings page                                                | Invalidate on save                                      |
| 7   | P2                                                        | Measure Mongo pool waits and connections; set an explicit master pool; review tenant 50 × 50 budget against the Atlas limit | B4, §19                       | Medium       | Prevents contention and connection exhaustion                            | Requires care; do not just raise limits                 |
| 8   | P3                                                        | Fix the duplicate `/get-attendance-trends`; change axios same-URL GET handling from cancel to share                         | §14                           | Small        | −1 request per analytics visit; less wasted server work                  | Low                                                     |
| 9   | P3                                                        | `useFetchData`: skip the network when the cache is fresh                                                                    | §17.3                         | Small        | −8 calls per analytics revisit                                           | Slightly staler charts (≤ 5 min)                        |
| 10  | P3                                                        | Replace `get-all-users?limit=500/1000` (111 KB) with remote search or a projected endpoint                                  | §16                           | Small–Medium | Scales with headcount                                                    | Low                                                     |
| 11  | P3                                                        | Fix `POST /upload/view-url` 400 on the KYC form                                                                             | §17.5                         | Small        | −380 ms and a console error per visit                                    | Low                                                     |
| 12  | P3                                                        | Add `@@index([tenantId, reviewerId])` to `PerformanceReview` (**needs approval plus `db:migrate`**)                         | §19                           | Small        | Future-proofing                                                          | Index write cost (tiny)                                 |
| 13  | P3 (local)                                                | `listen 443 ssl http2;` in `docker/nginx.conf`; verify production HTTP/2                                                    | §17.6                         | Small        | −190 to −430 ms on 7+ parallel calls locally                             | None                                                    |
| 14  | P3                                                        | Fix Prometheus `route` label (use `req.baseUrl + req.route.path`)                                                           | §24                           | Small        | Correct per-route dashboards                                             | None                                                    |

## 24. Suggested instrumentation improvements

1. **Fix the existing histogram's `route` label.** `packages/logger` uses `req.route?.path`, which drops the router prefix. Prometheus currently shows `GET /`, `/tickets` (helpdesk and support conflated) and `/progress`. Use `${req.baseUrl}${req.route?.path ?? ''}`, and log the same value as `route` in the "HTTP Request" line next to `url`.
2. **`Server-Timing` response header** (dev and staging, optionally prod) with phases: `mw;dur=…` (time until the handler starts), `db;dur=…;desc="n=…"`, `grpc;dur=…` and `redis;dur=…`. These show in DevTools and in this audit's recorder, which already captures `server-timing`.
3. **Per-request DB counters.** A Prisma `$extends({ query: { $allModels: { $allOperations } } })` on the master and tenant clients that adds query count and duration to an AsyncLocalStorage bag read by the request logger. Log `dbQueries`, `dbMs` and `grpcMs`.
4. **Dashboard per-loader timing:** `{widget, ms, ok}` per loader.
5. **Mongo pool metrics.** Prisma's `$metrics` (preview feature `metrics`) exposes pool wait and open connections; scrape them into Prometheus.
6. **Privacy:** log `tenantId` as a short hash, never tokens, cookies, emails or names. The current log line has `url` with query strings: keep `search=` values out (redact like the CSV here does).

## 25. Recommended validation plan

1. Reuse the recorder and route runner from this audit: [`tooling/recorder.js`](./tooling/recorder.js) and [`tooling/route-sweep.js`](./tooling/route-sweep.js) (run each via Playwright MCP `browser_run_code_unsafe`; the sweep processes `ctx.__nav = {pass, start, n}` routes per call). After each fix, rebuild the affected containers (`docker compose -f docker-compose.dev.yml up -d --build api-gateway`, plus `web` for frontend fixes).
2. **B1 acceptance test:** rerun the 7-endpoint probe set (5 rounds, interleaved).
   - Pass: the unmatched-404 median is within about 50 ms of the `tenants/me` median; the fitted slope is under 3 ms per position; `RateLimit-Remaining` drops by ≤ 3 per request.
3. **Full sweep:** 3 passes × 63 routes plus 3 cold loads, comparing per-endpoint medians to this baseline. Expected: the 0.9–1.6 s cluster disappears. Report any endpoint still above 300 ms as a handler-level issue.
4. **Dashboard:** cold-load timeline. `/dashboard/data` should start at the same time as `/dashboard`, not about 1 s later.
5. **Production check (after deploy):** the same probe pair (`/tenants/me` vs an unmatched path) from a signed-in browser on praesto.in, before and after. This gives the production per-pass cost, which this audit could not measure.

## 26. Limitations and modules not tested

- Single session, single instance, local stack against shared Atlas. Absolute numbers include Mac → Atlas latency and will differ in production; ratios and the multiplication effect will not.
- 3 samples per endpoint for most routes (P95 only where n ≥ 5). Probes have 5 per endpoint. No load testing (by design).
- Query plans (`explain`) were not collected (see §19). The Redis RTT for the gateway's Redis is unknown.
- Pages not exercised: chat thread detail (marks messages read), other users' profiles and KYC review (PII), report execution, PDF downloads, and every mutation flow. The platform support console is not available to this account.
- 62 responses (mostly cold-load ones) have no payload size (Resource Timing was collected only during SPA passes).
- For `/audit-logs`, warm samples were browser cache revalidations (304 from the server, seen as 200 by the page). The CSV marks status as observed by the page.
- The audit recorded timings with the application's production build served by the local `hrms-dev-web` container; no code was modified during the audit.

---

## 27. Remediation log

Sections 1–26 above are the **original baseline** and are kept unchanged. Each fix is recorded here with its own before/after measurements, so that improvements can be attributed to individual changes.

### Fix 1: run the gateway guard once per request (backlog #1, finding B1)

**Status:** implemented and measured locally on 2026-10-31. **Not committed, not deployed.**

#### What changed

Only one source file changed: [`apps/api-gateway/src/routes/index.ts`](../../apps/api-gateway/src/routes/index.ts). There is one new test file: [`apps/api-gateway/src/__tests__/routesGuard.test.ts`](../../apps/api-gateway/src/__tests__/routesGuard.test.ts).

| Before                                                                                                                                                                                                                       | After                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rootRouter.use(...subscriptionGuard, xRouter)` repeated for 26 path-less and 7 prefixed business routers. Each `subscriptionGuard` = `defaultLimiter, authenticate, requireTenant, requireActiveSubscription, idempotency`. | One `businessRouter` with `authenticate, requireTenant, requireActiveSubscription, idempotency` applied **once**. All 33 business routers are mounted inside it in the **same order** and with the **same path prefixes**. `rootRouter.use(businessRouter)` is the last mount. |
| `defaultLimiter` attached to the tenant, payment, `/support`, `/platform/support` and `/walkthrough` mounts and to every guard, so it was charged 1–29× per request.                                                         | `rootRouter.use(defaultLimiter)` **once**, right after `authRouter`. It applies to exactly the same set of requests as before (everything `authRouter` doesn't handle), but counts each request once.                                                                          |
| `/walkthrough` mounted between `dashboardRouter` and `aiInsightsRouter`, after 14 path-less guards.                                                                                                                          | `/walkthrough` mounted with `/support` and `/platform/support`, ahead of the business router, with its own `authenticate, requireTenant, idempotency` chain.                                                                                                                   |

Unchanged:

- Every middleware implementation, every child router and its route-level middleware (for example the routers' own `authenticate`, and `tenantSettings.ts`'s route-level guard).
- `server.ts`, the error handler, and the anonymous careers routes.
- Each mount's path and order relative to the other business routers.

#### Security review

| Requirement                                              | How it is met                                                                                                                                                                  | Verified by                                                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every business router stays protected                    | All 33 routers are inside `businessRouter`, whose first middleware is `authenticate → requireTenant → requireActiveSubscription`. Nothing is mounted on `rootRouter` after it. | Test: every one of the 33 routers returns 401 without a token; live: `curl` without a token returns 401 for early, late and unknown paths                                    |
| Wrong-secret JWT rejected                                | Same `authenticate`                                                                                                                                                            | Test (401)                                                                                                                                                                   |
| No-tenant / pending-setup token rejected                 | Same `requireTenant`                                                                                                                                                           | Test: 403 `PENDING_TENANT_SETUP` on early and late routers                                                                                                                   |
| Expired subscription blocked                             | Same `requireActiveSubscription`                                                                                                                                               | Test: 402 on early and late routers                                                                                                                                          |
| Fail-open on subscription DB errors (existing behaviour) | Unchanged middleware                                                                                                                                                           | Test                                                                                                                                                                         |
| Tenant context reaches handlers                          | `authenticate` still wraps the rest of the chain in `gatewayTenantStorage` and `runWithTenant`                                                                                 | Test: the handler sees the token's `tenantId` in `req.user` and in the AsyncLocalStorage context; live: all 63 pages return the same data and request counts as the baseline |
| Handler errors reach the terminal error handler          | Unchanged                                                                                                                                                                      | Test (500, "Internal Server Error")                                                                                                                                          |
| Unknown `/api/v1` paths                                  | Still pass the guard first: 401/402/403, then 404                                                                                                                              | Test and live (`GET /__perf_probe_unmatched` gives 401 without a token and 404 with one)                                                                                     |
| Tenant, payment and public careers routes stay unguarded | Mounted before the business router as before                                                                                                                                   | Test (no `authenticate` or subscription calls)                                                                                                                               |
| `/support`: auth + tenant, no subscription check         | Unchanged chain and position                                                                                                                                                   | Test (200 for an expired tenant, 401/403 otherwise); live 200                                                                                                                |
| `/platform/support`: auth + support agent                | Unchanged chain and position                                                                                                                                                   | Test                                                                                                                                                                         |

**One intentional behaviour change.** `/walkthrough` no longer returns 402 for organisations with a lapsed subscription. Its own code says it must not be subscription-gated (`routes/walkthrough.ts`: "a 402 from a background save would bounce the person to the Subscription page"), and its chain never included `requireActiveSubscription`. It only got a 402 because it was mounted behind 14 path-less guards. It holds only the signed-in user's tour progress. It still requires a valid token and a tenant.

#### Regression tests

`apps/api-gateway/src/__tests__/routesGuard.test.ts` (57 tests) mounts the **real** `rootRouter` with the **real** `authenticate`, `requireTenant`, `requireActiveSubscription` and `idempotency`. The pieces that are stubbed:

- Child routers are replaced by probe routers.
- `@hrms/db` is replaced with a counting mock; no Atlas access.
- The limiter is a real `express-rate-limit` with an in-memory store, wrapped with a counter.

| Run                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New suite against the **old** `index.ts`                           | **15 failed / 42 passed.** The failures are the guard-count, limiter-count, `/support`, `/walkthrough` and unknown-path assertions. Example: a `/tax-declarations` request triggered 27 `authenticate` calls, 27 tenant lookups and 29 limiter charges, matching the audit's live measurements. All the protection tests passed, which is the security baseline the refactor had to keep. |
| New suite against the **new** `index.ts`                           | **57 / 57 passed**                                                                                                                                                                                                                                                                                                                                                                        |
| Full gateway suite (`npx jest apps/api-gateway`)                   | **1,662 passed, 1 failed (78 suites).** The failure is `payment.test.ts › reactivateSubscription … one-month expiry`, which is date-dependent and unrelated: it asserts `planExpiresAt.getMonth() − planActivatedAt.getMonth() === 1`, and on 31 October "+1 month" lands on 1 December. That suite imports no route modules.                                                             |
| `tsc --noEmit -p apps/api-gateway` and ESLint on the changed files | Clean                                                                                                                                                                                                                                                                                                                                                                                     |

#### Docker rebuild and live checks (local dev stack only)

- **Build:** `docker compose -f docker-compose.dev.yml build api-gateway` (72 s), then `up -d --no-deps api-gateway`. Only the gateway container was recreated. I confirmed the image's `dist/routes/index.js` contains `businessRouter` and no `subscriptionGuard`.
- **Startup:** 2 cluster workers, "API Gateway running on https port 9002", Redis cache and WebSocket subscriber connected, metrics on :9003. No errors in the logs.
- **Health:** `/health` returns 200 `{"status":"healthy"}`. Socket.IO handshake through nginx returns 200. Two WebSocket 502s were logged in the browser during the container swap only.
- **Rate-limit units per request (live, `RateLimit-Remaining` deltas, two consecutive deltas each):**

| Request                                  | Before (audit) |    After |
| ---------------------------------------- | -------------: | -------: |
| `GET /tenants/me` (pre-guard)            |              1 | **1, 1** |
| `GET /employee-insights` (early)         |              4 | **1, 1** |
| `GET /get-employee-departments` (middle) |              — | **1, 1** |
| `GET /tenant-settings` (middle)          |              — | **1, 1** |
| `GET /payroll/advances` (late)           |             29 | **1, 1** |
| `GET /tax-declarations/mine` (last)      |              — | **1, 1** |
| Unknown path (404)                       |              — | **1, 1** |
| `GET /support/stats`                     |              — | **1, 1** |
| `GET /walkthrough/progress`              |              — | **1, 1** |

- **Per-request operations implied by the code** (live latency and the tests confirm these; the gateway has no per-request query counter to count them directly):

| Per request                                        | Before                                    | After                                                                                            |
| -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `defaultLimiter` Redis increments                  | 1 (pre-guard routes) to 29 (late routers) | **1**                                                                                            |
| `requireActiveSubscription` tenant lookups (Atlas) | 1 to 27                                   | **1** (2 for `/tenant-settings`, whose router adds its own route-level guard; out of scope here) |
| `authenticate` runs (JWT verify + 2 ALS contexts)  | 1 to 27 at mount level, plus route-level  | **1** at mount level, plus the unchanged route-level ones                                        |

#### Before/after performance (same stack, same Atlas, same signed-in session, same tooling)

**Method.** The same `tooling/recorder.js` and `tooling/route-sweep.js` were used: 3 SPA passes over the same 63 routes, 3 cold dashboard loads, the same 5 interactions, and the same 7-endpoint probe set. One addition: a **pre-fix control** probe run (10 rounds) on the old container immediately before the rebuild. It showed Atlas was _slower_ at that point than during the baseline (unknown-path probe 1,151 ms vs 935 ms), so the improvement below is not explained by better conditions. Post-fix raw samples are in [`api-performance-results-after-guard-fix.csv`](./api-performance-results-after-guard-fix.csv).

**All GET requests (browser, request start → last byte):**

| Metric                | Before (baseline §8) |      After | Change |
| --------------------- | -------------------: | ---------: | -----: |
| GET requests measured |                  349 |        349 |      — |
| Distinct endpoints    |                   89 |         89 |      — |
| Median                |               525 ms | **112 ms** |  −79 % |
| P95                   |             1,624 ms | **437 ms** |  −73 % |
| Mean                  |               748 ms |     151 ms |  −80 % |
| Requests < 100 ms     |                   19 |        144 |        |
| 100–200 ms            |                   29 |        151 |        |
| 200–300 ms            |                   31 |         20 |        |
| 300–500 ms            |                   81 |         18 |        |
| 500–1,000 ms          |                  101 |         15 |        |
| ≥ 1,000 ms            |                   88 |      **1** |        |

**By old mount position (what the fix targets), median / P95:**

| Group                                                                                                  | n before / after |           Before |            After |
| ------------------------------------------------------------------------------------------------------ | ---------------: | ---------------: | ---------------: |
| Pre-guard routes (control: `/tenants/*`, `/support/*`, `/profile`, `/csrf-token`; code path unchanged) |          22 / 22 |      85 / 363 ms |     106 / 168 ms |
| Early routers (1–3 old guard passes)                                                                   |          51 / 51 |     194 / 726 ms | **111 / 394 ms** |
| Middle routers (9–17 passes)                                                                           |        156 / 156 |   537 / 1,419 ms | **104 / 510 ms** |
| Late routers (≥ 20 passes)                                                                             |          80 / 80 | 1,221 / 2,305 ms | **117 / 401 ms** |

**Controlled probes (sequential, interleaved), median ms:**

| Probe (old guard passes)            | Baseline (n=5) | Pre-fix control (n=10) |           After (n=10) |
| ----------------------------------- | -------------: | ---------------------: | ---------------------: |
| `tenants/me` (0, control)           |             76 |                    114 |                    140 |
| `employee-insights` (2)             |             77 |                    105 |                 **53** |
| `get-employee-departments` (10)     |            375 |                    474 |                 **54** |
| `tenant-settings` (16)              |            700 |                    909 |                **117** |
| `pt-slabs` (23)                     |            863 |                  1,315 |                **139** |
| `payroll/advances` (27)             |          1,051 |                  1,419 |                **120** |
| Unknown path / 404 (26)             |            935 |                  1,151 |                 **59** |
| **Latency slope vs mount position** |   35.8 ms/pass |           54.8 ms/pass | **−1.8 ms/pass (≈ 0)** |

The after-fix probe run contains a few ~1 s outliers. They coincided with the Mac's network briefly suspending: one request failed with `net::ERR_NETWORK_IO_SUSPENDED`, recorded as failed in the CSV. Medians are unaffected.

**Cold dashboard load (3 runs each):**

|                                   | Before                      | After                           |
| --------------------------------- | --------------------------- | ------------------------------- |
| `GET /dashboard`                  | 633 / 570 / 653 ms          | **115 / 142 / 134 ms**          |
| `GET /dashboard/data` starts at   | +1,038 / +895 / +991 ms     | +809 / +881 / +531 ms           |
| All dashboard requests settled at | +8,660 / +2,798 / +2,406 ms | **+2,037 / +1,505 / +1,463 ms** |

**Server-side check:** the gateway's own logged durations after the fix were median 102 ms, P95 722 ms (n = 543 requests, including probes). For comparison: `/tenant-settings` 128 ms (n=36), `/pt-slabs` 83 ms, `/dashboard` 118 ms.

**Per endpoint (all 89), sorted by before median:**

| Endpoint                                   | Old guard passes | Before median (n) | After median (n) |           Change |
| ------------------------------------------ | ---------------: | ----------------: | ---------------: | ---------------: |
| `/performance-reviews`                     |               27 |          2103 (6) |          260 (6) | -1843 ms (-88 %) |
| `/wfh/requests`                            |               27 |          1602 (3) |          157 (3) | -1445 ms (-90 %) |
| `/reports/saved`                           |               27 |          1490 (3) |          118 (3) | -1371 ms (-92 %) |
| `/performance-reviews/cycles`              |               27 |          1400 (6) |          130 (6) | -1270 ms (-91 %) |
| `/dashboard/data`                          |               14 |         1399 (13) |         508 (13) |  -891 ms (-64 %) |
| `/assets/issues`                           |               27 |          1344 (3) |          124 (3) | -1220 ms (-91 %) |
| `/assets`                                  |               27 |          1335 (3) |          201 (3) | -1135 ms (-85 %) |
| `/assets/categories`                       |               27 |          1330 (3) |           86 (3) | -1244 ms (-94 %) |
| `/helpdesk/tickets`                        |               27 |          1329 (4) |          136 (4) | -1193 ms (-90 %) |
| `/assets/summary`                          |               27 |          1279 (3) |           86 (3) | -1193 ms (-93 %) |
| `/payroll/my-payslips`                     |               27 |          1273 (3) |          144 (3) | -1130 ms (-89 %) |
| `/payroll/advances`                        |               27 |          1264 (3) |          113 (3) | -1151 ms (-91 %) |
| `/helpdesk/tickets/:id`                    |               27 |          1254 (1) |          152 (1) | -1102 ms (-88 %) |
| `/tax-declarations`                        |               27 |          1236 (3) |          117 (3) | -1119 ms (-91 %) |
| `/tax-declarations/mine`                   |               27 |          1192 (3) |          116 (3) | -1075 ms (-90 %) |
| `/payroll/runs`                            |               27 |          1184 (3) |           83 (3) | -1101 ms (-93 %) |
| `/reports/schema/employee`                 |               27 |          1173 (3) |           85 (3) | -1088 ms (-93 %) |
| `/salary-component-definitions`            |               23 |          1081 (3) |          115 (3) |  -966 ms (-89 %) |
| `/exit-interview-templates`                |               21 |           977 (6) |          130 (6) |  -848 ms (-87 %) |
| `/interview-pipeline-templates`            |               22 |           966 (3) |           79 (3) |  -887 ms (-92 %) |
| `/tds-slabs`                               |               23 |           947 (3) |           84 (3) |  -863 ms (-91 %) |
| `/pt-slabs`                                |               23 |           946 (3) |           83 (3) |  -863 ms (-91 %) |
| `/exit-checklist-item-defs`                |               21 |           937 (3) |          138 (3) |  -799 ms (-85 %) |
| `/pay-cycles`                              |               23 |           907 (3) |           83 (3) |  -823 ms (-91 %) |
| `/get-attendance-trends`                   |               10 |           903 (6) |          137 (6) |  -765 ms (-85 %) |
| `/approvals/pending-all`                   |               17 |           895 (3) |          236 (3) |  -659 ms (-74 %) |
| `/get-tenure-distribution`                 |               10 |           872 (3) |           96 (3) |  -776 ms (-89 %) |
| `/notice-period-policies`                  |               20 |           872 (3) |          142 (3) |  -730 ms (-84 %) |
| `/get-age-distribution`                    |               10 |           838 (3) |          100 (3) |  -738 ms (-88 %) |
| `/tenant-settings`                         |               16 |          794 (15) |         123 (15) |  -671 ms (-85 %) |
| `/audit-logs`                              |                9 |           774 (3) |          429 (3) |  -345 ms (-45 %) |
| `/get-org-chart`                           |               11 |           673 (3) |          270 (3) |  -403 ms (-60 %) |
| `/get-user-data/:username`                 |                1 |           637 (3) |          199 (3) |  -438 ms (-69 %) |
| `/dashboard`                               |               14 |           633 (5) |          134 (5) |  -499 ms (-79 %) |
| `/birthdays-anniversaries`                 |                9 |           630 (5) |          109 (5) |  -521 ms (-83 %) |
| `/walkthrough/progress`                    |               14 |           619 (3) |           59 (3) |  -560 ms (-90 %) |
| `/chat/conversations`                      |               12 |           613 (3) |          184 (3) |  -429 ms (-70 %) |
| `/ai-connections`                          |               13 |           594 (3) |           79 (3) |  -515 ms (-87 %) |
| `/chat/unread-counts`                      |               12 |           558 (6) |          140 (6) |  -418 ms (-75 %) |
| `/get-teams`                               |               11 |           547 (3) |          127 (3) |  -420 ms (-77 %) |
| `/get-role-and-permissions`                |               11 |           536 (3) |           83 (3) |  -452 ms (-84 %) |
| `/view-applications/:id`                   |                5 |           522 (1) |          752 (1) |  +229 ms (+44 %) |
| `/get-roles`                               |               11 |           517 (3) |          128 (3) |  -388 ms (-75 %) |
| `/get-employee-designations`               |               10 |           478 (3) |           57 (3) |  -421 ms (-88 %) |
| `/get-hr-activities`                       |                6 |           468 (8) |          109 (8) |  -359 ms (-77 %) |
| `/get-headcount-growth`                    |               10 |           458 (3) |           53 (3) |  -405 ms (-88 %) |
| `/get-joining-data`                        |               10 |           454 (3) |           56 (3) |  -398 ms (-88 %) |
| `/get-compensation-breakdown`              |               10 |           445 (3) |          105 (3) |  -340 ms (-76 %) |
| `/get-salary-distribution-by-department`   |               10 |           444 (3) |          101 (3) |  -343 ms (-77 %) |
| `/get-job-openings-by-status`              |               10 |           443 (3) |           49 (3) |  -394 ms (-89 %) |
| `/get-applications-by-job-role`            |               10 |           443 (3) |           50 (3) |  -393 ms (-89 %) |
| `/get-average-salary-by-designation`       |               10 |           443 (3) |          100 (3) |  -343 ms (-77 %) |
| `/get-monthly-leave-patterns`              |               10 |           436 (3) |          100 (3) |  -336 ms (-77 %) |
| `/get-employment-type-breakdown`           |               10 |           434 (3) |           57 (3) |  -376 ms (-87 %) |
| `/get-employee-status-distribution`        |               10 |           433 (3) |           53 (3) |  -380 ms (-88 %) |
| `/get-working-hours-distribution`          |               10 |           432 (3) |           99 (3) |  -333 ms (-77 %) |
| `/get-employee-departments`                |               10 |           429 (3) |           59 (3) |  -370 ms (-86 %) |
| `/get-calendar-events`                     |                9 |           423 (8) |           76 (8) |  -347 ms (-82 %) |
| `/get-leave-type-breakdown`                |               10 |           421 (3) |          104 (3) |  -317 ms (-75 %) |
| `/get-notifications`                       |                8 |           417 (3) |          135 (3) |  -282 ms (-68 %) |
| `/get-holidays/:year`                      |                9 |          400 (11) |          59 (11) |  -342 ms (-85 %) |
| `/get-salary-bands`                        |               10 |           398 (3) |          104 (3) |  -294 ms (-74 %) |
| `/get-leave-approval-rate`                 |               10 |           382 (3) |          105 (3) |  -278 ms (-73 %) |
| `/my-resignation`                          |                5 |           379 (6) |          133 (6) |  -245 ms (-65 %) |
| `/get-hiring-funnel`                       |               10 |           372 (3) |           53 (3) |  -319 ms (-86 %) |
| `/get-hiring-manager-performance`          |               10 |           371 (3) |           52 (3) |  -320 ms (-86 %) |
| `/view-resignations`                       |                5 |           353 (3) |          122 (3) |  -231 ms (-66 %) |
| `/get-leave-applications`                  |                4 |           304 (5) |          118 (5) |  -186 ms (-61 %) |
| `/resignation-insights`                    |                5 |           293 (3) |          177 (3) |  -116 ms (-40 %) |
| `/job-openings-insights`                   |                5 |           281 (3) |          103 (3) |  -178 ms (-63 %) |
| `/get-all-attendances/:year/:month`        |                3 |           272 (3) |          223 (3) |   -49 ms (-18 %) |
| `/policies`                                |                6 |           270 (3) |           44 (3) |  -226 ms (-84 %) |
| `/attendance-insights`                     |                3 |           250 (3) |          133 (3) |  -117 ms (-47 %) |
| `/view-job-opening/:id`                    |                5 |           249 (1) |           76 (1) |  -173 ms (-69 %) |
| `/get-attendance-summary/:id/:year/:month` |                3 |           220 (8) |          103 (8) |  -117 ms (-53 %) |
| `/view-job-openings`                       |                5 |           207 (4) |           61 (4) |  -146 ms (-70 %) |
| `/view-all-kycs`                           |                2 |          207 (13) |         116 (13) |   -91 ms (-44 %) |
| `/get-attendances/:year/:month`            |                3 |           177 (8) |           55 (8) |  -121 ms (-69 %) |
| `/tenants/join-requests`                   |                0 |           151 (3) |          169 (3) |   +18 ms (+12 %) |
| `/support/tickets`                         |                0 |           134 (3) |          129 (3) |     -5 ms (-4 %) |
| `/get-kyc-insights`                        |                2 |           118 (3) |           80 (3) |   -38 ms (-32 %) |
| `/employee-insights`                       |                2 |           115 (3) |           51 (3) |   -65 ms (-56 %) |
| `/get-all-users`                           |                1 |           113 (4) |           73 (4) |   -41 ms (-36 %) |
| `/support/stats`                           |                0 |            97 (3) |           90 (3) |     -7 ms (-7 %) |
| `/tenants/me`                              |                0 |            84 (3) |           81 (3) |     -3 ms (-4 %) |
| `/get-employee-details/:username`          |                2 |            83 (3) |           53 (3) |   -30 ms (-36 %) |
| `/tenants/org-profile`                     |                0 |            82 (3) |           79 (3) |     -3 ms (-3 %) |
| `/profile`                                 |                0 |            77 (3) |          142 (3) |   +65 ms (+84 %) |
| `/csrf-token`                              |                0 |             8 (4) |            9 (4) |    +1 ms (+15 %) |

Four endpoints got slower. Each is a code path this fix doesn't touch, or the sample is too small to say anything:

- `/profile` 77 → 142 ms (n = 3): mounted before the guard.
- `/tenants/join-requests` 151 → 169 ms: mounted before the guard.
- `/csrf-token` 8 → 9 ms: mounted before the guard.
- `/view-applications/:id` 522 → 752 ms (n = 1).

They are treated as run-to-run variance in Atlas and gRPC latency, not as a regression.

#### Remaining bottlenecks after Fix 1 (measured)

| Endpoint                 |                     After median | Notes / backlog item                                                                                                   |
| ------------------------ | -------------------------------: | ---------------------------------------------------------------------------------------------------------------------- |
| `/view-applications/:id` |                     752 ms (n=1) | Handler/gRPC cost; needs more samples before acting                                                                    |
| `/dashboard/data`        | **508 ms** (n=13; server 501 ms) | Now the slowest routine call. Duplicated caller/layout work, widget loaders, and the client waterfall (backlog #3, #4) |
| `/audit-logs`            |          429 ms (760 KB payload) | Pagination and projection (backlog #5)                                                                                 |
| `/get-org-chart`         |                           270 ms | 16 KB tree                                                                                                             |
| `/performance-reviews`   |                           260 ms | gRPC; four concurrent calls on one page                                                                                |
| `/approvals/pending-all` |                           236 ms | Three parallel sources                                                                                                 |
| `/get-notifications`     |                    server 244 ms | —                                                                                                                      |

With the guard multiplication gone, the remaining items in §23 (#2 onward) can each be measured on their own against this new baseline. Item #2, memoising the subscription lookup, is now worth at most **one** Atlas round trip per request (it was up to 27), so its priority should be re-assessed.

#### Not done / limitations

- Not committed, pushed or deployed. **Production per-pass cost is still unmeasured**: rerun the probe pair (`/tenants/me` vs an unknown path) on praesto.in after deploying.
- Single session and a single local gateway (2 workers) against shared Atlas. Most endpoints have 3 samples per phase; the probes have 10.
- Redis and Atlas operation counts per request come from the code path, the unit tests (which count real middleware invocations and mocked tenant lookups) and the live rate-limit headers. The gateway has no per-request Redis or DB counter to read them from directly (see §24).

## 28. Optimisation pass 2026-11-01 (measured)

**Baseline:** `bench-before` (2026-10-31, guard fix already in). **After:** `bench-after` (2026-11-01, local Docker stack rebuilt with this pass's changes).

- Both runs used the same harness: 3 cold dashboard loads, 5 SPA passes over 63 routes, and 12 probe endpoints × 10.
- The browser used an isolated profile against the shared Atlas cluster. There was no load test.
- Full numbers: `performance-results-before-after.csv`.

| Metric                                                                                                                     | Before                          | After                                                   | Label    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------- | -------- |
| All GETs, median                                                                                                           | 108 ms                          | **59 ms**                                               | Measured |
| All GETs, P95 / P99                                                                                                        | 364 / 735 ms                    | **441 / 1,363 ms (worse)**                              | Measured |
| Warm passes 2–4: median / P95                                                                                              | 95 / 228 ms                     | **52 / 343 ms**                                         | Measured |
| Errors (GET ≥ 400 or failed)                                                                                               | 15                              | 10                                                      | Measured |
| `/audit-logs`: median / P95 / max / size                                                                                   | 395 / 3,263 / 9,902 ms / 756 KB | **229 / 433 / 468 ms / 71 KB**                          | Measured |
| `/get-attendance-trends` requests in the run                                                                               | 15                              | **5**                                                   | Measured |
| Probes (median): unmatched-404, employee-insights, tenant-settings, payroll/advances, get-org-chart, approvals/pending-all | 46, 48, 116, 168, 241, 190 ms   | **16, 16, 58, 94, 146, 140 ms**                         | Measured |
| `/dashboard/data` median                                                                                                   | 319 ms                          | 463 ms (no reliable change; high variance in both runs) | Measured |

**Tail latency did not improve, and the cause is not isolated.** Hypotheses, not verified:

- Shared Atlas tier variance between the two runs, which were taken at different times of day.
- `/dashboard/data`: the new instrumentation shows the admin layout issuing **48 parallel queries per call**. That is 6–11 s of summed database time inside a 0.8–1.3 s wall time, and individually indexed counts take 300–900 ms under that fan-out. The next dashboard step is caching org-wide widgets (cache audit C2) or capping concurrency, not further index work.

**Changes in this pass:**

- **Endpoints:** audit-log list/detail split; `pending-all` duplicate fetch removed; org chart roster reuse; dashboard caller and preference read in parallel; `GetLeaveBalance` parallel reads.
- **Infrastructure:** subscription-guard per-process cache; Prisma query instrumentation; cache TTL jitter; tenant-local indexes; Analytics single fetch.
- **Data:** seed cleanup and PII remediation (see `database-remediation-plan.md` §9).
