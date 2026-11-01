# Architecture performance audit

**Date:** 2026-11-01. **Scope:** gateway middleware chain, Node event loop, gRPC fan-out, database connection pools, BullMQ/scheduler, and safety of local processes against the shared database.

Labels used below:

- **[Measured]** comes from benchmarks or live data.
- **[Code]** comes from reading the source.
- **[Estimate]** is an inference or hypothesis.

## 1. Gateway middleware chain

| Finding                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business routers each re-ran `authenticate → requireTenant → requireActiveSubscription → idempotency`, so one request paid for the guard several times | **Fixed earlier** (single `businessRouter`; 57 route-guard tests). Median GET went from 525 to 112 ms **[Measured, audit §27]**.                                                                                                                                                                                                                                                                          |
| `requireActiveSubscription` read the master `tenants` row on every business request                                                                    | **Fixed:** per-process cache with ~30 s TTL, single-flight, and denials always re-read (see `cache-performance-audit.md` §3) **[Code]**                                                                                                                                                                                                                                                                   |
| No visibility into database round trips per request                                                                                                    | **Fixed:** Prisma timing hook on every client (`packages/database/src/queryTiming.ts`). Logs slow queries (≥ `PRISMA_SLOW_QUERY_MS`, default 300 ms) and samples `PRISMA_QUERY_SAMPLE_RATE`. The gateway logs `db-heavy request` when a request runs ≥ 25 queries or spends ≥ 1 s in the database. Only model, operation, duration and route are recorded; **query arguments are never logged** (tested). |
| The rate limiter runs once, after `authRouter`                                                                                                         | Correct as-is (verified by tests)                                                                                                                                                                                                                                                                                                                                                                         |

## 2. Request fan-out and round trips **[Code]**

Each change below removes a sequential database round trip. Each round trip to the shared Atlas tier costs about 60–110 ms, measured earlier in the MongoDB audit.

| Endpoint                                | Before                                                                     | After                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /approvals/pending-all`            | steps → instances (engine) → **instances again** → entities and requesters | The engine returns `requestedBy`/`createdAt`; the handler no longer refetches instances. **−1 sequential round trip.**                     |
| `GET /get-org-chart`                    | 5 parallel queries, then a **user lookup for every team member**           | Names come from the active roster already loaded; only leaders/members no longer active are queried. **−1 round trip in the common case.** |
| `GET /dashboard`, `GET /dashboard/data` | `resolveCaller` → then the `dashboardPreference` row                       | The preference row loads in parallel with the caller (it needs only token ids). **−1 round trip on both calls of every dashboard load.**   |
| gRPC `GetLeaveBalance`                  | balance row → then leave settings → comp-off once per comp-off type        | The balance row and settings are read in parallel; comp-off is fetched at most once. **−1 round trip.**                                    |
| `GET /audit-logs`                       | 200 rows **with full before/after snapshots** (≈ 756 KB), collection scan  | Projected list without snapshots, indexed; `GET /audit-logs/:id` returns one redacted row on demand.                                       |

## 3. Node event loop **[Measured / Estimate]**

- The headless benchmark recorded **no long tasks** in the browser.
- On the server, the heavy synchronous work was JSON-serialising the audit-log snapshots (hundreds of KB per response) and recursive redaction over them. Both are now confined to single-row detail requests.
- **[Estimate]** No other CPU-bound handler was found in the hot paths reviewed. The cluster runs one worker per CPU.

## 4. Connection pools **[Code]**

- Tenant clients use `maxPoolSize=50` in an LRU of 50 databases per process. Multiplied by the cluster workers and 12 services, the theoretical ceiling far exceeds a shared Atlas tier's connection limit.
- **[Estimate]** At 4 tenants this is fine. Before onboarding many tenants, lower the per-tenant pool size (e.g. 10) or share one `MongoClient` across databases. This is backlog item 7 and remains open.

## 5. BullMQ, scheduler and shared-database safety

| Finding                                                                                                                                                           | Status                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every scheduler that could reach the database ran every cron. The local dev scheduler ran the production `updateLeaveBalance` on 2026-10-31.                      | **Fixed:** the scheduler is opt-in. `SCHEDULER_ENABLED=true` is set only in `docker-compose.prod.yml`; dev sets it to `false`. A disabled scheduler also removes stale repeatable jobs. Verified locally: "Scheduler disabled … removed 10 stale repeatable job(s)". |
| Two schedulers running the same job double-applied it                                                                                                             | **Fixed:** run lease (`apps/scheduler-service/src/utils/jobLease.ts`). A deterministic `_id` per job and period in master `scheduler_job_leases`; stale `running` leases (> 2 h) and `failed` leases can be taken over.                                              |
| Bulk maintenance scripts (seeds, fixes, migrations) could write to the shared cluster from a developer machine; this is how the 2026-07-09 seed incident happened | **Fixed:** `assertConfirmedWriteTarget()` in 8 scripts requires `CONFIRM_DB_WRITE_HOST` to equal the target host and never prints credentials                                                                                                                        |
| Jobs not idempotent by themselves (leave ledger carry-forward, accrual)                                                                                           | Mitigated by the lease. Ledger writers no longer corrupt the array shape (`database-remediation-plan.md` §8).                                                                                                                                                        |

## 6. Frontend request pattern **[Code]**

- **Analytics:** two charts each requested `/get-attendance-trends`. The second request superseded the first (abort plus retry), costing up to 3 requests. **Fixed:** one fetch shared by both charts.
- **Audit log page:** loads the list without snapshots and fetches one row's detail when the inspector opens.
- **Open (backlog 8b):** the axios same-URL GET policy is "cancel the earlier request, then retry it". Switching to "share the in-flight promise" would remove the extra requests everywhere. It needs care, because one caller's unmount abort must not cancel another caller's shared request.
