# Request-scoped permission resolution: before vs after

**Date:** 2026-11-05.

**Change:** `apps/api-gateway/src/services/userAccess.ts`, one lookup of the caller's access fields per HTTP request, reused by every check (§3). No Redis, no bitmask, no pool changes and no query parallelisation.

**Data files:**

- [permission-resolution-before.json](permission-resolution-before.json)
- [permission-resolution-after.json](permission-resolution-after.json)

Both are redacted: no request IDs or user identifiers; paths are normalised.

## 1. Method

| Kept identical  | Value                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Environment     | isolated `hrms-loadtest` stack on the Mac, shared Atlas cluster                                                                           |
| Tenant, users   | `acme-corp`; one owner and one employee (the only roles the tenant has)                                                                   |
| Workload        | `scripts/latency-sample.js --tenant acme-corp --passes 5 --burst 0`: 356 sequential GETs in the same order, 34 endpoints, same parameters |
| Instrumentation | `REQUEST_TIMING_LOG=true REQUEST_TIMING_OPS=true`                                                                                         |
| Services        | the same 11 gRPC service containers for both runs; **only the gateway was rebuilt** and recreated                                         |
| Concurrency     | none. One request at a time, so every request ran with `overlap = 0`.                                                                     |

The "before" gateway image was verified to contain no `userAccess` module, and the "after" image to contain it.

| Run    | Window (UTC)      | Joined to server breakdowns |
| ------ | ----------------- | --------------------------- |
| Before | 02:49:57–02:51:16 | 355 / 356                   |
| After  | 02:57:59–02:59:19 | 351 / 356                   |

Comparison: `scripts/permission-compare.js`. Latency reduction is `(before − after) / before`.

## 2. Results

### 2.1 Full workload, warm requests (passes 2–6)

| Metric (mean per request unless noted)        |    Before |       After | Reduction |
| --------------------------------------------- | --------: | ----------: | --------: |
| Requests compared                             |       294 |         290 |         — |
| Master `User.findUnique` round trips          |      0.33 |        0.31 |      5.0% |
| Time in those round trips (sum)               |   15.8 ms |     14.2 ms |     10.4% |
| Access lookups executed / reused (after only) |         — | 0.28 / 0.02 |         — |
| MongoDB operations                            |      1.94 |        1.94 |      0.0% |
| Cumulative DB time (sum of query durations)   |   88.1 ms |     96.0 ms |     −9.0% |
| DB wait wall time (≥ 1 query in flight)       |   47.0 ms |     51.8 ms |    −10.2% |
| Sequential DB/Redis/gRPC waves                |       3.2 |         3.2 |        0% |
| P50 server latency                            |     44 ms |       45 ms |     −2.3% |
| P95 server latency                            |    171 ms |      169 ms |      1.2% |
| P99 server latency                            |    189 ms |      206 ms |     −9.0% |
| Total server time, all compared requests      | 17,364 ms |   18,311 ms |     −5.5% |
| P50 client-observed latency                   |   47.9 ms |     48.4 ms |     −0.9% |

**On this workload the change has no measurable effect.**

- **The query count didn't change** (1.94 → 1.94). The small negative movements in time come from the network, not the code: average time _per query_ rose from 45.4 to 49.5 ms between the two runs, eight minutes apart, on the shared cluster from a link with a 33 ms RTT and a 96 ms p90.
- **The runs are within each other's noise.** No claim of improvement or regression is made from them.

### 2.2 Why: there was little to deduplicate on this workload

Across the 290 warm requests after the change, the resolver **executed 80 lookups and reused 5**:

- With the owner and employee roles, **almost every request makes exactly one access check**, which current semantics require. Owners and admins usually short-circuit on the JWT role. Employees are checked once.
- The only sampled endpoint with repeats was the employee's `/approvals/pending-all`: 3 → 2 user lookups and 4 → 3 queries. Its p50 went 83 → 48 ms, but n = 5 per run, so treat that as indicative.

**This corrects the earlier root-cause analysis.** It attributed about 19% of server time to "permission/user lookups", but that counted every master `User` read. In the same "before" data, 96 of the 213 master `User` operations were `findUnique` and 117 were data reads (user lists via `findMany`, profile/KYC `aggregateRaw`, org-chart `count`/`groupBy`/`findFirst`). Only a minority of the `findUnique`s were redundant access checks. [latency-root-cause-analysis.md](latency-root-cause-analysis.md) §7–§8 has been annotated accordingly.

### 2.3 Where the consolidation does remove queries (targeted check, after code)

Sequential GETs, 3 passes per route, first pass discarded. "Reuses" are MongoDB round trips that no longer happen.

| Role     | Route                       | Status | Access lookups / request | Reuses / request | Before (same code path, pre-change)                                                          |
| -------- | --------------------------- | -----: | -----------------------: | ---------------: | -------------------------------------------------------------------------------------------- |
| employee | `/tax-declarations/pending` |    200 |                        1 |            **3** | 4 lookups: two concurrent checks, each `isSuperUser` then `permissions`                      |
| employee | `/tax-declarations`         |    403 |                        1 |            **1** | 2                                                                                            |
| employee | `/get-kyc-insights`         |    403 |                        1 |            **1** | 2                                                                                            |
| employee | `/kyc-approvals/pending`    |    200 |                        1 |            **1** | 2                                                                                            |
| employee | `/approvals/pending-all`    |    200 |                        2 |            **1** | 3 (the remaining 2 are the tenant-scoped and unscoped lookups, kept separate on purpose: §3) |
| owner    | all 14 routes               |    200 |                      0–1 |                0 | role short-circuit, unchanged                                                                |

