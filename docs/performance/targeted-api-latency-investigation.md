# Targeted API latency investigation (2026-11-01)

**Endpoints:**

- `POST /refresh-token`
- `GET /get-notifications`
- `GET /dashboard/data` (the 13-widget admin request, and `ids=org-today`)
- `GET /get-attendance-summary/:userId/:year/:month`

**Environment:** local Docker stack → shared Atlas cluster (MongoDB 8.0.36, shared tier), one tenant (`hrms-acme-corp`), an admin account in an isolated browser profile.

Labels:

- **[Measured]**: this session's benchmarks, server timing logs or `explain`.
- **[Code]**: read from source.
- **[Hypothesis]**: plausible, not proven.

Nothing here is committed or deployed, and no shared-database records were changed.

## 1. Method

**Instrumentation (new, env-gated with `REQUEST_TIMING_LOG=true`, enabled in `docker-compose.dev.yml` only).** Logs carry route, status, byte count, timings, counts and model/operation names; never tokens, cookies, headers or query values. Lines are joined by the request id the gateway already propagates.

- **Gateway `request timing` line:**
  - total server time and the middleware → handler split (handlers call `markHandlerStart()`);
  - Prisma query count and summed duration (`dbMs`);
  - wall time with ≥ 1 query in flight (`dbBusyMs`) and peak concurrency (`maxInFlight`);
  - gRPC downstream time and response bytes.
- **gRPC services `grpc timing` line:** the same fields per call (`packages/grpc-server/src/base-server.ts`).
- **auth-service `refresh timing` line:** verify+sign / Redis / Mongo phases, never token values.
- **Pool wait cannot be measured directly.** Prisma's MongoDB connector exposes no pool-wait metric, so a query's duration includes pool checkout, the network round trip and server execution together.
  - **Proxies used:** `dbBusyMs` vs `dbMs`; `maxInFlight` vs the pool size (50 per tenant client); and a controlled read-only probe (`tooling/dbops` `rtt.js` / `rtt2.js` in the session) that sends `ping`, which has no execution cost, serially and concurrently.

**Benchmark: `tooling/targeted-bench.cjs` + `tooling/targeted-analyze.py`.**

- **Cold:** 8 full page loads, measuring the app's own single refresh per load. Refresh-token is never called in a loop.
- **Isolated:** 3 warm-up + 30 sequential requests per endpoint.
- **Burst:** 20 rounds of the five requests the dashboard page fires together.
- **Conditional:** 20 `If-None-Match` revalidations.
- **Widget:** each widget alone.

All requests are read-only GETs. Raw results: `targeted-latency-results.csv`.

**Sample-size caveat:**

- With n = 30, P99 is effectively the slowest one or two requests; with n = 20 burst rounds, P95 is the slowest round.
- Two runs of the same configuration varied by up to ~2× at P95 (compare `after` with `uncapped2`). Tail differences smaller than that are not conclusive.

## 2. What drives latency on this cluster [Measured]

| Probe (from the gateway container)        | Median | P95     | Wall time for the batch |
| ----------------------------------------- | ------ | ------- | ----------------------- |
| `ping`, serial                            | 32 ms  | 92 ms   | —                       |
| trivial indexed read, serial              | 35 ms  | 38 ms   | —                       |
| 40 concurrent pings, fresh pool (round 0) | 398 ms | 585 ms  | 665 ms                  |
| 40 concurrent pings, warm pool            | ~80 ms | ~140 ms | ~141 ms                 |
| the same 40 pings, at most 8 in flight    | ~34 ms | ~90 ms  | ~230 ms                 |

