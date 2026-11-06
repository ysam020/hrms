# Latency root-cause analysis

**Date:** 2026-11-05. **Code:** `feature/perf-caching-observability` (64a67b8) plus the instrumentation described in §12. Nothing was optimised.

**Inputs:** [phase1-request-lifecycle-and-rbac-audit.md](phase1-request-lifecycle-and-rbac-audit.md), [baseline-2026-11-05.md](../../load-testing/reports/baseline-2026-11-05.md), [load-testing/README.md](../../load-testing/README.md) and the earlier audits in this folder.

**Rules followed:** no sustained load, no new database or cluster, no paid infrastructure, no production configuration change, no RBAC change.

**Evidence labels:** **[Measured]** comes from this session's instrumentation or experiments. **[Code]** comes from reading the source. **[Inferred]** is a reasoned conclusion that has not been measured directly.

## 1. Executive summary

In every environment measured, the gateway is not slow at computing. It is slow at **waiting**, and almost entirely for one thing: **MongoDB round trips, multiplied by how many of them sit on the critical path, plus the time to get a connection when none is idle.**

- **92% of server time is I/O wait** (warm, sequential, one request at a time). Of that, nearly all is database or gRPC-to-database round trips. **[Measured]**
- **One query costs one network round trip.** Each Atlas query takes 36 ms p50 from the test stack, which matches the bare `ping` RTT of 33 ms. Server execution is **0–2 ms** and every hot query is index-backed. **[Measured]**
- **Endpoint latency ≈ sequential round-trip depth × RTT.** Endpoints with 4–5 sequential waves of queries take 140–170 ms. Endpoints answered from cache take 5–10 ms. **[Measured]**
- **Under concurrency, waiting for a connection dominates.** A driver-level experiment shows the command round trip staying at about 31 ms while **checkout wait reaches 112–533 ms p50**. Pools grow slowly: at most 2 connections are opened at a time, at **210–330 ms each** (TCP + TLS + SCRAM). That explains the bimodal 30 ms / 0.5–0.9 s latency seen in the baseline. **[Measured]**
- **Not causes (measured):** JWT verification (two passes, 1–2 ms total), the subscription check (cached, 0 ms), Redis (0.4 ms per command), serialisation (≤ 1.3 ms even for 114 KB), event loop (utilisation ≤ 10%, lag p99 13 ms), GC (≈ 0.02% of wall time), query execution (0–2 ms).
- **The biggest caveat:** every measurement so far, including the baseline and the earlier audits, ran the gateway on a Mac **about 33 ms from Atlas**. **Production runs in the same AWS availability zone as the Atlas primary** (both `ap-south-1c` / `aps1-az2`), where a round trip should be about 1–2 ms. Production's real latency profile is **not yet measured**: the read-only production check was blocked in this session (§11).

## 2. Latency breakdown

Measured with the new per-request breakdown (§12) on the isolated `hrms-loadtest` stack: 248 sequential GETs as tenant `acme-corp` (owner and employee), 4 passes, sampled 00:57–01:04 UTC. Requests were run one at a time, so the CPU figures are attributable to a single request ("overlap 0"). Totals below are over the 174 warm requests.

