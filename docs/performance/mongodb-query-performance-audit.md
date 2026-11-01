# Praesto MongoDB Query Performance Audit

**Date:** 2026-10-31 · **Cluster:** `cluster0.ooxsrgq.mongodb.net` (MongoDB 8.0.36, shared by production and local dev) · **Baseline:** post-guard-fix results in [`api-performance-audit.md` §27](./api-performance-audit.md#27-remediation-log) and [`api-performance-results-after-guard-fix.csv`](./api-performance-results-after-guard-fix.csv)

> **How to read this.** Browser and gateway timings come from the earlier audits. Query plans and per-query server execution times come from bounded `explain("executionStats")` runs made today, and are listed in [`mongodb-query-results.csv`](./mongodb-query-results.csv). **Explain timings are single runs, not production latency.** No historical production query timings could be obtained (§7). Every statement is tagged **Confirmed**, **Strongly suspected** or **Needs instrumentation**.

---

## 1. Executive summary

1. **MongoDB query execution is not what makes the remaining slow endpoints slow at today's data volumes. Confirmed.**
   - Every representative query behind the slow endpoints ran in **0–7 ms** on the server, including full collection scans (§6).
   - The tenant database is small: `hrms-acme-corp` holds 15,034 documents and 16.8 MB in total.
2. **The remaining latency comes from how many _sequential_ Atlas round trips each request makes, the payload moved, and application processing. Strongly suspected, with a quantitative fit.**
   - One round trip from the gateway container to the Atlas primary costs a median of **43.5 ms** (39–144 ms, 10 samples).
   - Counting sequential round trips in the code predicts the measured server times closely:

     | Endpoint                 | Sequential round trips | Predicted | Measured (server) |
     | ------------------------ | ---------------------: | --------: | ----------------: |
     | `/approvals/pending-all` |                      5 |   ~217 ms |            226 ms |
     | `/dashboard/data`        | 3 + a 266 ms gRPC call |   ~400 ms |            501 ms |

3. **The audit-log payload is mostly before/after snapshots of an internal UI model. Confirmed.**
   - 92% of the bytes in the 200 rows `/audit-logs` returns are `oldValue`/`newValue`.
   - 304 of the last 7 days' 379 audit rows are `WalkthroughProgress` (product-tour state), each carrying full JSON snapshots.
   - Separately, 58 legacy `JobApplication` audit rows embed **inline resumes, about 209 KB per row**. That's 11.1 MB, two-thirds of the whole tenant DB, and every audit-log request scans it.
4. **The live tenant databases are missing almost all of the schema's indexes, and the schema's index design doesn't fit database-per-tenant. Confirmed.**
   - `hrms-acme-corp` has only `_id` on `auditlogs`, `leaves`, `performance_reviews`, `approval_*`, `teams`, `notification_recipients` and more.
   - The **likely cause**: `attendance_records` holds **583 duplicate `(tenantId, userId, date)` groups** (dated 30 Apr – 7 Jul 2026), so the schema's unique index can't be built and `pnpm db:migrate` (`prisma db push`) fails for this tenant.
   - Even where the indexes exist (`hrms-praesto`), they lead with `tenantId`, which tenant-DB queries never include.
   - **Impact today is small** (milliseconds). It becomes a real cost as data grows, and the missing unique constraints are a correctness issue now.
5. **Highest-value next fixes, in order:**
   1. Slim `/audit-logs`: project out the snapshots, add pagination, and stop or trim auditing of `WalkthroughProgress`.
   2. Remove redundant sequential round trips in `/approvals/pending-all`, `/get-org-chart`, the dashboard (`resolveCaller` → `loadLayout`) and `GetLeaveBalance`.
   3. Add per-request query instrumentation so the next round is measured, not modelled.
   4. A database-per-tenant index plan, applied only after de-duplicating attendance, **with approval** (§15).

## 2. Verified connection and database mapping

| Check                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active MCP connection                | `atlas-hrms` → host type **atlas**, SCRAM auth, server `ac-wl2lcsx-shard-00-01.ooxsrgq.mongodb.net`, MongoDB **8.0.36**                                                                                                                                                                                                                                                                                                                                                                               |
| `localhost:27017`                    | The old `preconfigured` connection to the local instance was disconnected and isn't used. All results below come from the Atlas connection.                                                                                                                                                                                                                                                                                                                                                           |
| **Read-only mode**                   | **Not active in this session.** `MDB_MCP_READ_ONLY=true` is saved in the MCP config, but the running MCP process started before that change, and write tools (`insert-many`, `delete-many`, `create-index`, `drop-*`) are still exposed. **I enforced read-only use myself:** only `find`, `count`, `aggregate` (no `$out`/`$merge`), `explain`, `collection-indexes`, `$collStats`, `db-stats` and `list-*` were called. Restart Claude Code (or the MCP server) to make read-only mode take effect. |
| Databases                            | `hrms-dev` (master: users, tenants, memberships), `hrms-acme-corp`, `hrms-appinventiv`, `hrms-praesto`, `hrms-test`, `encryption`, `admin`, `local`                                                                                                                                                                                                                                                                                                                                                   |
| Database used by the audited session | The gateway resolves `dbName` from the JWT (`middleware/authenticate.ts`). The signed-in user's tenant `6a0abf929b…` maps to **`hrms-acme-corp`** (active subscription), from master `tenants` (`_id` → `dbName`). Master-scoped models (`user`, `tenant`, `tenantMembership`, MCP, support, trial claim) go to **`hrms-dev`**; all business models go to the tenant DB (`packages/database/src/prismaWithTenant.ts`).                                                                                |
| Other tenants                        | `hrms-appinventiv` (expired), `hrms-test` (expired), `hrms-praesto` (trialing). They were only inspected for index comparison; no business data was read from them.                                                                                                                                                                                                                                                                                                                                   |
| Inaccessible                         | `system.profile` ("not allowed to do action [find]"), `$queryStats` ("not allowed"), `getLog` (the MCP `mongodb-logs` tool fails), `$currentOp` (own session only). Together these point to a **shared or Flex Atlas tier**, inferred and not confirmed from the Atlas UI.                                                                                                                                                                                                                            |

**ORM note:** Praesto uses **Prisma** for MongoDB, not Mongoose. `.lean()` and `.populate()` don't apply. The Prisma equivalents are `select` (projection) and `include`, and **`include` runs as a separate, sequential query**.

## 3. Relevant collections (`hrms-acme-corp` unless noted)

| Collection                |              Docs | Avg doc | Notes                                                                       |
| ------------------------- | ----------------: | ------: | --------------------------------------------------------------------------- |
| `auditlogs`               |             4,525 |  3.2 KB | **14.7 MB = 87% of the tenant DB.** 58 `JobApplication` rows total 11.1 MB. |
| `attendance_records`      |             6,821 |   161 B | 583 duplicate `(tenantId, userId, date)` pairs                              |
| `notification_recipients` |             1,578 |   104 B |                                                                             |
| `leaves`                  |             1,495 |   210 B |                                                                             |
| `notifications`           |                68 |   218 B |                                                                             |
| `messages`                |                32 |   279 B |                                                                             |
| `approval_step_instances` |                30 |       — |                                                                             |
| `teams`                   |                 8 |       — |                                                                             |
| `performance_reviews`     |                 1 |       — |                                                                             |
| `hrms-dev.users`          | 109 (104 in acme) | ~1.5 KB | Master, shared by all tenants                                               |

## 4. Slow API → query mapping

Post-fix browser medians come from the CSV; "server" is the gateway-logged duration. A "round trip" is one sequential wait on Atlas or Redis. Every request also pays one guard lookup (`tenants.findUnique` in `requireActiveSubscription`).

| Endpoint (browser median, n)                    | Code path                                                                                                                      | Queries per request (counted from code) |                                                                                    Sequential DB rounds (incl. guard) | Notes                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------: | --------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/data` (508 ms, 13)                  | `handlers/dashboard.ts getDashboardData`: `resolveCaller` → `loadLayout` → 13 loaders in parallel                              | ~45–50 for an owner with all 13 widgets | **3** (guard → caller → layout), then loaders of 1–2 rounds, **plus the `GetLeaveBalance` gRPC call (median 266 ms)** | Repeats `resolveCaller` and `loadLayout` from `/dashboard`. `headcount-trend` loads _all_ users unbounded. `getActiveSettings` is fetched by several loaders. |
| `/audit-logs` (430 ms, 3)                       | `handlers/general.ts getAuditLogs`                                                                                             |                                       1 |                                                                                                                     2 | 200 full rows; 958 KB BSON read; redaction on every row                                                                                                       |
| `/get-org-chart` (270 ms, 3)                    | `handlers/permissions.ts getOrgChart`                                                                                          |                                       6 |                                                                                                                     3 | Round 2 (`resolveUserNames`) re-fetches users that round 1 already loaded as `activeUsers`                                                                    |
| `/performance-reviews` (260 ms, 6)              | gateway `listReviews` → gRPC → `performance-review-service/handlers/listReviews.ts`                                            |                        2 (find + count) |                                                                                                          2 + gRPC hop | **No `take` when the client sends no `limit`**, so results are unbounded; 4 parallel calls per page                                                           |
| `/approvals/pending-all` (236 ms, 3)            | `handlers/pendingActions.ts` → `getPendingApprovalItems` (approval-engine), `getPendingKycItems`, `getPendingJoinRequestItems` |                                     ~10 |                                                                                                                 **5** | `approvalInstance.findMany` by the same IDs runs **twice** (engine, then gateway)                                                                             |
| `/get-notifications` (135 ms, 3; server 244 ms) | gateway → gRPC → `notification-service/handlers/getNotifications.ts`                                                           |                                       4 |                                                                                                          3 + gRPC hop | `include: { notification: true }` adds a second sequential query. Called on every full page load.                                                             |
| `/chat/conversations` (184 ms)                  | chat handler                                                                                                                   |                                       — |                                                                                                                     — | Not traced in depth (P3)                                                                                                                                      |
| `/view-applications/:id` (752 ms, **n = 1**)    | recruitment                                                                                                                    |                                       — |                                                                                                                     — | Needs more samples before any conclusion                                                                                                                      |

## 5. Index inventory (live vs declared)

| Collection                              | Declared in `schema.prisma`                                                                                           | Live in `hrms-acme-corp`                                            | Live in `hrms-praesto` |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| `auditlogs`                             | `[tenantId,timestamp]`, `[tenantId,userId,timestamp]`, `[tenantId,entityType,timestamp]`                              | `_id` only                                                          | all 3 declared         |
| `attendance_records`                    | **unique** `[tenantId,userId,date]`, `[tenantId,date]`                                                                | `_id`, `[tenantId,date]` (**unique missing**)                       | —                      |
| `leaves`                                | `[tenantId,userId]`, `[tenantId,status]`                                                                              | `_id` only                                                          | —                      |
| `performance_reviews`                   | **unique** `[cycleId,userId]`, `[tenantId,userId]`, `[tenantId,status]`                                               | `_id` only                                                          | —                      |
| `approval_instances`                    | `[module,entityId,status]`, `[tenantId,module,status]`                                                                | `_id` only                                                          | —                      |
| `approval_step_instances`               | `[instanceId,order]`, `[tenantId,resolvedApproverId,status]`                                                          | `_id` only                                                          | —                      |
| `notification_recipients`               | `[tenantId,userId,isCleared]`                                                                                         | `_id` only                                                          | —                      |
| `teams`                                 | `[tenantId]`                                                                                                          | `_id` only                                                          | —                      |
| `dashboard_preferences`                 | **unique** `[tenantId,userId]`                                                                                        | `_id` only                                                          | —                      |
| `holidays`                              | **unique** `[tenantId,year,month]`                                                                                    | `_id` only                                                          | —                      |
| `tenant_settings`                       | **unique** `[tenantId,effectiveFrom]`                                                                                 | `_id` only                                                          | —                      |
| `wfh_requests`, `messages`, `chatrooms` | various                                                                                                               | `_id` only                                                          | —                      |
| `hrms-dev.users`                        | `[employeeStatus]`, `[department,employeeStatus]`, **`[tenantId,employeeStatus]`**, unique `username`, unique `email` | all **except `[tenantId,employeeStatus]`**                          | n/a                    |
| `hrms-dev.tenants`                      | —                                                                                                                     | `slug`, `dbName`, `domain`, partial unique `razorpaySubscriptionId` | n/a                    |

Across `hrms-acme-corp`, `db.stats()` reports **89 indexes for 73 collections**, so most collections have only `_id`. `hrms-appinventiv.attendance_records` shows the same partial state.

**Why the indexes are missing (strongly suspected):**

- `pnpm db:migrate` (`packages/database/src/push-to-all-tenants.ts`) runs `prisma db push` per tenant. That requires building every declared unique index.
- `hrms-acme-corp` contains **583 duplicate `(tenantId, userId, date)` attendance groups** (each exactly 2 copies, both with `timeIn`, dated 30 Apr – 7 Jul 2026) and **1 duplicate `(tenantId, userId)` in `leavebalances`**. A unique build on those keys fails.
- `hrms-praesto`, a newer tenant, has its indexes.
- Earlier project notes record `db:migrate` as an outstanding step for the recruitment and walkthrough features.

**Why the declared indexes wouldn't help much even if present (confirmed from code):**

- Tenant-DB queries go through `prismaWithTenant`, which routes to the tenant database **without adding a `tenantId` filter**.
- A filter or sort that omits the leading `tenantId` key can't use a `[tenantId, …]` index for range or sort. Example: `/audit-logs` filters `timestamp` and sorts `timestamp:-1`.
- Exceptions: queries that pass `tenantId` explicitly can use them, including approval-engine steps, `tenant_settings`, leave-service `leaveBalance`/`compOffCredit`, and performance-review-service.

## 6. Execution-plan findings

All are bounded `explain("executionStats")` runs on `hrms-acme-corp` / `hrms-dev`, run once each. Raw values are in the CSV.

| Query (endpoint)                                                                 | Winning plan                                      | Keys / docs examined | Returned | Server time |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------: | -------: | ----------: |
| `auditlogs` `{timestamp ≥ now−7d}` sort `timestamp:-1` limit 200 (`/audit-logs`) | **COLLSCAN → in-memory SORT** (964 KB sorted)     |            0 / 4,525 |      200 |    **7 ms** |
| `attendance_records` 14-day range, `timeIn ≠ null` (dashboard attendance-trend)  | COLLSCAN                                          |            0 / 6,821 |        2 |        5 ms |
| `users` `{tenantId, employeeStatus:"Active"}` (dashboard, org chart)             | IXSCAN `employeeStatus` + FETCH filter `tenantId` |            106 / 106 |      102 |        0 ms |
| `performance_reviews` `{reviewerId}`                                             | COLLSCAN                                          |                0 / 1 |        1 |        0 ms |
| `tenant_settings` latest effective (`getActiveSettings`)                         | COLLSCAN + SORT                                   |                0 / 1 |        1 |        0 ms |
| `notification_recipients` `{userId, isCleared:false}` sort `_id:-1` limit 20     | IXSCAN `_id` backward + FETCH filter              |            719 / 719 |       20 |        3 ms |
| `approval_step_instances` `{tenantId, resolvedApproverId, status}`               | COLLSCAN                                          |               0 / 30 |        9 |        1 ms |
| `teams` `{teamLeaderId}` (`resolveCaller`)                                       | COLLSCAN                                          |                0 / 8 |        0 |        0 ms |
| `leaves` approved covering today (`statusToday`)                                 | COLLSCAN                                          |            0 / 1,495 |        0 |        1 ms |

The plans are inefficient (collection scans, blocking sorts) but cheap at this size. On the `auditlogs` scan, each request reads **all 14.7 MB** of the collection, including the 11 MB of legacy resume snapshots, to return 200 rows. That makes it the plan most sensitive to cold cache.

**Cold-cache hypothesis (strongly suspected, not verified).** The first audit's 9.3 s cold `/audit-logs` came from reading 14.7 MB from disk on a shared tier, compared with 7 ms warm.

## 7. Actual query timings: what exists

| Source                                  | Available?     | Result                                                                                                                                                              |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application query timing logs or traces | **No**         | The gateway and services log only per-request (HTTP) and per-RPC (gRPC) durations; there is no Prisma query timing                                                  |
| Atlas profiler (`system.profile`)       | **No**         | Permission denied                                                                                                                                                   |
| Atlas slow-query log (`getLog`)         | **No**         | The MCP `mongodb-logs` tool errors out                                                                                                                              |
| `$queryStats`                           | **No**         | Not allowed on this cluster                                                                                                                                         |
| Explain `executionStats` (bounded)      | **Yes**        | 0–7 ms server execution for every representative query (§6)                                                                                                         |
| Network round trip to Atlas             | **Measured**   | TCP connect from the gateway container: median **43.5 ms** (38.6–143.6, n=10); from the host: median 58.5 ms (31–284)                                               |
| gRPC service durations                  | **Yes (logs)** | `GetLeaveBalance` median **265.5 ms** (n=4, max 619); `GetAttendance` 407 ms (n=2)                                                                                  |
| Gateway per-request server time         | **Yes (logs)** | `/dashboard/data` 501 ms, `/audit-logs` 417 ms, `/get-org-chart` 259 ms, `/approvals/pending-all` 226 ms, `/get-notifications` 244 ms (medians after the guard fix) |

**There are no production per-query latencies to report.** The CSV contains only the explain, network and gRPC measurements above, each labelled with its source.

### Round-trip model vs measured (strongly suspected; needs instrumentation to confirm)

Predicted = sequential rounds × 43.5 ms + other measured components.

| Endpoint                 |                                                            Predicted | Measured server | Unexplained remainder                                                                                                               |
| ------------------------ | -------------------------------------------------------------------: | --------------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/approvals/pending-all` |                                                5 × 43.5 ≈ **218 ms** |      **226 ms** | ~8 ms                                                                                                                               |
| `/dashboard/data`        | 3 rounds (≈ 131 ms) + `GetLeaveBalance` (266 ms median) ≈ **397 ms** |      **501 ms** | ~100 ms: the slowest of ~45 parallel queries under jitter, plus `headcount-trend`'s in-memory dayjs loops                           |
| `/get-org-chart`         |                                                3 × 43.5 ≈ **131 ms** |      **259 ms** | ~130 ms: processing and serialising a 16 KB tree, needs instrumentation                                                             |
| `/audit-logs`            |                                2 × 43.5 ≈ **87 ms** + 7 ms execution |      **417 ms** | **~320 ms: transferring 958 KB of BSON from Atlas, Prisma decoding, `redactAuditValue` on 400 snapshots, and JSON-encoding 760 KB** |

## 8. Connection management

Facts from code:

- **Master client:** one `PrismaClient` per process, cached on `globalThis` (`packages/database/src/prismaClient.ts`). Pool size isn't set, so the driver default applies.
- **Tenant clients:** an LRU of up to **50** `PrismaClient`s per process (`tenantClientPool.ts`), each with `maxPoolSize=50`, idle-evicted after 30 minutes. `authenticate` calls `getClientForDb(dbName)` on every request, but that's a cache hit; **clients aren't recreated per request**. gRPC services bind the same pool from `x-tenant-db-name` metadata without any database lookup (`packages/grpc-server/src/base-server.ts`).
- **Processes holding pools:** the gateway plus 12 services (13 process types). The gateway forks `os.cpus().length` workers (2 locally). In a container, `os.cpus()` reports the _host's_ CPUs, not the CPU limit, so production may fork more workers than its 1-CPU limit suggests, each with its own master and tenant pools.
- **All tenant databases share one cluster**, so every pool counts against the same cluster connection limit.

Findings:

- **No evidence of connection churn or pool waits** in this single-user test. Concurrency was low: at most ~50 parallel queries from one `/dashboard/data` call. **Needs instrumentation** (pool wait time, open connections) before any change.
- **Risk (not measured):** `/dashboard/data` issues ~45–50 concurrent queries per call, close to one tenant pool's `maxPoolSize=50`. A few simultaneous dashboard loads could queue on the pool. The theoretical ceiling is 13 processes × (master + up to 50 tenants × 50), far above any shared-tier connection limit, though it's reached only lazily. **Don't raise pool sizes.** Reduce per-request fan-out first (§16) and measure.
- Connection counts on the cluster couldn't be read (`$currentOp` only shows this session).

## 9. Dashboard analysis (`/dashboard/data`, 508 ms browser / 501 ms server)

- **Collections touched (owner, 13 widgets):** master `users` (several counts, a groupBy, two unbounded `findMany`), and in the tenant DB: `teams`, `dashboard_preferences`, `tenant_settings` (several times), `attendance_records`, `holidays`, `resignations`, `leaves`, `wfh_requests`, `tickets`, `asset_issues`, `salary_advances`, `tenant_join_requests`, `job_openings`, `jobapplications` (groupBy), `application_stage_events`, `offers`, `payroll_runs`, `payroll_line_items`, `performance_review_cycles`, `performance_reviews` (groupBy). Plus the leave-service `GetLeaveBalance` RPC (`leavebalances`, `tenant_settings` via Redis, `comp_off_credits`).
- **Repeated work (confirmed from code):**
  - `resolveCaller` (user + led teams) and `loadLayout` (preferences + active-department groupBy) run in `/dashboard`, then again in **both** `/dashboard/data` calls (the page issues one for `org-today` and one for the rest). That's 3 × 4 queries and 3 × 2 sequential rounds per page.
  - `getActiveSettings` is called independently by `attendance-trend`, by `dayType` (`org-today`, `team-today`) and inside leave-service.
  - `user.count({ employeeStatus: "Active" })` is issued by both `workforce` and `attendance-trend`.
- **Sequential chains:**
  - `resolveCaller` → `loadLayout` could run in parallel, since only `teams` feeds the layout's dynamic options.
  - `joiners-leavers`, `my-reviews`, `payslip` and `review-cycle` each take 2 rounds.
  - `GetLeaveBalance` runs `leaveBalance.findFirst` → `getLeaveSettings` → `compOffCredit.findMany` strictly in sequence (`apps/leave-service/src/handlers/getLeaveBalance.ts`), and is the slowest single component at a median of 266 ms.
- **Over-fetching:** `headcount-trend` fetches **every user in the tenant** (no `where` beyond the injected `tenantId`, no `take`) plus all approved resignations, then filters in memory with dayjs inside nested loops. It's cheap at 104 users but grows linearly with headcount.
- **Expensive aggregation stages:** none; there are no `$lookup`, `$unwind` or `$facet` stages. The two `groupBy`s are small.
- **Caching:** safe for the org-wide widgets (§17).

## 10. Audit-log analysis (`/audit-logs?days=7`, 430 ms browser / 417 ms server; 9.3 s cold in the first audit)

- **Query:** `prisma.auditLog.findMany({ where: { timestamp ≥ now−days }, orderBy: timestamp desc, take: 200 })`. There is no `select`, so whole documents come back. There's no pagination or cursor (just a fixed cap of 200), and `days` defaults to 30 server-side.
- **Plan:** COLLSCAN over 4,525 docs (14.7 MB) plus an in-memory sort of 964 KB. 7 ms warm.
- **Why 760 KB for 200 rows (confirmed):**
  - Those 200 rows are **958 KB of BSON**. `oldValue` is 442 KB, `newValue` 441 KB (together 92%), and `userAgent` 23.5 KB. The largest row is 8 KB.
  - In the 7-day window, **304 of 379 rows are `WalkthroughProgress`** (1.33 MB). Every tour step saved by `PUT /walkthrough/progress` writes an `UPDATE` audit row with the whole progress JSON before and after. The walkthrough shipped in the latest commit, and all 304 rows date from today.
  - `DashboardPreference` contributes 34 rows / 111 KB.
- **Legacy bloat (confirmed):** 58 `JobApplication` audit rows (March–July 2026) total **11.1 MB**. The largest is 209 KB, where `resume` is about 103 KB in _each_ of `oldValue` and `newValue` (an inline resume, from before resumes moved to S3 references). They aren't returned for `days=7`, but **every audit-log query scans them**. They're also candidate PII held in a second place, which is a data-minimisation concern. **Nothing was modified.**
- **Indexes:** only `_id`. The declared `[tenantId, timestamp]` wouldn't serve this query, because there's no `tenantId` predicate. The handler's `userName` filter matches the denormalised **`username`** field, which isn't in any declared index (the schema indexes `userId`).
- **Hydration and population:** none (no `include`), but Prisma decodes the JSON fields of every row and `redactAuditValue` walks 400 snapshots.
- **Pagination without breaking correctness:** use a keyset cursor on `(timestamp desc, _id desc)` with `take: 50`, plus a list projection excluding `oldValue`, `newValue` and `userAgent`, and `GET /audit-logs/:id` for the diff on expand. Audit rows are append-only, so keyset pagination is stable (no skipped or duplicated rows when new rows arrive). Stored records are untouched.

## 11. Organisation-chart analysis (`/get-org-chart`, 270 ms browser / 259 ms server, 16 KB)

- **Round 1 (parallel):** CEO `user.findFirst`, `team.findMany()` (all teams, no projection), active `user.findMany` (selected fields), `user.count()`, `user.groupBy(employeeStatus)`.
- **Round 2:** `resolveUserNames(teams' leader and member IDs)` → `user.findMany({ id: { in } })`. **Redundant for active users.** Round 1 already holds every active user with the same fields; only non-active team members are missing. Resolving from the in-memory map and querying only the leftover IDs (often none) saves one round trip, about 43 ms.
- No recursion or N+1. Tree building is in memory. `count()` and `groupBy` could merge into the `groupBy` (sum the groups), saving one query but not a round.

## 12. Performance-review analysis (`/performance-reviews`, 260 ms browser; gRPC service 40–335 ms in logs)

- **Gateway:** `canManageReviews` runs `user.findUnique` only for non-HR roles (owners skip it), then a gRPC call to `listReviews`.
- **Service:** `findMany` plus `count` in parallel, with `where: { tenantId, userId | reviewerId, … }` and `orderBy: createdAt desc`. **When `limit` is absent, no `take` is applied**, and the web page's `?userId=` / `?reviewerId=` calls send none. A free-text `search` adds `contains, mode: "insensitive"` queries on `users` and `performance_review_cycles`, which can't use indexes.
- **Plan:** COLLSCAN on a 1-document collection, 0 ms. No index covers `reviewerId`, and none exists at all in `hrms-acme-corp`.
- **Latency:** the page fires 4 calls at once (two review lists, cycles, users); each is guard + gRPC + 1 round. Data size isn't a factor today.
- **Fix:** default `take` (for example 50) when `limit` is absent; indexes `{ userId: 1, createdAt: -1 }` and `{ reviewerId: 1, status: 1 }` (§15). Optional: one call returning both "mine" and "to review".

## 13. Pending-approvals analysis (`/approvals/pending-all`, 236 ms browser / 226 ms server)

| Round | Query                                                                                  | Collection                                    |
| ----- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0     | guard `tenants.findUnique`                                                             | master `tenants`                              |
| 1     | `approvalStepInstance.findMany({ tenantId, resolvedApproverId, status:"pending" })`    | `approval_step_instances` (COLLSCAN, 30 docs) |
| 2     | `approvalInstance.findMany({ id in … })` (approval-engine)                             | `approval_instances`                          |
| 3     | **`approvalInstance.findMany({ id in … })` again** (gateway `getPendingApprovalItems`) | `approval_instances`                          |
| 4     | per-module `findMany` (leave, resignation, overtime, WFH) plus `user.findMany`         | tenant DB plus master `users`                 |

The KYC branch (permission check, then 2 × `user.findMany`) and the join-request branch (permission check, then `tenantJoinRequest.findMany`) run in parallel with this chain and are shorter.

**Fix:** have the engine return the instances it already loaded (or let the gateway use them) and drop round 3. That's −1 round trip, about −43 ms, roughly −19%. Indexes on `resolvedApproverId`/`status` matter only as volume grows.

## 14. Additional findings

- **`/get-notifications` (on every full page load; server median 244 ms):** 3 parallel queries on `notification_recipients`, then `include` → a second sequential query on `notifications`. The plan walks `_id` backwards, filtering 719 docs to find 20 (3 ms). An index on `{ userId: 1, isCleared: 1, _id: -1 }` makes it exact; replacing `include` with one `aggregateRaw` (`$match` → `$sort` → `$limit` → `$lookup`) removes a round. Medium value given how often it's called.
- **Attendance duplicates (data integrity; confirmed):** 583 duplicated user-days. Any metric counting records rather than distinct `(userId, date)` pairs is inflated for 30 Apr – 7 Jul 2026. `attendance-trend` uses `Set` per day, so it's unaffected; other reports weren't checked. De-duplication is a **data change, out of scope and requiring approval**.
- **Master `users` lacks the declared `[tenantId, employeeStatus]` index:** every tenant-scoped user query filters by `tenantId` (injected by `$extends`), but the planner uses `employeeStatus` and filters `tenantId` after fetching. That's fine at 109 users, but it's the one master collection that grows with _every_ tenant.
- **`/view-applications/:id` (752 ms, n = 1):** too few samples for any conclusion. Measure it 5 or more times before investigating.

## 15. Proposed indexes (for approval; none created)

Principles:

- In a per-tenant database, `tenantId` is constant. Lead with the selective field. A leading `tenantId` helps only where the query passes it, and is otherwise dead weight.
- Write and storage costs are negligible at current volumes (collections of 1–7k docs).
- **Prerequisites:**
  1. De-duplicate `attendance_records` (583 groups) and `leavebalances` (1 group), a data change needing approval, **or** omit those unique indexes.
  2. Build indexes one at a time with `createIndexes` (not `prisma db push`), so one failure doesn't block the rest.
  3. Update `schema.prisma` to match, otherwise a later `db push` will re-add the `tenantId`-prefixed set.

| #   | Collection (DB)                                                         | Proposed index                                                                                                           | Serves                                                | Expected benefit                                                                                                        |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| I1  | `auditlogs` (tenant)                                                    | `{ timestamp: -1, _id: -1 }`                                                                                             | `/audit-logs` list and keyset pagination              | COLLSCAN of 14.7 MB → IXSCAN of the page; removes the blocking sort; protects against cold-cache reads (the 9.3 s case) |
| I2  | `auditlogs`                                                             | `{ entityType: 1, timestamp: -1 }`, `{ username: 1, timestamp: -1 }`                                                     | `entityType` / `userName` filters                     | Same, for filtered views                                                                                                |
| I3  | `notification_recipients`                                               | `{ userId: 1, isCleared: 1, _id: -1 }`                                                                                   | every page load (`get-notifications`, unread count)   | Exact match: 719 → 20 docs examined                                                                                     |
| I4  | `attendance_records`                                                    | **unique** `{ userId: 1, date: 1 }` (after dedupe), `{ date: 1 }`                                                        | attendance views, dashboard, `statusToday`            | Restores the integrity guarantee the schema intends; COLLSCAN 6,821 → range                                             |
| I5  | `leaves`                                                                | `{ userId: 1, from: 1 }`, `{ status: 1, from: 1, to: 1 }`                                                                | leave lists, `statusToday`, `team-leave`              | COLLSCAN 1,495 → range                                                                                                  |
| I6  | `approval_step_instances`                                               | `{ resolvedApproverId: 1, status: 1 }`                                                                                   | pending approvals                                     | Future-proofing                                                                                                         |
| I7  | `performance_reviews`                                                   | `{ userId: 1, createdAt: -1 }`, `{ reviewerId: 1, status: 1 }`, unique `{ cycleId: 1, userId: 1 }` (no duplicates found) | reviews pages, `my-reviews`                           | Future-proofing plus integrity                                                                                          |
| I8  | `teams`                                                                 | `{ teamLeaderId: 1 }`                                                                                                    | `resolveCaller` (every dashboard call)                | Future-proofing                                                                                                         |
| I9  | `tenant_settings`, `dashboard_preferences`, `holidays`, `leavebalances` | the declared unique keys (no duplicates in the first three)                                                              | `getActiveSettings`, layout, `dayType`, leave balance | Integrity; settings lookups become exact                                                                                |
| I10 | `hrms-dev.users`                                                        | `{ tenantId: 1, employeeStatus: 1 }` (declared but missing)                                                              | all tenant-scoped user queries                        | Keeps master user queries tenant-bounded as tenants grow                                                                |

**Measured benefit today is small:** at most ~7 ms per query, which is the explain execution time those indexes would remove. The case for them is integrity (unique keys), cold-cache protection on `auditlogs`, and growth.

## 16. Query and aggregation optimisation opportunities (code changes, for later approval)

| #   | Change                                                                                                                                                                                | Where                                                         | Saves (estimate)                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Q1  | `/audit-logs`: list projection without `oldValue`/`newValue`/`userAgent`, keyset pagination (50), diff on expand                                                                      | `handlers/general.ts`, web audit page                         | ~880 KB of 958 KB per page → most of the ~320 ms transfer and serialisation remainder |
| Q2  | Stop auditing `WalkthroughProgress` (add to `SKIP_MODELS`) or audit it without diffs; consider the same for `DashboardPreference`. **This is a product and compliance decision.**     | `packages/database/src/auditMiddleware.ts`                    | About 80% of new audit rows and bytes since the walkthrough launched                  |
| Q3  | Drop the duplicate `approvalInstance.findMany`                                                                                                                                        | `approvalChains.ts getPendingApprovalItems` / approval-engine | −1 round (~43 ms) on `/approvals/pending-all`                                         |
| Q4  | Resolve org-chart names from the round-1 `activeUsers` map; query only missing IDs                                                                                                    | `permissions.ts getOrgChart`                                  | −1 round (~43 ms)                                                                     |
| Q5  | `GetLeaveBalance`: run `leaveBalance.findFirst` and `getLeaveSettings` in parallel; move comp-off lookup out of the loop (one query)                                                  | `leave-service/handlers/getLeaveBalance.ts`                   | −1–2 rounds inside the slowest dashboard component                                    |
| Q6  | Dashboard: run `teams` and preferences in one parallel round; memoise `getActiveSettings` and the active-user count per request; share one `/dashboard/data` call for `org-today` too | `handlers/dashboard.ts`, `features/dashboard/data.ts`         | −1 round per call; −1 request per page                                                |
| Q7  | `headcount-trend`: count with date-bounded queries or one `groupBy` instead of loading all users                                                                                      | `handlers/dashboard.ts`                                       | Grows with headcount; small today                                                     |
| Q8  | `listReviews`: default `take` when `limit` is absent                                                                                                                                  | `performance-review-service/handlers/listReviews.ts`          | Bounds response size                                                                  |
| Q9  | `getNotifications`: one `aggregateRaw` with `$lookup` instead of `include`                                                                                                            | `notification-service/handlers/getNotifications.ts`           | −1 round on every page load                                                           |

## 17. Redis caching opportunities

Caching complements Q1–Q9; it doesn't replace them. Every key includes `tenantId`, and every cache read happens **after** the route's authorisation checks.

| Data                                                                                                                      | Queries avoided                                              | Key                                                                                             | TTL                                          | Invalidation                                                 | Risks / notes                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Active tenant settings (`getActiveSettings`)                                                                              | 1–3 per dashboard call, 1 per settings page, 1 per leave RPC | `t:{tenantId}:settings:active` (leave-service already caches `tenantSettings:leave:{tenantId}`) | 5–10 min, capped by the next `effectiveFrom` | Delete on `PUT /tenant-settings` and pending-settings cancel | A future-dated version must activate on time: cap TTL at `nextEffectiveFrom − now`                                           |
| Org-wide dashboard widgets (`org-today`, `workforce`, `headcount-trend`, `attendance-trend`, `hiring`, `hr-queue` counts) | ~25 of the ~45 queries per call                              | `t:{tenantId}:dash:{widget}:{settingsHash}`                                                     | 60–120 s                                     | Time-based; optional delete on attendance or leave writes    | Capability check before the cache read; never cache personal widgets (`my-*`, `leave-balance`, `payslip`) under a tenant key |
| Department/designation lists, active-user ID set                                                                          | groupBy plus `findMany` on master users                      | `t:{tenantId}:ref:departments`, `t:{tenantId}:ref:activeUserIds`                                | 10 min                                       | Delete on user create, status change or department change    | Membership changes take up to TTL to show                                                                                    |
| Approval queue                                                                                                            | none recommended                                             | —                                                                                               | —                                            | —                                                            | Per-user and must be fresh; fix Q3 instead                                                                                   |
| Audit logs                                                                                                                | **do not cache**                                             | —                                                                                               | —                                            | —                                                            | Sensitive; Q1 is the fix                                                                                                     |

Stampede control: a per-key in-process single-flight. Memory cost: a few KB per tenant.

## 18. Required instrumentation (minimum to measure query time per request)

Add a Prisma query extension to the master client (`prismaClient.ts`) and to each tenant client (`tenantClientPool.ts`), which covers the gateway and all gRPC services:

```ts
client.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const t = performance.now();
        try {
          return await query(args);
        } finally {
          recordQuery({ model, operation, ms: performance.now() - t });
        }
      },
    },
  },
});
```

- `recordQuery` adds to an AsyncLocalStorage bag created per HTTP request or RPC (the gateway already has `gatewayTenantStorage`; `runWithTenant` exists in the DB package): `queries`, `dbMs`, `maxQueryMs`, per-model counts.
- The existing "HTTP Request" and "gRPC Response" log lines gain `{ dbQueries, dbMs, maxQueryMs, route, requestId, tenant: sha256(tenantId).slice(0,8) }`, plus a Prometheus histogram `db_query_duration_ms{model,operation,service}`.
- **Never log `args`** (filters can contain names, emails or IDs), documents, audit snapshots, tokens or cookies.
- Add pool metrics through Prisma's `metrics` preview (open connections, wait time) to settle §8.
- Gate it with an env flag (`DB_QUERY_METRICS=1`) and enable in dev or staging first. The overhead is one `performance.now()` pair per query.
- Note that `dbMs` sums parallel queries; the critical path is better approximated by `maxQueryMs` per round. Log both.

## 19. Prioritised remediation backlog

| #   | Priority | Item                                                                                                                   | Evidence                                                     | Effort                      | Expected benefit                                                                           | Risk                                                           |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| D1  | **P1**   | Slim `/audit-logs` (Q1)                                                                                                | 958 KB per 200 rows; 92% snapshots; ~320 ms non-DB remainder | Medium                      | `/audit-logs` ~430 → ~120–150 ms (estimate); cold case bounded once I1 exists              | UI change (expand for diff)                                    |
| D2  | **P1**   | Decide audit policy for `WalkthroughProgress` / `DashboardPreference` (Q2)                                             | 304 of 379 recent rows; 1.33 MB in 7 days                    | Small                       | Stops audit-log growth from UI state                                                       | Compliance decision                                            |
| D3  | **P1**   | Add per-request query instrumentation (§18)                                                                            | No query timings exist anywhere                              | Small–Medium                | Turns §7's model into measurements                                                         | Must not log `args`                                            |
| D4  | P2       | Remove redundant round trips: Q3, Q4, Q5, Q6                                                                           | Round-trip model matches measured times within ~4–20%        | Small each                  | About −43 ms per removed round: pending-all −19%, org-chart −17%, dashboard −50–100 ms     | Low                                                            |
| D5  | P2       | De-duplicate `attendance_records` (583) and `leavebalances` (1) after review (**data change, needs approval**)         | Duplicate scan                                               | Medium (needs a merge rule) | Unblocks unique indexes; fixes inflated record counts for 30 Apr – 7 Jul                   | Must decide which copy survives                                |
| D6  | P2       | Database-per-tenant index plan I1–I10 (§15) plus schema alignment (**needs approval**)                                 | Live inventory vs schema                                     | Medium                      | Small today (≤ 7 ms per query); integrity and growth protection; I1 protects the cold path | Build one at a time; update schema so `db push` doesn't revert |
| D7  | P2       | Cache active tenant settings and org-wide dashboard widgets (§17)                                                      | Repeated reads per request and page                          | Medium                      | ~25 fewer queries per dashboard call                                                       | Staleness up to TTL                                            |
| D8  | P3       | `listReviews` default `take` (Q8); `getNotifications` single round (Q9); `headcount-trend` bounded (Q7)                | Code                                                         | Small                       | Bounded payloads; −1 round per page load                                                   | Low                                                            |
| D9  | P3       | Legacy inline-resume audit rows (11.1 MB): decide on a retention or redaction policy (**data change, needs approval**) | 58 rows, about 209 KB each                                   | Small                       | 2/3 smaller tenant DB; less PII duplication                                                | Audit-integrity policy                                         |
| D10 | P3       | Verify the gateway worker count in production (`WEB_CONCURRENCY`) vs the container CPU limit; measure pool usage       | `os.cpus()` in a container                                   | Small                       | Avoids pool multiplication                                                                 | —                                                              |
| D11 | P3       | Restart the MCP so `MDB_MCP_READ_ONLY` actually takes effect; consider a dedicated read-only Atlas user for the MCP    | §2                                                           | Small                       | Safety                                                                                     | —                                                              |

**Suggested order:** D3 (measure), then D1 + D2, then D4. D5/D6 when approved. D7 last, after the queries are lean.

## 20. Limitations and unresolved questions

- **No production query timings.** The profiler, slow-query log and `$queryStats` aren't available on this cluster and permission level. Query-time statements rely on single bounded `explain` runs, which can differ from production (cache state, concurrency, shared-tier throttling).
- **The round-trip model is inferred.** Sequential-round counts come from code reading; the RTT is TCP connect time (an approximation of one MongoDB round trip). D3 is needed to confirm per-request DB time.
- **Cluster tier not confirmed.** A shared or Flex tier is inferred from the disallowed features. If it's a shared tier, its throughput limits and latency jitter (RTT up to 144–284 ms in samples) affect tail latency independently of the queries.
- **Only `hrms-acme-corp` was analysed in depth.** The other tenant DBs were checked only for index presence.
- **Not traced:** `/chat/conversations`, `/view-applications/:id` (n = 1), and the internals of `getSeatStatus` and the 12 gRPC services beyond leave, notification and performance-review.
- **The MCP session wasn't in enforced read-only mode** (§2). All operations performed were read-only by choice. The data-modifying fixes (D5, D9) and index builds (D6) are recommendations only.
- **Open questions:**
  1. Which copy of each duplicated attendance record is authoritative?
  2. Should `WalkthroughProgress` changes be audited at all?
  3. What retention applies to audit snapshots containing resumes?
  4. Is the production gateway's worker count bounded?