1. **Concurrency alone inflates every operation's latency about 2.4×**, even for a command that does no work. Peak in-flight counts (≤ 38) stay below the client pool size (50), so this isn't client-pool exhaustion. It is connection fan-out, server-side or proxy queueing on the shared tier, or both [Hypothesis: which of the two can't be separated with the available metrics].
2. **A fresh pool pays for opening connections** (TLS) on the first fan-out: the 398 ms round-0 median.
3. **Warm, unbounded concurrency still minimises the fanning-out request's own wall time** (141 vs 230 ms). Capping concurrency trades its own latency for less inflation of other concurrent work.

## 3. Findings and fixes per endpoint

### A. `POST /refresh-token`

**Path [Code]:**

- gateway: cookie decrypt → gRPC `RefreshToken`;
- auth-service: JWT verify + sign → one Redis `EVAL` (atomic compare-and-rotate) → an awaited Mongo mirror write of the new token hash (`prisma.user.update`).

The master audit middleware ran a **full `User` document read** before that write. Its diff ignores `refreshToken` as a sensitive field, so the read could never produce an audit row.

**Measured phases (8 refreshes):** verify+sign ≈ 1 ms; Redis ≈ 0–1 ms; **Mongo 202 ms median**, which was 2 queries.

**Fix:** the master audit middleware now skips both the pre-read and the (never-written) entry for a single-record `update` whose `data` touches only sensitive or bookkeeping fields.

- Tests cover both the skip case and the case where an ordinary field is mixed in, which is still read and audited.
- Refresh now runs **1 query instead of 2** [Measured].

**Result:** median about unchanged (221 → 226 ms client-side). The pre-read cost only ~30 ms; the remaining **~170–230 ms is the token-hash write itself**, an Atlas write acknowledged by a majority of replicas. In the after run, 2 of 8 writes took 577–639 ms, which is shared-tier variance [Measured].

**Not done (deliberately):**

- **Fire-and-forget mirror write:** it would leave a window where, after a Redis loss, the Mongo fallback still holds the rotated-out token's hash, allowing reuse of an invalidated refresh token. That breaks the rotation guarantee.
- **Lowering write concern** for the write is also a durability change.
- The real option is architectural: drop the Mongo mirror and rely on Redis persistence (AOF), or move the mirror off the response path with a fail-closed fallback. That is a security design decision for the owner.

### B. `GET /get-notifications`

**Path [Code]:** gateway → gRPC → notification-service: page query `findMany({ include: { notification } })`, plus two `count`s, all in parallel. The `include` costs a **second, sequential** round trip for the parent notifications.

**Baseline [Measured]:** isolated median 92 ms, but P95 468 / P99 988 ms. Tail requests showed single queries of 270–540 ms with no concurrency, which is Atlas variance multiplied across two sequential round trips.

**`304` path [Measured]:** a revalidation took 104 / 440 ms (median / P95). Express derives the ETag from the finished body, so the full gRPC work runs before the `304` is decided.

**Fix:**

- The page query is now one aggregation (`$match` on the indexed `userId` → `$sort _id desc` → `$skip`/`$limit` → `$lookup` on `notifications` → projection).
- It keeps the same filter, order, page size and response fields (bodies byte-identical: 8,603 bytes before and after).
- It still runs in parallel with the two counts, which use the `(userId, isCleared, _id)` index added earlier.
- A recipient whose parent notification is missing now comes back with blank text instead of failing the whole response (Prisma's required-relation `include` threw). This is documented and tested.
- `userId` must be an ObjectId (it comes from the token); anything else is `INVALID_ARGUMENT` without a query.

| Isolated, n=30     | Median | P95 | P99 |
| ------------------ | ------ | --- | --- |
| before             | 92     | 468 | 988 |
| after              | 60     | 106 | 126 |
| after (repeat run) | 55     | 144 | 322 |

| Conditional (`304`), n=20 | Median | P95 |
| ------------------------- | ------ | --- |
| before                    | 104    | 440 |
| after                     | 50     | 126 |

**Cheaper `304` — evaluated, not implemented.** A per-user "notification version" validator checked before any query would need every writer of `notification_recipients` to bump it. The writers include notification-service (create, mark read, delete), a gateway service (`payrollDisbursement.ts`) and data scripts. One missed bump means a client is told "not modified" while new notifications exist. Without a single write path, that can't be guaranteed.

### C. `GET /dashboard/data?ids=<13 admin widgets>`

**Query count [Measured]:** 48 → **46** queries per request; peak 36–38 in flight; 3.9–7.3 s of summed query time inside ~420–630 ms wall time. The ~48 from the earlier audit is confirmed.

**Per widget alone [Measured, n=8 each]:** every widget takes 80–135 ms with 5–11 queries, including the 4 shared caller/layout reads.

- 1-stage widgets: ~85 ms.
- Widgets with a dependent second read (headcount-trend, joiners-leavers, my-reviews, org-admin, payslip, review-cycle): ~120 ms.

So **no single widget or query is slow.** The combined request is slow because it issues ~42 reads at once on a cluster where concurrency inflates every operation (§2).

Middleware is 2–4 ms; the leave-balance gRPC hop is ~40–55 ms (leave-service: 1 query, ~35 ms).

**Fixes:**

1. **Request-scoped memo** (`once(caller, key, …)`, which lives only for the request) for figures several widgets read: active headcount (workforce, attendance-trend), pending salary advances (hr-queue, payroll), tenant settings (attendance-trend, day type). That's −2 to −3 queries.
2. **Departments read starts with the caller lookup** when the token's role already grants HR (needed to validate a saved layout), removing one sequential stage. A superuser without an HR role still gets it, one step later.
3. **Opt-in per-request read cap** (`limitReads`, `DASHBOARD_MAX_INFLIGHT_READS`):
   - Writes are never held, which prevents a deadlock with the audit middleware's nested read.
   - Waiting time is reported as `capWaitMs`.
   - Tested: the cap is honoured, writes bypass it, and it is per-request.
   - **Left unset by default** (see the results).

| Run (isolated n=30 / burst n=20) | Isolated median / P95 / P99 | Burst median / P95 / P99 |
| -------------------------------- | --------------------------- | ------------------------ |
| before                           | 477 / 809 / 858             | 700 / 1,066 / 1,269      |
| after (uncapped)                 | 431 / 817 / 873             | 637 / 963 / 1,037        |
| after (uncapped, repeat)         | 441 / 983 / 1,096           | 728 / 951 / 1,020        |
| cap 8                            | 404 / 813 / 922             | 802 / 925 / 935          |
| cap 8 (repeat)                   | 486 / 742 / 796             | 764 / 909 / 940          |
| cap 16                           | 355 / 979 / 1,511           | 762 / 926 / 928          |

**Conclusion:** the combined request improved slightly at the median; its isolated tails did not change measurably. The cap made the dashboard's own burst median worse (+90 to +165 ms). Its effect on the other requests in the burst was inconsistent: the first cap-8 run cut their P95 from ~550 to ~140 ms, but the repeat didn't reproduce it. **No default cap is justified by this evidence.**

**What would reduce this request:** fewer concurrent reads, by caching the org-wide widgets. Design, not implemented:

- **Key:** `t:{tenantId}:dash:{widgetId}:{settingsHash}`, with no user in the key for org-wide widgets only. Personal widgets (leave-balance, my-requests, my-reviews, payslip) are never cached.
- **Authorization:** the capability check (`isAuthorized`) runs **before** the cache read, so a cached value is never served to a role that can't see the widget.
- **Invalidation:**
  - headcount and workforce: user status, department and joins;
  - hiring: job openings, applications, offers;
  - hr-queue: KYC, resignations, tickets, assets, advances;
  - payroll: runs, advances;
  - review-cycle: cycles, reviews.
    These writes happen in several services, so each would publish an `invalidatePattern("t:{tenant}:dash:<widget>")`.
- **TTL:** short (60 s) as a backstop.
- **Why it isn't implemented:** without those hooks, a TTL-only cache would show stale HR-queue counts after an approval. That's a semantics change, and the brief rules out caching just for the benchmark.

### D. `GET /dashboard/data?ids=org-today`

**Before [Code + Measured]:** four sequential stages:

1. caller ∥ saved layout
2. department list (needs the caller's HR flag)
3. active users
4. today's attendance ∥ leave ∥ WFH ∥ settings ∥ holiday

10 queries, `dbBusyMs` ≈ total time. There were no redundant authentication, subscription or tenant lookups: middleware is 3–5 ms, and the subscription row is cached per process since the previous pass.

**Fix:** stage 2 now overlaps stage 1 (C.2). Stage 3 and stage 4 now run together: today's activity is read for the whole tenant and filtered in memory to the active (or department-filtered) people. Each tenant has its own database, so the scope is unchanged; counts are computed the same way.

|                | Isolated median / P95 / P99 | Burst median / P95 / P99 |
| -------------- | --------------------------- | ------------------------ |
| before         | 227 / 275 / 277             | 635 / 890 / 906          |
| after          | 124 / 184 / 294             | 393 / 795 / 803          |
| after (repeat) | 131 / 331 / 377             | 694 / 968 / 1,054        |

The isolated median roughly halved, consistent across runs. The burst numbers still depend on the combined request running alongside it (contention, §2).

**Caching assessment:** today's figures change with every punch-in, leave approval and WFH approval. The safe options are a very short TTL (≤ 30 s) or invalidation on attendance/leave/WFH writes (attendance-service, leave-service, gateway). Not implemented, for the same reason as C.

### E. `GET /get-attendance-summary/:userId/:year/:month`

**Path [Code]:**

- an authorization check: self, or `isPrivileged`, which only queries for someone else's record;
- then 4 parallel reads: attendance range, leave balance, settings, holidays.

**Query plans [Measured]:**

- The attendance range uses **`IXSCAN` on the unique `(userId, date)` index**, with plain date bounds and no function on the indexed field.
- Holidays by year is a collection scan of **6 documents in 0 ms**; an index would be speculative.

**Timing [Measured]:** isolated median 44–47 ms, P95 ~100 ms (unchanged, no code change needed). During the dashboard burst its P95 rose to 546–756 ms, purely from sharing the cluster with the combined request.

**Timezone finding [Measured]:**

- The summary uses UTC month boundaries. Every record written since spring 2026 is stored at UTC midnight (1,350 records), which matches.
- **351 legacy records (March 2026 and earlier) are stored at 18:30 UTC (IST midnight).** For those months a record on the first or last day can fall into the neighbouring month.
- This is a data-normalisation question for the owner; no data was changed.

## 4. Before/after summary (primary runs `before` → `after`; repeat run in brackets)

| Endpoint                        | Isolated P95                    | Isolated P99      | Burst P95         | Burst P99             |
| ------------------------------- | ------------------------------- | ----------------- | ----------------- | --------------------- |
| refresh-token (cold loads, n=8) | 266 → 650 (2 slow Atlas writes) | —                 | —                 | —                     |
| notifications                   | 468 → 106 [144]                 | 988 → 126 [322]   | 781 → 570 [412]   | 976 → 574 [511]       |
| notifications `304`             | 440 → 126                       | 467 → 259         | —                 | —                     |
| dashboard combined              | 809 → 817 [983]                 | 858 → 873 [1,096] | 1,066 → 963 [951] | 1,269 → 1,037 [1,020] |
| org-today                       | 275 → 184 [331]                 | 277 → 294 [377]   | 890 → 795 [968]   | 906 → 803 [1,054]     |
| attendance summary              | 99 → 109 [97]                   | 235 → 112 [112]   | 670 → 546 [756]   | 673 → 546 [759]       |

**Over 500 ms before the change:**

- **dashboard combined:** concurrency fan-out on the shared tier, plus sequential stages;
- **org-today:** sequential stages, plus contention when it runs with the combined request;
- **notifications:** tail only; two sequential round trips amplifying Atlas variance;
- **attendance summary:** burst tail only, from contention.

## 5. Tests

- **Full jest:** 3,070 / 3,070 pass (231 suites). **Web vitest:** 176 / 176 pass.
- **Typecheck:** clean for every changed package. **Lint:** clean for every changed source file.
- **New or updated tests:**
  - audit pre-read skip (2);
  - notification aggregation shape, filters, order, pagination, ObjectId guard, missing parent, EJSON dates (12);
  - read cap: honoured, writes bypass it, per-request (3);
  - auth refresh tests updated for the timings argument.
- Rotation and revocation behaviour is unchanged: the Redis script, the grace slot and the Mongo mirror write are untouched apart from timing.
- **ETag:** response bodies are unchanged (byte-identical), and Express still derives the ETag from the body, so a data change changes the ETag. The benchmark confirmed 20/20 `304`s for unchanged data, before and after. This harness doesn't test a data change between revalidations.

## 6. Remaining bottlenecks and recommendations

1. **Dashboard combined:** cache org-wide widgets with invalidation hooks (design in C), or have the admin layout request fewer widgets at once. This is the only lever left that reduces the fan-out.
2. **Refresh:** the majority-acknowledged mirror write is the floor (~170–230 ms). Changing it is a security/durability decision (A).
3. **Cluster tier:** concurrency inflation (§2) is a property of the shared tier [Hypothesis]. A dedicated tier would show whether the inflation is server-side throttling.
4. **Cold pool:** the first fan-out after a restart pays for TLS handshakes. A small `minPoolSize` on tenant clients would keep a few connections open [Hypothesis; not measured over idle periods, so not changed].
5. **Legacy attendance dates** at IST midnight (E): normalise, or make the summary boundary-tolerant. Owner decision.
