# Phase 1: request lifecycle, RBAC and load-test readiness audit

**Date:** 2026-11-04. **Branch:** `feature/perf-caching-observability` (HEAD 64a67b8). **Code changed:** none.

This audit adds to the earlier ones and does not repeat them. Middleware fan-out, connection pools, BullMQ and the shared-database risk are in `architecture-performance-audit.md`. Cache design is in `cache-performance-audit.md`, query plans in `mongodb-query-performance-audit.md`, and per-fix latency history in `api-performance-audit.md` §27–28. This document covers what those leave out: the exact per-request lifecycle, the permission system, and what has to be settled before a load test can produce valid numbers.

Labels: **[Code]** comes from reading the source. **[Data]** comes from a read-only query of the live database (counts only). **[Estimate]** is an inference.

## 1. Request lifecycle for an authenticated business GET **[Code]**

`server.ts`, then `routes/index.ts`, then for example `routes/leave.ts`:

| #   | Step                                                                                                                                                               | Redis |         Mongo | Notes                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: | ------------: | -------------------------------------------------------------------- |
| 1   | helmet, `mcpRouter`, cors, cookieParser, CSRF (skipped for safe methods), `apiRequestLogger`, json/urlencoded                                                      |       |               |                                                                      |
| 2   | `applyRateLimiters` → `generalLimiter` on `/api`                                                                                                                   |     1 |               | Key is `userOrIpKey`, which runs **`jwt.verify` (pass 1)**           |
| 3   | `auditLogMiddleware`                                                                                                                                               |       |               | Writes only on mutations                                             |
| 4   | `authRouter` (no match), then path-less **`defaultLimiter`**                                                                                                       |     1 |               | **Keyed by IP** (no `keyGenerator`), 5,000/min                       |
| 5   | `tenantRouter`, `paymentRouter`, `publicRecruitmentRouter` (no match)                                                                                              |       |               |                                                                      |
| 6   | `businessRouter` guard: `authenticate` **(`jwt.verify` pass 2)** → `requireTenant` → `requireActiveSubscription` (30 s process cache) → `idempotency` (GET: no-op) |       |           0–1 | Both ALS contexts are entered                                        |
| 7   | Route-level `authenticate` again **(`jwt.verify` pass 3)**                                                                                                         |       |               | Present on 349 route definitions; ALS contexts entered a second time |
| 8   | Handler permission or role check                                                                                                                                   |       | **1** (often) | See §2                                                               |
| 9   | Handler data access: direct Prisma and/or gRPC → service → Prisma                                                                                                  |       |             n |                                                                      |

Two Redis round trips and three JWT verifications on every business request. The Redis cost is small (RTT ~0.04 ms, see `project` notes in the Redis audit). The JWT and ALS duplication is CPU only, probably tens of µs per request **[Estimate]**, and is not worth fixing ahead of the database items. It is listed so it can be removed cheaply along with any middleware change.

## 2. Permission system as it actually works **[Code]**

### Model

- **`TenantMembership.role`** (master DB): one of `owner | admin | hr | manager | employee`. It is copied into the JWT as `tenantRole` at login, and the access token lives 24 h.
- **`User.permissions: String[]`** (master DB): flat strings `Module:action` or `Module:action:scope`, validated against `packages/common/src/permissionCatalog.ts` (**96 strings**), with `*:*:*` as the superuser wildcard.
- **`User.isSuperUser`**: a boolean.
- **`Role`** (tenant DB): a named _template_. `saveUserPermissions` **copies** the role's strings into `User.permissions`. `updateRolePermissions` only edits the template, so users who already have the role keep their old copy. The user document is therefore the only source of truth for what a user can do.
- **`Team`**: `teamLeaderId` + `members[]`, used for the presence and org-chart team view.

### Evaluation

There is no permission middleware. Each handler decides for itself, using one of three patterns:

