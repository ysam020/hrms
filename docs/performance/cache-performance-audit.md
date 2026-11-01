# Cache performance audit

**Date:** 2026-11-01. **Scope:** `packages/cache` (`CacheManager`), its 57 call sites in 9 services, and the in-process caches added in this pass.

Labels used below:

- **[Code]** comes from reading the source.
- **[Measured]** comes from benchmarks or live data.
- **[Estimate]** is an inference.

## 1. How the cache works today **[Code]**

| Property                            | Current design                                                                                                                                                                                          | Verdict                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Tiers                               | Process memory (LRU, per-key TTL) in front of Redis                                                                                                                                                     | Good                                                         |
| Tenant isolation                    | Keys are `t:{tenantId}:{domain}:…` at every call site checked (`analyticsRoutes.ts`, analytics-service, leave, recruitment…); the tenant comes from the request context, never from client input        | Good. No cross-tenant key found.                             |
| Invalidation                        | Write-time prefix index sets (`idx:{prefix}`) let `invalidatePattern` delete exactly the keys under a prefix, with **no `SCAN` and no `FLUSH`**. Redis pub/sub evicts the memory tier in every process. | Good. Targeted, not broad.                                   |
| Missed pub/sub messages             | On subscriber reconnect the memory tier is flushed (process-local only)                                                                                                                                 | Acceptable. This is the only broad flush, and it is local.   |
| Redis failure                       | `get` returns `null` (falls through to the database); `set` falls back to memory-only; both log the error                                                                                               | Safe. A Redis outage degrades latency, not correctness.      |
| TTLs                                | Per entity type: salary 4 h, analytics 1 h, dashboard 15 min, default 1 h; memory tier warmed for 5 min on a Redis hit                                                                                  | Reasonable for aggregate data                                |
| Jitter                              | **None** before this pass                                                                                                                                                                               | Fixed (§3)                                                   |
| Stampede protection (single-flight) | **None.** Every concurrent miss recomputes.                                                                                                                                                             | Open (§4)                                                    |
| Sensitive data                      | Cached values are aggregates (analytics, dashboards, leave summaries). No call site caches applicant documents, KYC, Aadhaar or credentials.                                                            | Good. Keep it that way: don't cache per-person PII payloads. |

## 2. Inventory of call sites **[Code]**

| Service                                | Call sites                              | What is cached                                                               |
| -------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| api-gateway                            | 9 files (`analyticsRoutes.ts` dominant) | Org analytics widgets, keyed `t:{tenant}:analytics:*`                        |
| analytics-service                      | 6                                       | Attendance, leave, salary, recruitment and growth analytics; dashboard stats |
| employee-service                       | 9                                       | Employee lookups and lists                                                   |
| recruitment-service                    | 12                                      | Job openings, pipeline summaries                                             |
| leave-service                          | 7                                       | Leave lists and balances, invalidated on writes                              |
| attendance-service                     | 6                                       | Attendance summaries                                                         |
| user-service / hrm-service / scheduler | 4 / 3 / 1                               | Profiles, HR activities; the scheduler invalidates after reconcile           |

## 3. Changes made in this pass

| Change                                                                                                                                           | Where                                                                     | Effect                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ±10% TTL jitter on entity TTLs; explicit TTLs unchanged; prefix-index sets kept at the maximum jittered TTL so they never expire before a member | `packages/cache/src/CacheManager.ts` (+2 tests)                           | Keys filled together no longer all expire in the same second **[Code]**. Services pick this up when their images are rebuilt.                                                                                                                                                                                                                     |
| Per-process tenant-subscription cache: ~30 s TTL with jitter, single-flight, **denials never served from cache**, failed loads not cached        | `apps/api-gateway/src/middleware/requireActiveSubscription.ts` (+2 tests) | Removes one master-database round trip from almost every business request **[Code]**. Date-based expiry is still evaluated live. **Trade-off:** a status change written elsewhere (webhook, reconciler, scheduler) can take up to ~30 s to _revoke_ access in other gateway workers. Granting access is immediate because denials always re-read. |

## 4. Recommendations not implemented (and why)

| #   | Recommendation                                                                                                                                    | Why not now                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Single-flight in `CacheManager` (`getOrSet(key, loader)` with an in-process promise map)                                                          | Needs migrating 57 call sites to a loader form. Worth doing for the heavy analytics loaders. **[Estimate]** At current traffic, stampedes are theoretical. |
| C2  | Redis-cache org-wide dashboard widgets (`t:{tenant}:dash:{widget}:{settingsHash}`), with the capability check _before_ the cache read (backlog 4) | Needs per-widget invalidation on attendance/leave writes to avoid stale "today" figures.                                                                   |
| C3  | Tenant settings: client-side share across pages plus a server cache invalidated on `PUT` (backlog 6)                                              | The client fix touches many settings pages. The server read is already a single indexed `findFirst`.                                                       |
| C4  | Do **not** add a broad flush to any write path                                                                                                    | Already true. Keep using `invalidatePattern` with the narrowest prefix.                                                                                    |
