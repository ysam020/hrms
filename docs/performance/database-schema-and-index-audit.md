# Database schema and index audit

**Date:** 2026-11-01. **Scope:** master `hrms-dev` and the four tenant databases (`hrms-acme-corp`, `hrms-appinventiv`, `hrms-praesto`, `hrms-test`) on the shared Atlas cluster (MongoDB 8.0.36, shared/Flex tier).

Labels used below:

- **[Measured]** comes from live `listIndexes`, `explain` or counts on 2026-11-01.
- **[Code]** comes from reading the schema or source.
- **[Estimate]** is an inference.

## 1. Summary

|                                                         | Before                                         | After                                                                        |
| ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Non-`_id` indexes, acme / appinventiv                   | 16 / 16                                        | **134 / 134** [Measured]                                                     |
| Non-`_id` indexes, praesto / test                       | 115 / 115                                      | **138 / 138** [Measured]                                                     |
| Master `users_tenantId_employeeStatus_idx`              | missing                                        | **present** (`users` 5 → 6 indexes) [Measured]                               |
| `auditlogs` list query (acme, 200 newest, no snapshots) | collection scan of 14.7 MB plus in-memory sort | **IXSCAN `auditlogs_timestamp__id_idx`, 50 keys / 50 docs, 1 ms** [Measured] |
| Attendance month range (acme)                           | collection scan of 6,821 documents             | **COUNT_SCAN on `attendance_records_date_idx`, 3 keys** [Measured]           |
| Unique `attendance_records (tenantId, userId, date)`    | could not be built (583 duplicate groups)      | **built**; also `(userId, date)` unique [Measured]                           |

## 2. Why the tenant databases were nearly unindexed **[Measured + Code]**

`pnpm db:migrate` runs `prisma db push` once per tenant. On acme and appinventiv it stopped at the first unique index that existing data violated: `attendance_records (tenantId, userId, date)`, which failed with E11000 because of the duplicate rows written by the 2026-07-09 seed run (see `attendance-backfill-root-cause.md`). Everything after that point was never created.

After the seed cleanup (`database-remediation-plan.md` §8), a pre-check of **all 32 unique keys in the schema** against every tenant database found no duplicates, including duplicates of `null`, which Prisma's non-sparse unique indexes also reject. The push then completed on all four tenants with **no index dropped** (the before/after name sets were diffed).

## 3. Schema design issue: the indexes led with `tenantId` **[Code]**

Every tenant has its own database, and `prismaWithTenant` sends business queries to that database **without adding a `tenantId` filter**. Every declared index started with `tenantId`, so the planner could not use those indexes for queries that filter or sort on other fields. The following were added to `packages/database/src/prisma/schema.prisma`, all additive, each with a comment explaining why:

| Collection                | New index                                                              | Serves                                                        |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `auditlogs`               | `(timestamp, _id)`, `(entityType, timestamp)`, `(username, timestamp)` | `/audit-logs` list and its filters                            |
| `notification_recipients` | `(userId, isCleared, _id)`                                             | notification bell and unread count on every page              |
| `attendance_records`      | **unique** `(userId, date)`, `(date)`                                  | attendance views, dashboard "today", reconcile job; integrity |
| `leaves`                  | `(userId, from)`, `(status, from, to)`                                 | leave lists, team leave, "on leave today"                     |
| `approval_step_instances` | `(resolvedApproverId, status)`                                         | approvals inbox (`pending-all`)                               |
| `performance_reviews`     | `(userId, createdAt)`, `(reviewerId, status)`                          | reviews pages                                                 |
| `teams`                   | `(teamLeaderId)`                                                       | `resolveCaller` on every dashboard call                       |

The `tenantId`-prefixed indexes are kept. They cost little at this data volume and stay correct if routing ever changes.

## 4. `prisma db push` drops indexes it does not manage **[Measured, local throwaway DB]**

A probe on a throwaway database (`dropprobe` in the local `hrms-dev-mongodb` container) showed:

- An extra index on a collection that the schema maps (`leaves.extra_not_in_schema`) was **dropped** by `db push`.
- An index on a collection the schema doesn't map at that name was left alone.

The master database holds indexes created outside the schema:

- `tenants.razorpaySubscriptionId_unique_partial`
- the `McpGrant_*` and `SupportAgent_*` indexes
- `login_events_tenantId_userId_timestamp_idx`

`ensureMasterIndexes()` recreates most of these on gateway boot, but a master push would leave a window in which the Razorpay subscription id is **not unique**.

**Decision:** the master database was **not** pushed. The one missing schema index (`users (tenantId, employeeStatus)`) was created directly with `createIndexes`.

**Recommendation:** never run `prisma db push` against master. `push-to-all-tenants.ts` already targets tenant databases only.

## 5. Making migration failures visible **[Code]**

- `push-to-all-tenants.ts` already prints `FAILED: <db>` and exits 1 (verified earlier by local repro).
- It now refuses to run unless `CONFIRM_DB_WRITE_HOST` names the target host (`packages/database/src/scriptGuard.ts`, used by every bulk-write script). An accidental run against the shared cluster is no longer possible.
- **Still open:** run the unique-key duplicate pre-check (`uniqcheck` logic, §2) before pushing, so one bad row can't silently leave a tenant half-indexed. Today that check is a one-off script in the session scratchpad.

## 6. Remaining schema observations

| Item                                                                                         | Status                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LeaveBalance.balances` holds two shapes: the monthly ledger array, and a flat `{PL: n}` map | Writers no longer convert one into the other (§ leave-balance fix in `database-remediation-plan.md`). The two models still coexist; consolidating them is a product decision. |
| Readers used `findFirst` without `orderBy` on `leavebalances`                                | Now `orderBy: { id: "asc" }` in leave-service and reconcile, which is deterministic. The unique index now prevents a second row anyway.                                       |
| Optional `@unique` fields cannot be declared in Prisma for MongoDB (no sparse)               | Handled by partial indexes in `ensureMasterIndexes`. Keep that pattern.                                                                                                       |
| Master `users` is shared across tenants                                                      | `(tenantId, employeeStatus)` is now present.                                                                                                                                  |