1. **Role from the JWT**: `authorize(...)`, `hasPrivilegedRole(tenantRole)`. This costs no I/O, but it trusts a role that can be up to 24 h stale. No role-change or deactivation path revokes it (a known gap, also recorded in the Redis audit).
2. **`isSuperUser(userId)`**: `prisma.user.findUnique({select:{isSuperUser}})`, a full Atlas round trip (~40 ms). `isPrivileged()` in `handlers/approvalChains.ts` runs it **before** checking the free JWT role, so owners and admins pay the round trip for nothing.
3. **Per-handler permission fetch**: `prisma.user.findUnique({select:{permissions,…}})` followed by `.includes("X:y")`. This pattern appears in 27 places across 25 files (`dashboard`, `presence`, `employee` ×3, `tenant` ×2, `wfh`, `assets`, `helpdesk`, `payroll`, `salary`, …), plus `hrm-service` `CheckPermission` over gRPC.

Nothing caches the permission lookup, within a request or across requests. One app-shell load runs several such lookups (profile, presence, dashboard, pending actions), and each one is a separate Atlas round trip **[Code; per-request count not yet measured]**.

### Update 2026-11-05: request-scoped access resolution

Pattern 2 (`isSuperUser`) and pattern 3 (per-handler `permissions` fetch) now go through `apps/api-gateway/src/services/userAccess.ts`:

- **Once per request:** `loadUserAccess(userId, { tenantScoped })` reads `{ isSuperUser, permissions, role, tenantId, username, employeeStatus }` once per HTTP request and shares the result, or the in-flight promise, with every later check in that request.
- **Scope lifetime:** an `AsyncLocalStorage` scope opened per request in `server.ts`. Nothing is cached across requests. Outside a request scope (sockets, workers, MCP) it is a plain query.
- **Two lookup flavours, kept apart:** tenant-scoped (`prismaWithTenant`, filtered to the current tenant) and unscoped master (`prisma`), memoised separately and keyed by tenant and user, so every call site gets the same answer its own query would have returned.
- **Failure handling:** failed lookups aren't memoised. Writes that change a user's access invalidate that user's entry within the request.
- **Decisions are unchanged:** a 36-case equivalence test checks them against the HEAD logic.
- **Pattern 1 (JWT `tenantRole`) is unchanged,** including its 24 h staleness. So is the ordering in `isPrivileged` (database before role); both are outside this change.

Measured effect: [permission-resolution-comparison.md](permission-resolution-comparison.md).

### Scope (self / team / all)

The catalog defines scoped strings (`Leave:view:team`, `Attendance:view:all`, `ResignationProcess:view_resignation:*`, …). **The backend does not read them**, with one exception: `ResignationProcess:view_resignation:all` in `handlers/dashboard.ts`. Today the scope of list endpoints comes from the role. For example, `GET /get-leave-applications` returns all leave for owner/admin/superuser (`isPrivileged`) and only the caller's own for everyone else, whatever `Leave:view:*` they hold. The scope strings currently drive the **web UI** only (`apps/web/.../permissions/PermissionBitmask.tsx`, a BigInt registry already used by `hasPermission.tsx`).

This matters for the bitmask work in two ways:

- The migration must reproduce **today's decisions**, which are role-driven for scoped resources. Making the backend start honouring the scoped strings would be a behaviour change (it would widen access for some users), not a refactor. It needs its own decision and its own tests.
- A comment in the web file says it "mirrors the server registry", but no server registry exists any more.

### Live data **[Data]** (master `users`, read-only aggregate, counts only)

109 users. 98 hold at least one permission string: on average 15.1 strings, at most 57. 4 are superusers.

Checking a 57-element array with `Array.includes` takes well under 1 µs. **Swapping `.includes()` for a bitmask therefore cannot measurably change API latency.** The cost lies in fetching the array (one Atlas round trip per check) and in repeating that fetch across handlers and requests. The bitmask is worth doing as a compact, cacheable, versioned encoding _of a cached permission context_. On its own it fixes nothing.