The configuration modules' GET handlers (exit templates, checklist defaults, notice-period policies, interview pipelines, pay cycles, PT/TDS slabs) do no permission check at all. Their double lookups (`isSuperUser` + `permissions`, now one) sit on the **write** paths, which a GET-only measurement can't exercise. Unit tests cover them (§4).

### 2.4 Cold requests (first pass after start-up), for completeness

MongoDB operations 2.5 → 2.1, cumulative DB time 140 → 118 ms, p50 77 → 50 ms, but p95 487 → 535 and p99 684 → 1,003 ms.

Cold requests are dominated by connection establishment (210–330 ms per new connection; see [production-latency-verification.md](production-latency-verification.md) §2), which varies from run to run. With n = 61 these figures are **inconclusive** and aren't used to judge the change.

## 3. What changed

**Consolidated:** 28 call sites, plus the shared `isSuperUser()` helper used by about 10 more handlers (leave, salary, recruitment, approval chains…), now read through `loadUserAccess`:

| Group                    | Call sites                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Middleware (unscoped)    | `requireSuperUser`, `requirePrivileged`, `requireHrPrivileged`, `requireSubscriptionManager`                                                                                                                                                                                         |
| Handlers (tenant-scoped) | assets, dashboard `resolveCaller`, employee ×3, exit checklist, exit-interview templates, general (avatar access), helpdesk, interview pipelines, notice-period policies, payroll ×3, payroll components, performance review, reports, salary, tax declaration, tenant settings, WFH |
| Services / MCP           | presence viewer, MCP recruitment gate                                                                                                                                                                                                                                                |
| Unscoped                 | support `loadTenantActor`, platform admin grants, support access, tenant (members/join requests) ×2                                                                                                                                                                                  |

**Not changed, on purpose:** reads of _other_ users' records (`/is-superuser/:username`, `/get-user-permissions/:username`, user lists, profile data), the support agent roster query, and `authenticate`'s username cache.

**Semantics preserved:**

- The resolver selects the union of the fields the sites read and normalises them exactly as they did.
- **Scoped and unscoped lookups are memoised separately.** The tenant-scoped client filters by the current tenant, so a user from another tenant still resolves to null on that path.
- The memo key includes the current tenant and the user ID.
- Failed lookups are never memoised; the error propagates as before.
- The six writes that can change a user's access fields (`permissions.ts` ×3, employee edit, org creation, tenant switch) invalidate the memo.
- **There is no state across requests.** The scope opens per HTTP request in `server.ts`, and nothing is kept in a module-level variable. Sockets, workers and MCP (outside the scope) query exactly as before.

## 4. Tests

| Suite                                                                                      | Result                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `__tests__/userAccess.test.ts` (new)                                                       | **51 / 51 pass**                                                                              |
| Gateway, logger, database, cache, grpc-server suites, against freshly built package `dist` | **109 suites, 2,101 tests pass**                                                              |
| Updated test doubles                                                                       | `taxDeclaration.test.ts`: the mock answered by `select` shape; a real row carries both fields |

**`userAccess.test.ts` covers:**

- one query per request for repeated and stacked checks;
- concurrent checks sharing one in-flight promise;
- no sharing across requests, tenants, users, or scoped and unscoped lookups;
- a missing user → no access;
- a database error → rejection, not memoised, retried next time, never access;
- invalidation within a request, and role changes visible on the next request;
- malformed permission data → no permissions;
- nothing retained after a request;
- deactivated (`Terminated`) or other-tenant users denied on the platform/support guards;
- a **36-case decision-equivalence matrix**: 6 user states (missing, superuser, `Subscription:*` permission, none, deactivated superuser, database error) × 6 roles, comparing `requireSuperUser`, `requirePrivileged`, `requireHrPrivileged`, `requireSubscriptionManager` (with and without a tenant) and `isSuperUser()` against a verbatim copy of the HEAD logic. **No case grants where the old code denied.**

**"Worker failed to exit" warning: pre-existing, not introduced here.**

- `--detectOpenHandles` attributes all 16 open handles to `@hrms/cache`'s module-level `cacheManager` singleton (`CacheManager.ts:526` at HEAD 64a67b8), which opens ioredis connections on import to subscribe to invalidations.
- They're reached through handler imports that already existed at HEAD (`tenantSettings`, `salary`, `tenantTokenStore`, `approvalChains`, `payment`, `invoice`).
- **Suggested fix (not applied):** subscribe lazily, or mock `@hrms/cache` in those suites.

**Separate test-infrastructure finding:** Jest maps `@hrms/*` to each package's built `dist/`, so gateway tests silently run against stale package builds unless the packages are rebuilt (they were stale since Nov 2–3 here). Worth a `pretest` build step.

## 5. Conclusion

- **On the sampled workload the change is correct and neutral.** It consolidates a real redundancy that's common on HR/permission-holder paths (up to 4 → 1 queries per request) but rare on the owner/employee pages that dominate this tenant's traffic.
- **Expected production effect:** at a production RTT of about 1 ms, each avoided warm lookup saves roughly 1–3 ms. It saves more only when the avoided lookup would have queued for a new connection, which the empty production pools make likely after idle periods.
- **This doesn't reach the dominant cause.** Production latency tails come from connection establishment (see [production-latency-verification.md](production-latency-verification.md)), and this change doesn't address that.