| Stage                                                                                        | Wall time                                                                   | Evidence                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Client → gateway (loopback, TLS already up)                                                  | client − server = **3.4 ms** median                                         | client timing joined to server line by `x-request-id` |
| Global middleware + rate limiting (`rateLimit:general` + `rateLimit:default`; 2 Redis INCRs) | **1.3–4 ms**                                                                | stage marks                                           |
| `authenticate` (runs **2×** per business request: guard + route)                             | **1–2.2 ms for both passes** (≈ 2% of server time)                          | stage marks, `n = 2`                                  |
| `requireActiveSubscription`                                                                  | **0 ms** (process cache)                                                    | stage marks                                           |
| Everything before the route handler (`preRoute`)                                             | **2–6 ms**                                                                  | `guardsDone` mark                                     |
| Handler: database round trips                                                                | **dominant**: 2–5 sequential waves × ~36 ms                                 | op list, waves                                        |
| Handler: gRPC calls                                                                          | 40–47 ms each (the service's own DB round trip + ~5 ms)                     | op list                                               |
| Handler: Redis (CacheManager)                                                                | ~0 (served from in-process L1; 5 of 353 Redis commands came from the cache) | op list                                               |
| Serialisation (`res.json`: stringify + ETag + write)                                         | **0.2–1.3 ms**                                                              | wrapped `res.json`                                    |
| Non-I/O residual (CPU work + event-loop queueing + uninstrumented waits)                     | **4–10 ms** per request, **8%** of server time                              | `nonIoMs`                                             |
| Process CPU per request                                                                      | **6–22 ms** (17% of server time; includes Prisma's in-process query engine) | `cpuMs` at overlap 0                                  |

Overlapping waits are never summed. `ioBusyMs` is the **union** of all DB, Redis and gRPC intervals, and `nonIoMs = total − ioBusyMs`. `dbSum` (summed query durations) is reported separately from `dbUnion` (wall time with ≥ 1 query in flight). For `/approvals/pending-all`, 357 ms of summed query time fits into 108 ms of wall time.

## 3. Endpoint analysis (warm, medians)

| Endpoint                                                                    | Server ms | Queries | Sequential waves | Master `User` lookups | DB sum / union ms | gRPC      | Why                                                  |
| --------------------------------------------------------------------------- | --------: | ------: | ---------------: | --------------------: | ----------------- | --------- | ---------------------------------------------------- |
| `/get-all-attendances`                                                      |       169 |       5 |                5 |                     3 | 230 / 164         | –         | 5 round trips in a row, 3 of them user lookups       |
| `/dashboard/data` (live group)                                              |       165 |       7 |                4 |                     2 | 335 / 160         | –         | fan-out of 7 queries, but in 4 sequential waves      |
| `/view-all-kycs`                                                            |       141 |       3 |                4 |                     3 | 233 / 133         | –         | 3 user lookups in sequence                           |
| `/presence/people`                                                          |       136 |       5 |                5 |                     2 | 212 / 126         | –         | sequential chain; user lookups on 91 ms of it        |
| `/chat/unread-counts`                                                       |       124 |       2 |                4 |                     0 | 120 / 120         | –         | two sequential queries at p90-RTT                    |
| `/audit-logs`                                                               |       121 |       1 |                3 |                     0 | 112 / 112         | –         | one query, 70 KB response (serialisation 1.3 ms)     |
| `/approvals/pending-all`                                                    |       112 |      10 |                4 |                     3 | 357 / 108         | –         | 10 queries, well parallelised (5 in flight)          |
| `/get-org-chart`                                                            |       110 |       5 |                3 |                     4 | 240 / 101         | –         | 4 user lookups for one page                          |
| `/dashboard/data` (slow group)                                              |        89 |       8 |                4 |                     1 | 287 / 75          | 1         | parallelised; caches already help                    |
| `/get-notifications`                                                        |        57 |       0 |                3 |                     0 | 0 / 0             | 1 (47 ms) | one gRPC hop → service DB query                      |
| `/get-holidays`, `/leave-policy`, `/get-hr-activities`, birthdays, insights |   **5–8** |       0 |                2 |                     0 | –                 | –         | served from cache: only the 2 rate-limit Redis calls |

**Cold first calls** (first pass after start-up) add connection establishment. gRPC calls reach **p90 586 ms, max 693 ms**, and tenant queries **p99 478 ms**, while services open their first Atlas connections. **[Measured]**

**Small concurrent burst** (5 simultaneous `/dashboard/data` per user): per-query time **p50 124 ms, p90 330, max 565** (vs 36 / 40 / 289 sequential), and server time **412 ms vs 90 ms**. That's the connection-acquisition effect of §4.2, with no server slowdown. **[Measured]**

## 4. Database analysis

### 4.1 Query execution (server side): not a cause

Read-only `explain("executionStats")` on representative hot queries (tenant `acme-corp`, master `hrms-dev`):

| Query                                                       | Plan           | Keys / docs examined | Exec |
| ----------------------------------------------------------- | -------------- | -------------------- | ---: |
| master `users` by `_id` (the permission/superuser lookup)   | EXPRESS_IXSCAN | 1 / 1                | 0 ms |
| `notification_recipients` count `{userId, isCleared:false}` | COUNT_SCAN     | 8 / 0                | 1 ms |
| `teams` `{teamLeaderId}`                                    | IXSCAN         | 1 / 1                | 1 ms |
| `leaves` `{status:"Pending"}` sort `from` limit 25          | IXSCAN         | 7 / 7                | 2 ms |
| `auditlogs` sort `timestamp` limit 25                       | IXSCAN         | 25 / 25              | 2 ms |

The earlier audit's COLLSCANs were fixed by the tenant indexes added on 2026-11-01. **[Measured]**

### 4.2 Connection acquisition: the dominant cause under concurrency

Prisma 5.22 (Rust query engine) runs all database access. **It exposes no pool metrics for MongoDB:** with the `metrics` preview enabled, every pool gauge and counter stayed at 0 across 216 queries. **[Measured]** To see inside the pool, the same trivial read was run through the official Node driver with CMAP and command monitoring, firing 60 concurrent reads:

| maxPoolSize | Burst | Operation p50 / p90 | **Checkout wait** p50 / p90 | New connection setup | **Command RTT** p50 / p90 | Peak checked out |
| ----------: | ----- | ------------------- | --------------------------- | -------------------- | ------------------------- | ---------------: |
|          10 | cold  | 565 / 770 ms        | **533 / 738**               | 6 × 259 ms (p50)     | **30 / 84**               |                5 |
|          10 | warm  | 156 / 249           | 125 / 218                   | 3 × 212              | 30 / 33                   |                9 |
|          60 | cold  | 557 / 823           | **515 / 792**               | 6 × 275              | 31 / 80                   |                5 |
|          60 | warm  | 152 / 279           | 120 / 237                   | 4 × 329              | 31 / 37                   |                9 |

- **The command round trip (network + server) stays flat.** Nearly all of the extra time is waiting for a pooled connection.
- **Raising `maxPoolSize` from 10 to 60 doesn't help.** The driver opens at most **2 connections at a time** (`maxConnecting` default), each costing **210–330 ms** from this host: TCP plus about 4 round trips for TLS and SCRAM-SHA-256. So pools fill slowly and burst work queues behind them.
- **Prisma shows the same signature:** bursts of 10–60 reads got p90 tails of 140–970 ms while Atlas gained only 0–4 connections. **[Measured]** Rust driver internals (pool minimums, idle reaping) weren't observed directly. **[Inferred]**

This is the mechanism behind the baseline's bimodal latency: requests that find an idle connection take about 30–50 ms, and requests that queue behind connection setup take 0.5–0.9 s. **High confidence for the Mac-hosted environment.**

### 4.3 Pool topology: many small, independently warmed pools

12 services × 2 cluster workers × (one master client + one client per tenant database, cached up to 50) **[Code]**.

- **Each process warms its own pools.** Cold misses therefore repeat per process. The idle test stack alone held about 110 Atlas connections, and the baseline added 85 connections in 30 s at 10 client connections. **[Measured]**
- **The connection budget is shared.** On a 500-connection tier, every new connection is both a latency cost (§4.2) and a shared-capacity cost for production.

### 4.4 Atlas resource saturation: partly unresolved

- **What isn't readable:** on this shared/Flex tier, Atlas CPU, memory, WiredTiger, queueing, disk and IOPS can't be read (no Atlas API access; profiler, `$queryStats` and `getLog` are disallowed).
- **The evidence from the baseline:** during the 10-connection run, an independent dedicated connection (no pool) saw `serverStatus` RTT rise from 35–75 ms to **567 ms median**. Today's 60-way driver bursts kept command RTT at about 31 ms.
- **Hypothesis (not proven):** sustained load from about 24 processes, each opening connections (SCRAM auth is CPU-heavy server-side), degraded the shared tier itself. **Confidence: Low–Medium.** Testing it needs a short, approved, controlled run that correlates new-connection rate with an independent RTT probe.

## 5. Network analysis

| Path                              | Measured                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atlas topology                    | Replica set `<replica-set>`, primary `shard-00-02`, **AWS `AP_SOUTH_1`, zone `aps1-az2`**                                                                                                          |
| Production EC2                    | `<prod instance>` in `ap-south-1c` = **`aps1-az2`** (same zone as the Atlas primary)                                                                                                               |
| Test host (Mac) → Atlas           | DNS SRV 13 ms, A 194–325 ms (uncached); TCP 30–34 ms; TLS incl. TCP 109–116 ms; **`ping` RTT p50 33 / p90 96 ms**; new client incl. discovery + auth **2.3 s**; extra pooled connection 210–330 ms |
| Test host → Redis (own container) | **0.4 ms** p50 per command (loopback)                                                                                                                                                              |
| Gateway → gRPC services           | about 5 ms overhead on top of the service's own DB round trip (`leaveApplications`: 5 ms when the service hit its cache)                                                                           |
| Browser (Mac) → `api.praesto.in`  | DNS 3 ms cached / 185 ms cold; TCP 33–48; TLS +40–50; **TTFB 105–180 ms on a new connection, ≈ 30 ms on keep-alive** with `/health` doing no work                                                  |

Connection reuse works in steady state: warm sequential queries never created connections. The cost appears when pools grow (bursts) or start cold (deploys, scale-out, idle reaping). **[Measured]**

Prod→Atlas RTT, retransmissions and the prod per-route latency profile were **not measured**; that requires the blocked production read (§11). **[Inferred]** From same-AZ placement, prod's per-query cost should be about 1–3 ms, not 33 ms, which would make prod endpoints roughly 10× faster than every test-stack figure. That remains to be verified.

## 6. Node.js analysis (gateway, during sampling)

| Metric                                  | Value                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event-loop utilisation (new gauge, max) | **10%**                                                                                                                                                                     |
| Event-loop lag p99 (max)                | **12.8 ms**                                                                                                                                                                 |
| GC                                      | 0.18 collections/s, ≈ **0.02%** of wall time                                                                                                                                |
| CPU                                     | 1.4% of a core on average; 6–22 ms per request (includes the Prisma engine)                                                                                                 |
| **Memory**                              | container **640 MiB / 768 MiB**; primary 70 MiB + **two workers at 360–370 MiB RSS each**; heap used ≈ 275 MB in total; **external ≈ 300 MB in total (~150 MB per worker)** |

- **Latency:** the runtime is not a latency source at this load. Neither GC nor the event loop could produce the 0.5–0.9 s tails.
- **Memory:** a separate risk, about availability rather than latency. Two workers already sit near prod's 768 MiB limit, and about half of each worker is "external" memory: Buffers and native allocations, possibly the Prisma engine or SDK clients. **[Inferred]**

## 7. Application code analysis

> **Correction (2026-11-05, after measurement):** the "19% of server time" for master `User` lookups counted **every** master `User` read. Most are data reads (user lists, profile/KYC aggregations, org-chart counts), not redundant access checks. After request-scoped resolution was implemented, the sampled owner/employee workload showed 80 access lookups and only 5 reuses in 290 requests, with no measurable latency change. See [permission-resolution-comparison.md](permission-resolution-comparison.md). Production network RTT has since been measured at about 0.5–1.3 ms: [production-latency-verification.md](production-latency-verification.md).

| Suspected redundancy                                               | Frequency                                                                                                                                 | Measured cost                                                                                                                                                                           | Verdict                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `jwt.verify` 3× per business request (limiter key + guard + route) | every business request                                                                                                                    | `authenticate` 1–2.2 ms for both passes                                                                                                                                                 | **Minor** (~2% of server time). Worth removing for cleanliness, not for latency. |
| Subscription check                                                 | every business request                                                                                                                    | 0 ms (cached)                                                                                                                                                                           | Not a cost                                                                       |
| Rate limiting (2 Redis INCRs)                                      | every request                                                                                                                             | 1.3–4 ms                                                                                                                                                                                | Minor                                                                            |
| **Master `User` lookups** (permission/superuser/username)          | **41% of requests; up to 3–4 per request** (`/get-org-chart` 4, `/view-all-kycs` 3, `/get-all-attendances` 3, `/approvals/pending-all` 3) | **19% of all server time** is spent in critical-path waves made only of these lookups (upper bound: includes `/profile`'s legitimate read). Typical 35–90 ms per affected request here. | **Significant.** Each removed sequential lookup saves one RTT.                   |
| Sequential independent queries                                     | most heavy endpoints run 3–5 waves                                                                                                        | each wave = 1 RTT                                                                                                                                                                       | **Significant.** Collapsing waves is the main application-side lever.            |
| `/get-all-users?limit=1000` payload                                | 114 KB (capped at 200 users)                                                                                                              | serialisation 0.6 ms; ~1 RTT of transfer                                                                                                                                                | Minor on the server; matters on slow client links                                |
| Serialisation / transformation                                     | all                                                                                                                                       | ≤ 1.3 ms                                                                                                                                                                                | Not a cost                                                                       |

**Permission resolution, compared on the full request path:**

| Approach                                        | Cost per lookup                        | Effect on the critical path                                               |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Current: one master `User` round trip per check | ≈ 1 RTT (36 ms here; ≈ 1–3 ms in prod) | 1–4 sequential RTTs per request                                           |
| Request-scoped reuse                            | first lookup only                      | removes 0–3 waves per request, no freshness change                        |
| Redis cache                                     | 0.4 ms (+ invalidation design)         | removes all waves                                                         |
| 4-word bitmask                                  | nanoseconds                            | **no measurable effect on its own**: the cost is the fetch, not the check |

## 8. Root-cause ranking (by measured impact)

| #   | Category                                                          | Symptom                                                            | Root cause                                                                                                                                  | Confidence                                          | App-fixable?                                                                                    | Infra?                                                                             |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **Connection pool**                                               | Bimodal tails 0.5–0.9 s; bursts 4–5× slower; cold calls ≈ 0.6 s    | New connections cost 210–330 ms (TLS + SCRAM over a 33 ms RTT); at most 2 opened at a time; many small per-process pools warm independently | High (test env); prod magnitude unknown             | Partly: pool warm-up (`minPoolSize`), fewer processes/pools, keep connections from being reaped | Same-AZ placement shrinks the setup cost (verify in prod)                          |
| 2   | **Network × fan-out depth**                                       | Endpoints 100–170 ms at 3–5 waves                                  | Each sequential query wave costs one RTT; heavy endpoints chain 3–5                                                                         | High (test env); **likely small in prod** (same AZ) | Yes: fewer waves (parallelise independent queries, request-scoped reuse)                        | Running the test stack near Atlas would remove the RTT inflation from measurements |
| 3   | **Application I/O (redundant lookups)**                           | 41% of requests make 1–4 master `User` lookups; 19% of server time | Per-handler permission/superuser fetches, not reused within a request                                                                       | High                                                | Yes: request-scoped permission context (no semantic change)                                     | No                                                                                 |
| 4   | **Database saturation (shared tier)**                             | Independent RTT 567 ms under sustained load in the baseline        | Unproven: tier throttling or connection/auth storm                                                                                          | Low–Medium                                          | Partly (fewer connections, fewer queries)                                                       | Possibly a dedicated tier: decide only after a controlled, approved test           |
| 5   | **Infrastructure (memory)**                                       | Gateway 640–710 MiB of 768 MiB                                     | ~150 MB external memory per worker × 2 workers                                                                                              | Medium                                              | Probably (identify the external allocations)                                                    | Or raise the limit / use one worker                                                |
| –   | Middleware, Redis, serialisation, event loop, GC, query execution | –                                                                  | Measured negligible (§2, §6)                                                                                                                | High                                                | –                                                                                               | –                                                                                  |

## 9. Remediation plan (proposals, not implemented)

One change at a time, each measured with the §10 method.

**Application code**

1. **Request-scoped permission/user context.** Resolve `{isSuperUser, permissions, tenantRole}` once per request and reuse it in the ~27 call sites. This preserves semantics and adds no caching across requests. **Expected:** removes 1–3 sequential round trips on 41% of requests (−19% of server time in the test env).
2. **Collapse independent sequential waves** on the top endpoints (`/get-all-attendances`, `/presence/people`, `/view-all-kycs`, `/chat/unread-counts`, `/get-org-chart`), and order `isPrivileged` to check the JWT role before querying. **Expected:** 1–2 fewer RTTs per call.
3. Remove the duplicate `authenticate` and `jwt.verify` passes (≈ 1–2 ms; cleanliness).

**Database / connection management** 4. **Pool warm-up and retention:** a modest `minPoolSize` per client so bursts don't pay connection setup, and verify that the Rust driver's idle reaping isn't discarding warm connections. **Expected:** burst and cold tails drop from about 0.5–0.9 s toward about 1 RTT. Must stay inside the 500-connection budget (§4.3). 5. **Fewer, larger pools:** fewer processes per service (or a shared client per process across tenant databases), cutting total connections and cold misses. Needs design (Prisma's per-database clients).

**Redis:** nothing needed for latency. Redis config risks from the earlier audit still stand.

**Network / infrastructure** 6. **Measure production first (§11),** before any infrastructure change: same-AZ placement may already make §8 #2 small in production. 7. Gateway memory: a heap snapshot in the test stack (controlled environment) to attribute the ~150 MB of external memory per worker, then fix the source or adjust limits/workers. 8. A dedicated Atlas tier only if the controlled test in §4.4 shows tier saturation.

**Monitoring** 9. Ship the breakdown line to production at a low sample rate (e.g. 1%) with `REQUEST_TIMING_OPS=false`, and add the Grafana panels in §12.3.

## 10. Verification plan

| Fix                        | Measure with                                                                             | Pass condition                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Request-scoped permissions | `scripts/latency-sample.js` + `latency-analyse.js`, same tenant and passes, before/after | `masterUserLookups` per endpoint ≤ 1; waves −1 to −3 on the listed endpoints; identical response status/body hashes for every (role, endpoint) |
| Wave collapsing            | same                                                                                     | the endpoint's `waves` and `serverMs` drop proportionally; `dbSum` doesn't rise                                                                |
| Pool warm-up               | same sampler's **burst** phase + cold phase after restart; driver-style bursts           | burst per-query p90 close to sequential p90; cold gRPC p90 < 2× warm; Atlas connections stay < 300 with the stack idle                         |
| Memory                     | `docker stats` + RSS / heap / external per worker                                        | external per worker explained; container < 70% of its limit at rest                                                                            |
| Production                 | per-route p50/p95/p99 from prod Prometheus (7 days), before and after each deploy        | improvement visible on the same routes in prod, not only in the test stack                                                                     |

All comparisons use the identical sampler configuration. Reports keep exact UTC windows, and test-stack numbers are never mixed with production numbers.

## 11. Remaining unknowns

1. **Production latency profile.** A read-only SSM command (TCP connect times from the prod host to Atlas, plus 7-day per-route percentiles from prod Prometheus) was **blocked by the session's permission policy**. To unblock, either run it yourself or allow it. The commands are in §12.4. Without it, prod's RTT and real tails are inferred, not measured.
2. **Atlas server-side saturation under sustained load (§4.4):** needs an approved, short, controlled run.
3. **Prisma engine internals:** pool minimums, idle reaping and `maxConnecting` inside Prisma's Rust driver aren't observable through Prisma's metrics for MongoDB. The driver experiment is a strong proxy, not a direct measurement.
4. **The ~150 MB external memory per gateway worker:** source unidentified.
5. **gRPC service-side breakdown:** the services' own handlers aren't broken down yet. `downstreamMs` shows they cost about one RTT plus ~5 ms.
6. **Client-side (browser) timings in production:** only `/health` from one Mac was measured.

## 12. Instrumentation added (low overhead, off by default where it logs)

### 12.1 What changed

- **`packages/database/src/queryTiming.ts`:** the request scope now holds:
  - an ordered op list of every DB query (`master|tenant:Model.action`), Redis command and gRPC call, as name, start offset and duration only, with no arguments;
  - named stage timings;
  - Redis and serialisation totals;
  - `ioBusyMs` (union of all waits) and `nonIoMs`;
  - process CPU, valid only when `overlap` is 0. Overlap tracking is opt-in, used by the gateway only, which always closes its scopes.
- **`packages/cache`:** a `setRedisTimingHook` callback on CacheManager's existing Redis timer.
- **Gateway:**
  - stage marks for `authenticate` (every pass), both rate limiters, `requireActiveSubscription` and `idempotency`, plus `guardsDone`;
  - Redis timing on the rate limiter's store;
  - gRPC method names in the op list;
  - `res.json` timing;
  - an explicit `requestId` on the line.
- **`@hrms/logger`:** a `nodejs_eventloop_utilization_ratio` gauge (max over workers). No new high-cardinality labels.
- **Switches:** `REQUEST_TIMING_LOG=true` logs a line for every request, and `REQUEST_TIMING_OPS=true` adds the op list. Both default to off. Requests above 25 queries or 1 s of DB time are still logged as `db-heavy request`, with the new fields.

Tests: queryTiming (+5 tests), authenticate/routesGuard/platformAdmin mocks updated. 108 suites, 2,050 tests pass.

### 12.2 Tools

- `load-testing/scripts/latency-sample.js`: sequential, request-id-joined sampling. Not a load test.
- `load-testing/scripts/latency-analyse.js`: produces the per-endpoint breakdown, waves and op statistics.
- Raw data: `load-testing/reports/latency-sample-2026-11-05T00-57-26-184Z{,-analysis}.json`.

### 12.3 Grafana (proposed panels, using only existing low-cardinality metrics)

- Endpoint p50/p95/p99: `histogram_quantile(q, sum by (le, route) (rate(http_request_duration_ms_bucket[5m])))`. The buckets (5…5000 ms) are coarse around 500–1,000 ms; adding 50/150/300/750 ms buckets would sharpen the tails.
- Event loop: `nodejs_eventloop_utilization_ratio`, `nodejs_eventloop_lag_p99_seconds`. CPU/memory: `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_external_memory_bytes`.
- Redis: `cache_redis_duration_ms`. gRPC: `grpc_request_duration_ms` by method and outcome.
- Database waits and stage breakdowns live in Loki (`{service="api-gateway"} |= "request timing"`, `|= "db-heavy request"`), queried by `requestId`. They deliberately stay out of Prometheus labels.

### 12.4 Blocked production read (for you to run or allow)

Run on the prod host via SSM; read-only:

```
for ip in <atlas-ip-0> <atlas-ip-1> <atlas-ip-2>; do for i in 1 2 3; do s=$(date +%s%N); timeout 3 bash -c "exec 3<>/dev/tcp/$ip/27017" && echo tcp $ip $(( ($(date +%s%N)-s)/1000 ))us; done; done
# then, inside the prod Prometheus container (7 days, api-gateway):
#   histogram_quantile(0.5|0.95|0.99, sum by (le, route) (rate(http_request_duration_ms_bucket{service="api-gateway",method="GET"}[7d])))
```