### Representation constraint

The catalog has 96 bits (plus the wildcard), so it does not fit a 31-bit integer. Options:

- **Fixed 32-bit words** (`number[4]`), encoded as a hex or base64url string for Redis, JSON and gRPC. This is plain JSON, BSON-safe and fast. Recommended.
- BigInt (what the web uses). It needs string serialisation everywhere and is slower than word operations, but it is harmless at this size.
- Bit positions must be **append-only** (the web file already follows this rule), with a registry version stored alongside every cached mask.

## 3. Load-test readiness: blockers **[Code + memory of earlier incidents]**

1. **The only reachable stacks both use the production database.** Local Docker and `local-secrets.json` point at `cluster0…/hrms-dev`, which _is_ production. 100–2,000 concurrent connections from the local gateway would compete with real tenants for the same Atlas tier, and so would hitting `api.praesto.in` directly. A GET-only workload still writes: `apiRequestLogger`, Prisma timing logs, rate-limit counters, presence heartbeats if any endpoint touches them, and possibly refresh-token rotation during setup. Load testing needs an isolated database (local `hrms-dev-mongodb` container or a separate Atlas cluster), seeded with synthetic tenants.
2. **The rate limiters cap a single load generator far below the target concurrency.** `defaultLimiter` allows 5,000/min **per IP**, about 83 RPS, so one Autocannon host is throttled to 429 almost immediately. `generalLimiter` allows 10,000/min **per user**, so a handful of test users caps throughput at ~167 RPS each. This is also a **production issue**: an office of employees behind one NAT address shares the 5,000/min IP budget. Options: key `defaultLimiter` by user like the other limiters (recommended; it is also the correct fix for NAT), raise limits in the load-test environment only, or generate load from many IPs. Raising limits only in the test environment changes the code path under test. Keying by user does not.
3. **Test identities need writes.** Dedicated tenants and users with owner/HR/manager/employee roles must be created. Under the shared-DB rule that must not happen in the production database.
4. **Monitoring gaps** (Grafana notes): no cAdvisor, Mongo exporter, Redis exporter or BullMQ metrics. Phase 3 can report Node, HTTP and gRPC metrics plus Loki logs, but **cannot** report container CPU, Mongo pool or Redis command latency until exporters are added. These must be reported as missing, not inferred.
5. **The load generator shares hardware with the server** if it is run on this Mac alongside the Docker stack. In that case, results are only valid as relative before/after comparisons, not as capacity figures.

## 4. Prioritised findings

| Priority                        | Finding                                                                    | Evidence                        | Proposed change                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical (before any load test) | Shared production DB is the only target                                    | §3.1                            | Isolated DB + seed script                                                                                                                                     |
| High                            | `defaultLimiter` keyed by IP throttles NAT offices and any load generator  | §3.2                            | Key by `userOrIpKey`                                                                                                                                          |
| High                            | Permission data fetched from Atlas per check, repeatedly, never cached     | §2                              | Request-scoped + Redis-cached permission context, versioned per user, invalidated on the 5 write paths in `handlers/permissions.ts` and on membership changes |
| High (security)                 | JWT `tenantRole` can be stale for 24 h after a role change or deactivation | §2                              | Fold `tenantRole` into the same versioned context; bump the version on change                                                                                 |
| Medium                          | `isPrivileged` queries Mongo before the free JWT role check                | `handlers/approvalChains.ts:47` | Check the role first                                                                                                                                          |
| Medium                          | Bitmask encoding (96 bits)                                                 | §2                              | 4×32-bit words inside the cached context; bits append-only                                                                                                    |
| Low                             | Triple `jwt.verify`, double ALS entry per business request                 | §1                              | Skip if `req.user` is already set; let the limiter reuse it                                                                                                   |

## 5. Not yet measured

- Permission lookups per request on the real app-shell page set: the Prisma timing hook can count `user.findUnique` per route, which needs a run.
- Baseline capacity: blocked on §3.
