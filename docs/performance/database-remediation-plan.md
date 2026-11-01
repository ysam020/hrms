# Praesto Database Remediation Plan

**Date:** 2026-10-31 · **Inputs:** [`mongodb-query-performance-audit.md`](./mongodb-query-performance-audit.md), [`mongodb-query-results.csv`](./mongodb-query-results.csv), [`api-performance-audit.md`](./api-performance-audit.md), [`api-performance-backlog.csv`](./api-performance-backlog.csv) · **New artefacts:** [`index-differences.csv`](./index-differences.csv), `attendance-duplicate-review.csv` (**pending**, see §0)

> **Nothing in this plan has been executed against production.** No data, index, configuration, migration or application code was changed. The only writes made were to **two throwaway databases in the local Docker MongoDB** (`hrms-dev-mongodb`, not production), created to reproduce the migration failure and dropped immediately afterwards (§3.1).

Evidence labels used throughout:

- **[Measured]**: confirmed by direct measurement
- **[Code]**: confirmed by code or schema inspection
- **[Suspected]**: strongly suspected
- **[Unverified]**: not yet verified

---

## 0. Status: production database inspection paused

> **Update (2026-11-01): resolved.**
>
> - After a Claude Code restart, read-only mode was verified: process environment, absent write tools, Atlas host.
> - P1–P5 ran read-only. The results are in **[`database-verification-2026-11-01.md`](./database-verification-2026-11-01.md)**, with `attendance-duplicate-review.csv`, `audit-log-volume.csv` and the now-verified `index-differences.csv`.
>
> Key changes to this plan:
>
> - **(a)** The 583 attendance duplicates were all created by two concurrent writers on 2026-07-09 22:00–22:01 IST. Resolution should be a batch-level decision, with June (disbursed payroll) separate.
> - **(b)** The `leavebalances` duplicate copies have diverged.
> - **(c)** `attendance_breaks` is empty.
> - **(d)** Only these two keys block the migration.
> - **(e)** 92 schema indexes are confirmed missing in `hrms-acme-corp`.
> - **(f)** 57 audit rows and all 4 source `jobapplications` records hold clear-text Aadhaar numbers.
>
> The text below is the original pre-verification plan.

The brief requires the MongoDB MCP to run with `MDB_MCP_READ_ONLY=true` before any further database inspection. **That could not be verified, so all production database operations were stopped:**

- The MCP process still holds the manual Atlas connection created at 12:52 UTC, so it hasn't restarted since the config change.
- It still exposes the write tools (`insert-many`, `update-many`, `delete-many`, `create-index`, `drop-*`), which read-only mode removes.
- The config entry is correct (`claude mcp get mongodb` shows `MDB_MCP_READ_ONLY=true`), but only a restart applies it, and Claude Code can't restart itself from inside a session.

**Action for you:** restart Claude Code, or the MongoDB MCP server via `/mcp`. Then I verify read-only mode (the write tools are gone, and `preconfigured` resolves to the Atlas host) and run the read-only steps below.

| Pending step | What it produces                                                                                                                          | Prepared query |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| P1           | Re-validate duplicate counts and the `leavebalances` duplicate                                                                            | §1, rows 1–2   |
| P2           | `attendance-duplicate-review.csv`: per-group sanitised metadata and proposed resolution                                                   | §2.3           |
| P3           | Full live index inventory for `hrms-acme-corp`, `hrms-praesto`, `hrms-dev`; fills the "not yet verified" cells in `index-differences.csv` | §3.4           |
| P4           | Duplicate scan for every other declared unique key (so the next migration attempt doesn't stop at the next duplicate)                     | §3.4           |
| P5           | Audit-log volumes by entity and month; inline-resume and `aadharNo` presence counts (no values printed)                                   | §4.6           |

Until these run, the production figures below are the ones **measured earlier today** (in the read-only-by-discipline session of the MongoDB audit), labelled **[Measured]** with that caveat.

## 1. Phase 1: validation of earlier findings

| #   | Finding                                                                                                                                                                                                                                                     | Label                                                                                                                                                             | Evidence                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `hrms-acme-corp.attendance_records` has **583 duplicate `(tenantId, userId, date)` groups**. Each has exactly 2 copies, both with `timeIn`, dated 2026-04-30 to 2026-07-07, and none is missing `tenantId`.                                                 | **[Measured]** (earlier today); re-check pending P1                                                                                                               | `$group` count aggregation, no personal fields returned                                        |
| 2   | `hrms-acme-corp.leavebalances` has **1 duplicate `(tenantId, userId)` group**                                                                                                                                                                               | **[Measured]** (earlier today); re-check pending P1                                                                                                               | Same method                                                                                    |
| 3   | `hrms-acme-corp` lacks almost every schema index; `hrms-praesto` has them (checked on `auditlogs`)                                                                                                                                                          | **[Measured]** for the 15 collections inspected; **[Unverified]** for the rest (P3)                                                                               | `collection-indexes`; `db.stats()` = 89 indexes / 73 collections                               |
| 4   | **The failed migration explains the missing indexes exactly.** `prisma db push` fails with `E11000 duplicate key` building `attendance_records_tenantId_userId_date_key`. The failed push leaves **16 non-`_id` indexes**; production has 89 − 73 = **16**. | **[Measured]** (local reproduction) + **[Suspected]** (that this is what happened in production: the signature matches exactly, but no production run log exists) | §3.1                                                                                           |
| 5   | Recent audit rows are dominated by `WalkthroughProgress` (304 of 379 in 7 days, 1.33 MB). 58 legacy `JobApplication` rows embed inline resumes (11.1 MB; largest 209 KB).                                                                                   | **[Measured]** (earlier today; sizes only); re-check pending P5                                                                                                   | `$bsonSize` aggregations                                                                       |
| 6   | Snapshots are 92% of the bytes `/audit-logs` returns (883 KB of 958 KB for 200 rows)                                                                                                                                                                        | **[Measured]** (earlier today)                                                                                                                                    | `$bsonSize` aggregation                                                                        |
| 7   | Repeated sequential round trips: duplicate `approvalInstance.findMany` (pending-all); org-chart `resolveUserNames` re-fetch; dashboard `resolveCaller` → `loadLayout` serial and repeated across 3 calls; `GetLeaveBalance` three serial queries            | **[Code]**                                                                                                                                                        | §5 (file and line references)                                                                  |
| 8   | Each sequential round trip costs about 43.5 ms (gateway container → Atlas primary, median of 10)                                                                                                                                                            | **[Measured]**                                                                                                                                                    | `mongodb-query-results.csv`                                                                    |
| 9   | `createMany({ skipDuplicates: true })` in `reconcileAttendance` relies on the unique index that's missing in `hrms-acme-corp`, so it doesn't skip duplicates there                                                                                          | **[Code]**; whether it has produced duplicates is **[Unverified]** (P2 groups by status)                                                                          | `apps/scheduler-service/src/jobs/reconcileAttendance.ts:243`                                   |
| 10  | `aadharNo` (camelCase, on `JobApplication`) isn't redacted in audit snapshots (`aadhar_no` is)                                                                                                                                                              | **[Code]**; presence in stored rows **[Unverified]** (P5)                                                                                                         | `packages/database/src/auditMiddleware.ts`, `isSensitiveAuditField` tested against field names |

## 2. Phase 2: attendance data-integrity review

### 2.1 What a duplicate means here (from code)

- `AttendanceRecord` fields: `tenantId`, `userId`, `date`, `timeIn`, `timeOut`, `workingHours`, `overtimeHours`, `status`, `isCorrected`, `correctedBy`. **There is no `createdAt` or `updatedAt`**, so the ObjectId's embedded timestamp is the only creation-time signal. **[Code]**
- **`AttendanceBreak.attendanceRecordId` cascades on delete.** Deleting either copy deletes its breaks, so any resolution must first move breaks to the surviving record. **[Code]**
- The schema declares `@@unique([tenantId, userId, date])`; production doesn't enforce it. **[Code] + [Measured]**
- Write paths that can create a second row when no unique index exists **[Code]**:
  - `attendance-service/handlers/markAttendance.ts` (~L177–212): `findFirst` existing → `create`. Check-then-insert, so a double tap or retried request can race.
  - `attendance-service/handlers/correctAttendance.ts` (~L80–95): `create` when no existing record is found.
  - `scheduler-service/jobs/reconcileAttendance.ts` (L243): `createMany({ skipDuplicates: true })`. That's a no-op without the unique index, so re-runs duplicate Holiday/Week Off/Leave rows.
  - `api-gateway/handlers/approvalChains.ts` (L650): `upsert` on approval (safe only with the unique index).
- **Likely origin [Suspected]:** both copies carry `timeIn` (so not the reconcile job, whose rows have none), and the groups cluster in one ten-week historical window that ends 2026-07-07. That suggests either a punch race or a one-off bulk import. ObjectId timestamps (P2) will tell them apart: same-second creation means a race; creation long after `date`, for many groups at once, means an import.

### 2.2 Resolution rules (proposed; nothing executed)

The newest record is **not** chosen automatically, and identical `(userId, date)` values don't make two records interchangeable.

| Outcome                   | Condition (all must hold)                                                                                                                                                                                                               | Proposed action                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Retain one**            | Both copies agree on `timeIn`/`timeOut` to the minute, `status`, `workingHours`, `overtimeHours` and `isCorrected`; at most one has breaks; neither is referenced elsewhere                                                             | Keep the copy with breaks (or the one with the lower ObjectId if neither has any); archive the other (§2.4) |
| **Merge non-conflicting** | Fields differ only where one copy is null (for example one has `timeOut`, the other doesn't); breaks don't overlap                                                                                                                      | Keep one; fill its nulls from the other; re-point the other's breaks; archive the other                     |
| **Manual review**         | Any conflicting non-null value (different `timeIn`/`timeOut`, `status`, `workingHours` or `overtimeHours`); `isCorrected`/`correctedBy` on either copy; overlapping breaks; or the date falls inside a **disbursed payroll run** period | Route to HR with both versions side by side; no automated change                                            |

Payroll check: the duplicates span May–July 2026. If a payroll run for those months is disbursed, attendance-derived pay (loss-of-pay and overtime) may already reflect the duplicates. Any change must be reviewed against those runs; it must not silently alter history. **[Unverified]**: P2 joins `payroll_runs` status by month.

### 2.3 Prepared read-only extraction for `attendance-duplicate-review.csv` (to run after P0)

One bounded aggregation over `attendance_records` (6,821 docs). The output contains **no names, emails or raw IDs**:

- employees appear as `sha256(userId)` truncated to 10 characters, computed in the pipeline;
- record IDs appear only as their creation timestamps.

```js
// hrms-acme-corp.attendance_records — read only
[
  {
    $group: {
      _id: { u: "$userId", d: "$date" },
      n: { $sum: 1 },
      recs: {
        $push: {
          oid: "$_id",
          created: { $toDate: "$_id" },
          timeIn: "$timeIn",
          timeOut: "$timeOut",
          status: "$status",
          wh: "$workingHours",
          ot: "$overtimeHours",
          corrected: "$isCorrected",
          correctedBy: {
            $cond: [{ $ifNull: ["$correctedBy", false] }, true, false],
          },
        },
      },
    },
  },
  { $match: { n: { $gt: 1 } } },
  {
    $lookup: {
      from: "attendance_breaks",
      localField: "recs.oid",
      foreignField: "attendanceRecordId",
      as: "breaks",
      pipeline: [
        { $project: { attendanceRecordId: 1, startTime: 1, endTime: 1 } },
      ],
    },
  },
  {
    $project: { _id: 0, u: "$_id.u", date: "$_id.d", n: 1, recs: 1, breaks: 1 },
  },
];
```

The result is processed in memory only. Before anything is written, `u` is replaced by `sha256(tenantDb + ":" + userId)` truncated to 10 hex characters, and record `oid`s are replaced by their creation timestamps. Raw IDs never reach the CSV, logs or the transcript. The resolution column is computed client-side from the rules in §2.2. CSV columns: `tenant_db, employee_ref (hashed), attendance_date, duplicate_count, record_a_created, record_b_created, created_gap_seconds, timeIn_diff_min, timeOut_diff_min, status_a, status_b, workingHours_a, workingHours_b, overtime_a, overtime_b, corrected_a, corrected_b, breaks_a, breaks_b, payroll_run_status_for_month, proposed_resolution, evidence`.

### 2.4 Proposed resolution procedure (separate approval required)

1. **Non-production first:** restore a snapshot of `hrms-acme-corp` into a staging cluster (Atlas backup restore, or `mongodump` to a staging DB). Run everything there.
2. **Dry-run script**, read-only on production: emit the planned per-group actions (keep, merge or review) as JSON, with no writes.
3. **Reviewed apply (staging, then production after sign-off):**
   - copy each record to be removed, with its breaks, into `attendance_records_dedup_archive_20261031` (same database) plus an offline export;
   - re-point breaks;
   - apply merges;
   - delete the archived duplicates;
   - all in one transaction per group (Atlas replica set supports this).
4. **Rollback:** re-insert from the archive collection, which keeps the original `_id`s and break links.
5. Only then build the unique index (§3.3).

## 3. Phase 3: migration and index plan

### 3.1 Why the migration fails **[Measured], local reproduction**

- `pnpm db:migrate` runs `packages/database/src/push-to-all-tenants.ts`, which loops over tenants and runs `prisma db push --skip-generate` with `DEV_MONGODB_URI` pointed at each tenant DB. On error it prints `FAILED: <db>`, records the failure and **continues to the next tenant** (exit code 1 at the end). The failure is easy to miss in long output. **[Code]**
- **Reproduction:** two throwaway databases in the local `hrms-dev-mongodb` container. Prisma CLI 5.22 ran from the gateway image in a disposable container, with the repo schema mounted read-only.

  | Database                    | Seed                                                                     | `db push` result                                                                        |                                   Non-`_id` indexes left |
  | --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------: |
  | `perf_repro_clean_20261031` | empty                                                                    | exit 0, "indexes are now in sync"                                                       | **122** across 76 collections (4 collections `_id`-only) |
  | `perf_repro_dup_20261031`   | one duplicate `(tenantId, userId, date)` attendance pair (synthetic IDs) | **exit 1: `E11000 duplicate key … index: attendance_records_tenantId_userId_date_key`** |                       **16** (68 collections `_id`-only) |

- **Why it's not partial-but-useful:** `db push` stops at the first failed index build. It creates the indexes ordered before that point (the 16 listed in `index-differences.csv`: master-model indexes such as `users_*` and `tenants_*`, plus `tenant_join_requests`, `tenant_memberships` and `attendance_records_tenantId_date_idx`) and none after.
- **Match to production:** `hrms-acme-corp` has 89 indexes over 73 collections, i.e. **16 non-`_id` indexes**, and its `attendance_records` has exactly `_id` + `tenantId_date_idx`. Identical to the failed-push signature. **[Measured]**. That `db:migrate` was actually run against it and failed this way is **[Suspected]**, since no run log exists.
- **The next blocker after dedupe:** `leavebalances_tenantId_userId_key` (1 duplicate group). Other unique keys haven't been checked yet (P4).
- **Master DB also behind schema [Measured] / cause [Unverified]:** `hrms-dev.users` lacks `users_tenantId_employeeStatus_idx`, which the schema declares. The master is pushed separately (`pnpm db:push`), so this is a separate gap.

### 3.2 Declared vs actual (summary; full per-index detail in `index-differences.csv`)

|                                                                                        |                                 Count |
| -------------------------------------------------------------------------------------- | ------------------------------------: |
| Indexes declared in the schema (excluding `_id`)                                       |                                   122 |
| Tenant-DB indexes confirmed **missing** in `hrms-acme-corp` (15 collections inspected) |                                    24 |
| Tenant-DB indexes **expected missing** (after the failure point) but not yet verified  |                                    68 |
| Expected or confirmed present                                                          |                                     4 |
| Master-collection indexes                                                              | 26 (one confirmed missing on `users`) |

For each index the CSV records:

- the query it supports;
- whether those queries pass `tenantId` (from code);
- whether the DB is already tenant-isolated;
- uniqueness vs performance purpose;
- whether existing duplicates block it;
- a recommendation.

**Key design point [Code]:** in a database-per-tenant layout `tenantId` is constant within the DB. A `[tenantId, x]` index:

- still enforces uniqueness correctly, so the declared unique keys should be kept;
- serves queries that pass `tenantId` (approval-engine steps, `tenant_settings`, `leavebalances`, performance-review-service);
- **can't serve range or sort for queries that omit it.** Those include `auditlogs` (timestamp), `notification_recipients` (userId), `leaves` and `attendance_records` from the dashboard, and `teams` (teamLeaderId).

For those, the plan adds same-keys-minus-`tenantId` indexes (§3.3, step 6).

**Write overhead:** each index adds one B-tree update per insert or update to that collection. At current write rates (hundreds of rows per day, mostly `auditlogs`, `attendance_records` and `notification_recipients`), that's negligible. Storage is a few hundred KB per tenant at most. **[Suspected]**, based on current sizes.

### 3.3 Safe sequence (non-production first; nothing run)

1. **Snapshot:** restore the latest Atlas backup of `hrms-acme-corp` (and `hrms-dev`, `hrms-appinventiv`) into a staging cluster or local container.
2. **Inventory:** run the P3 and P4 queries on staging, then confirm they match production (read-only).
3. **Dedupe on staging** using §2.4; re-run the duplicate scan for _every_ declared unique key until zero.
4. **Dry-run the push:** `prisma db push --skip-generate` against the staging copy; capture the index list; diff it against `index-differences.csv`.
5. **Fix the fan-out script:** make `push-to-all-tenants.ts` print a final per-tenant summary and fail loudly. Optionally replace `db push` for indexes with explicit `createIndexes` calls per index, so one failure doesn't block the rest. This is a code change for later approval.
6. **Schema change:** add the database-per-tenant performance indexes (`auditlogs {timestamp:-1,_id:-1}`, `{entityType:1,timestamp:-1}`, `{username:1,timestamp:-1}`; `notification_recipients {userId:1,isCleared:1}`; `leaves {status:1,from:1,to:1}`; `attendance_records {date:1}`; `teams {teamLeaderId:1}`; `performance_reviews {reviewerId:1,status:1}`), so a future `db push` doesn't remove manually built indexes. Validate on staging with `explain` (expect IXSCAN, `totalDocsExamined ≈ nReturned`).
7. **Measure on staging:** the endpoint probe set from `docs/performance/tooling/` against a gateway pointed at staging.
8. **Production (separate explicit approval):** off-peak, after the production dedupe is approved and applied:
   - run `pnpm db:migrate` with the fixed script (or build indexes one by one; MongoDB 8 builds are online);
   - verify with `listIndexes`;
   - **rollback** = `dropIndex` by name (non-destructive to data).

### 3.4 Prepared read-only queries (P3/P4, to run after P0)

- **P3:** `listIndexes` for every collection in `hrms-acme-corp`, `hrms-praesto` and `hrms-dev` (about 220 metadata calls), written into `index-differences.csv`.
- **P4:** for each declared unique key, `[{ $group: { _id: { <key fields> }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: "dups" }]` on the tenant DBs. These are small collections, so bounded scans; only counts are returned.

## 4. Phase 4: audit-log remediation plan

### 4.1 Current design **[Code]**

| Part                   | Where                                                                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writer (tenant models) | `packages/database/src/auditMiddleware.ts attachAuditLogging` (Prisma `$use` on every tenant client)       | Every create/update/upsert/delete on every model except `AuditLog`, `LoginEvent`, `Notification` and `NotificationRecipient` (`SKIP_MODELS`). For update/upsert/delete it **first runs a `findUnique` to snapshot "before"**, an extra round trip on every mutation. Then it writes `oldValue`/`newValue`, the **full redacted record**, plus actor, IP and user agent. Fire-and-forget. |
| Writer (master `User`) | `attachMasterAuditLogging`                                                                                 | Same, written into the user's tenant DB                                                                                                                                                                                                                                                                                                                                                  |
| Writer (auth events)   | `apps/api-gateway/src/middleware/auditLog.ts`                                                              | `action: "AUTH"`, `entityType: "auth"`, no snapshots                                                                                                                                                                                                                                                                                                                                     |
| Writer (MCP)           | `apps/api-gateway/src/mcp/audit.ts`                                                                        | MCP connection events                                                                                                                                                                                                                                                                                                                                                                    |
| Redaction              | `SENSITIVE_FIELDS` + `SENSITIVE_PATTERN` (password, secret, token, hash, OTP, credential, recovery code …) | **Not redacted:** `resume`, `coverLetter`, `aadharNo` (camelCase), applicant `data`, contact fields                                                                                                                                                                                                                                                                                      |
| Reader                 | `apps/api-gateway/src/handlers/general.ts getAuditLogs` → `apps/web/src/features/audit/AuditLog.tsx`       | Up to 200 full rows; the web list shows action, area, person, device and time; **`oldValue`/`newValue` are shown only in the detail sheet for one selected row**                                                                                                                                                                                                                         |
| Exports                | none found                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                        |
| Retention              | **none** (no TTL index, no pruning job)                                                                    | Grows indefinitely                                                                                                                                                                                                                                                                                                                                                                       |

### 4.2 Change A: exclude routine `WalkthroughProgress` updates _(product and compliance decision)_

- **Root cause:** each tour step saves through `PUT /walkthrough/progress` → `walkthroughProgress.upsert`, which the middleware audits with full before/after JSON state. **[Code]**
- **Evidence:** 304 of 379 audit rows in 7 days; 1.33 MB; all created on the walkthrough's launch day. **[Measured]**
- **Fix:** add `WalkthroughProgress` to `SKIP_MODELS`. This also removes the extra before-snapshot read on each save. An alternative, if any trace is wanted: log the action without diffs (a `NO_DIFF_MODELS` set, as already done for `updateMany`). The same question applies to `DashboardPreference` (34 rows / 111 KB in 7 days).
- **Benefit (estimate):** about 80% fewer new audit rows and bytes at current usage; one fewer DB round trip per tour save.
- **Risk:** no audit trail of tour progress. Tour progress isn't business data, but confirm against your audit policy.
- **Tests:** unit test that a `walkthroughProgress.upsert` through an audited client writes no audit row while a `leaveApplication.update` still does.
- **Rollback:** remove it from the set.
- **Production approval:** needed only for deploy.

### 4.3 Change B: keep resumes and other bulky or sensitive values out of future snapshots

- **Root cause:** snapshots store whole records; the redaction list misses `aadharNo`, `resume` and other large free-text fields. **[Code]**
- **Fix:**
  1. Add `aadharNo` (and a case-insensitive `aadhaar|aadhar` pattern) to the sensitive set.
  2. Add an **omit-if-large rule**: any string or JSON value over 2 KB in a snapshot is replaced by `{ "omitted": true, "bytes": N, "sha256": "<hex>" }`. The hash lets an auditor prove a later copy matches without storing it.
  3. For `resume` and `coverLetter`, always store a reference or hash only.
  4. Optionally store only the **changed fields** for UPDATE rows (a diff) rather than two full copies; current rows show old and new nearly identical in size.
- **Benefit (estimate):** future snapshot bytes shrink by an order of magnitude for large records; removes clear-text government ID from the audit trail.
- **Risk:** less detail in the diff view for large fields (the UI shows "changed, N bytes"). Diff-only storage changes the detail sheet (it already renders before/after).
- **Tests:** `redactAuditValue` unit tests for `aadharNo`, 3 KB strings and nested JSON; snapshot round trip.
- **Rollback:** revert the code; already written rows are unaffected.

### 4.4 Change C: paginated list without snapshots

- **Fix:**
  - `GET /audit-logs?days&entityType&userName&cursor&limit=50` selects `id, action, entityType, username, description, ipAddress, timestamp`, plus a parsed device field instead of the raw user agent, sorted by `(timestamp desc, _id desc)` with keyset `cursor`.
  - New `GET /audit-logs/:id` returns the redacted `oldValue`/`newValue` for the detail sheet, with the same `requirePrivileged` guard.
  - Pair with index `{ timestamp: -1, _id: -1 }` (§3.3, step 6).
  - Keyset is stable because rows are append-only.
- **Benefit (estimate):** about 958 KB → about 15–25 KB per page; the measured ~320 ms of transfer and serialisation shrinks to tens of ms. `/audit-logs` ~430 → ~120–150 ms.
- **Risk:** UI change (infinite scroll or "load more"; detail fetch on click).
- **Tests:** API tests for cursor continuity (no gaps or duplicates when new rows arrive between pages), role guard on `/:id`, and projection (list rows carry no `oldValue`); Playwright check of the detail sheet.
- **Rollback:** the old endpoint shape can be kept behind `?full=1` during transition.

### 4.5 Change D: keep useful metadata and business history

- Keep `action`, `entityType`, entity ID (add `entityId` as a new field, set from the record ID), actor, IP, timestamp and description for **every** audited model.
- Keep full diffs for HR- and finance-relevant models (salary structures, payroll line items, leave, attendance corrections, resignations, users) subject to Change B's size and sensitivity rules.
- Add a retention policy decision: for example, keep full diffs for N months, then strip `oldValue`/`newValue` while keeping metadata. This is a compliance decision.

### 4.6 Change E: existing sensitive snapshots (separately reviewed and reversible)

**Affected volume** (sizes from aggregation; no content read):

| Set                                           | Rows |                                                                      Bytes | Label                                                                  |
| --------------------------------------------- | ---: | -------------------------------------------------------------------------: | ---------------------------------------------------------------------- |
| `JobApplication` audit rows (Mar–Jul 2026)    |   58 | 11.1 MB (largest row 209 KB, with `resume` ~103 KB in each of old and new) | **[Measured]** earlier today                                           |
| `WalkthroughProgress` audit rows              |  304 |                                                                    1.33 MB | **[Measured]** earlier today                                           |
| Rows containing a clear-text `aadharNo` value |    ? |                                                                          ? | **[Unverified]**: P5 counts only (`$exists` / non-empty), never values |
| Other rows with any snapshot field > 2 KB     |    ? |                                                                          ? | **[Unverified]**: P5                                                   |

**Procedure (staging first, then production after approval):**

1. Read-only dry run that lists affected row IDs and byte counts only.
2. Export the affected rows to an **encrypted offline archive**, with access limited to the DPO or owner, because audit integrity may require producing originals.
3. In place, per row: replace large or sensitive values with `{ omitted: true, bytes, sha256 }`, record `redactedAt` and `redactionReason` on the row, and leave metadata untouched. For `WalkthroughProgress` rows, policy may allow deletion; that's your call.
4. Verify counts and sizes after the change.
5. **Rollback:** restore the affected rows from the archive by `_id`.

**Benefit (estimate):** `hrms-acme-corp` shrinks from about 16.8 MB to about 5 MB; every audit-log scan reads about 75% less; candidate resumes stop sitting in a second store.

## 5. Phase 5: application performance changes

All are **[Code]** traces. Round trip ≈ 43.5 ms **[Measured]**. Savings are **estimates** using that figure.

| Endpoint                                                                                    | Redundant or serial work                                                                                                                                                                                                        | Proposed change                                                                                                                                                                                                                             | Est. saving                                                                | Pool impact                                                                                                                            | Authorisation, tenant isolation and behaviour                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/approvals/pending-all` (236 ms)                                                           | `approval-engine getPendingApprovalsFor` loads `approvalInstance` (status pending), then `approvalChains.ts getPendingApprovalItems` (L432) **fetches the same IDs again** for `requestedBy`                                    | Return the needed instance fields (`requestedBy`, `createdAt`, `module`, `entityId`, `currentStep`) from the engine; drop the second fetch                                                                                                  | −1 round (~43 ms, ~18%)                                                    | −1 query                                                                                                                               | Unchanged; the same filters (`resolvedApproverId = caller`, `currentStep = step`) apply                             |
| `/get-org-chart` (270 ms)                                                                   | `resolveUserNames` (`permissions.ts` L407) re-fetches users that the same handler already loaded as `activeUsers` in round 1                                                                                                    | Build the map from `activeUsers`; query only IDs not in it (inactive members), and skip the query if there are none                                                                                                                         | −1 round (~43 ms, ~16%)                                                    | −1 query                                                                                                                               | Unchanged; the same tenant-scoped `user` model                                                                      |
| `/dashboard/data` (508 ms)                                                                  | `resolveCaller` → `loadLayout` serial (only `teams` feeds layout options); both repeated by `/dashboard` and by each of the 2 `/dashboard/data` calls; `getActiveSettings` and the active-user count fetched by several loaders | (a) run `teams` + `dashboardPreference` + departments in one parallel round; (b) memoise per request (`getActiveSettings`, active-user count, holidays by year); (c) optionally cache org-wide widget results (§6 of the MongoDB audit, D7) | (a) −1 round (~43 ms); (b) −3–5 queries; (c) most DB work on repeat loads  | (a)/(b) **lower** peak concurrency; still ~40 concurrent queries per call against `maxPoolSize=50`, so don't add more parallelism here | Capability checks unchanged; caching keyed by `tenantId` + widget + settings hash, checked **after** `isAuthorized` |
| Leave balance (`GetLeaveBalance`, 266 ms median; used by `/dashboard/data` and Apply Leave) | `leaveBalance.findFirst` → `getLeaveSettings` → `compOffCredit.findMany` run serially (`leave-service/handlers/getLeaveBalance.ts` L91–96, L59–66)                                                                              | Run all three in one `Promise.all` (the comp-off query is cheap; ignore its result if no comp-off type is configured)                                                                                                                       | −2 rounds inside the RPC (~87 ms); likely the largest single dashboard win | +1 concurrent query at most                                                                                                            | Unchanged; all three already filter by `tenantId` and `userId`                                                      |
| `/audit-logs` (430 ms)                                                                      | 200 full rows; 92% snapshot bytes                                                                                                                                                                                               | Change C (§4.4)                                                                                                                                                                                                                             | ~280–300 ms (estimate)                                                     | —                                                                                                                                      | `requirePrivileged` kept on both list and detail                                                                    |
| `/performance-reviews` (260 ms; 4 parallel calls per page)                                  | Unbounded `findMany` when `limit` is absent (`performance-review-service/handlers/listReviews.ts` L63–70)                                                                                                                       | Default `take: 50` with `page`; the web passes it explicitly                                                                                                                                                                                | Bounded payload; small today                                               | —                                                                                                                                      | Unchanged                                                                                                           |

**Ranking** (benefit ÷ risk, and how easily it can be measured with the existing probe tooling):

1. `GetLeaveBalance` parallelisation (biggest round-trip cut, smallest diff, measurable via the gRPC duration log).
2. `/audit-logs` slimming (largest absolute win; needs a UI change).
3. pending-all duplicate fetch.
4. org-chart re-fetch.
5. dashboard caller/layout round.
6. performance-reviews default `take`.

## 6. Change register

| ID  | Change                                                               | Root cause                                                           | Evidence            | Fix                                                                                                      | Expected benefit                                                                        | Risk                             | Validation and regression tests                                                                             | Rollback               | Prod approval                 |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------- |
| R1  | Restart the MCP; verify read-only                                    | Config applied only at process start                                 | §0 **[Measured]**   | Restart Claude Code or the MCP                                                                           | Unblocks P1–P5 safely                                                                   | none                             | Write tools absent; `preconfigured` is the Atlas host                                                       | n/a                    | No                            |
| R2  | Attendance duplicate review (P2)                                     | Check-then-insert writes without the unique index                    | §1 #1, §2           | Read-only extraction → CSV + per-group proposal                                                          | Decision-ready list for HR                                                              | none (read-only)                 | Totals match P1 (583 groups, 1,166 docs)                                                                    | n/a                    | No (read-only)                |
| R3  | Attendance dedupe                                                    | as R2                                                                | §2                  | §2.4 transactional merge with archive                                                                    | Restores integrity; unblocks indexes                                                    | Pay history for disbursed months | Staging dry run; zero duplicates after; break counts preserved; payroll totals unchanged for disbursed runs | Re-insert from archive | **Yes**                       |
| R4  | Fix the migration fan-out                                            | `db push` aborts on the first failed index; failure buried in output | §3.1 **[Measured]** | Per-tenant summary, non-zero exit, optional per-index `createIndexes`                                    | Failures visible; partial progress                                                      | Low                              | Run against local repro DBs (clean, dup) → clear report                                                     | Revert script          | No (tooling)                  |
| R5  | Database-per-tenant index set + schema alignment                     | Declared indexes lead with `tenantId`, which queries omit            | §3.2 **[Code]**     | §3.3 step 6                                                                                              | IXSCAN for `auditlogs`, notifications, leaves, attendance, teams; cold-cache protection | Low write overhead               | `explain` on staging: IXSCAN, docs examined ≈ returned; probe latency                                       | `dropIndex`            | **Yes**                       |
| R6  | Apply missing indexes to `hrms-acme-corp` (+ the master `users` gap) | Failed migration                                                     | §3.1                | §3.3 step 8 after R3                                                                                     | Integrity (unique keys) + R5                                                            | Build load (small collections)   | `listIndexes` diff = empty                                                                                  | `dropIndex`            | **Yes**                       |
| R7  | Skip `WalkthroughProgress` auditing                                  | Audit middleware audits all models                                   | §4.2 **[Measured]** | `SKIP_MODELS` (or no-diff)                                                                               | ~80% fewer new audit rows; −1 read per tour save                                        | Policy                           | Unit test (§4.2)                                                                                            | Revert                 | Deploy only (policy decision) |
| R8  | Snapshot size and sensitivity rules                                  | Whole-record snapshots; `aadharNo` gap                               | §4.3 **[Code]**     | Redaction + omit-if-large + diff-only                                                                    | Future rows ≪ 1 KB typical; no clear-text Aadhaar                                       | Less detail for big fields       | Redaction unit tests                                                                                        | Revert                 | Deploy only                   |
| R9  | Paginated audit list + detail endpoint                               | 200 full rows per request                                            | §4.4 **[Measured]** | Keyset `limit=50`, projection, `/audit-logs/:id`                                                         | ~430 → ~120–150 ms (estimate)                                                           | UI change                        | API cursor tests; Playwright detail sheet; probe latency                                                    | `?full=1` fallback     | Deploy only                   |
| R10 | Existing sensitive and bloated snapshots                             | Legacy inline resumes; routine-model noise                           | §4.6                | Archive, then redact in place (or delete per policy)                                                     | DB ~16.8 → ~5 MB; ~75% less scanned per audit query                                     | Audit integrity                  | Staging dry run; counts and bytes before and after                                                          | Restore from archive   | **Yes**                       |
| R11 | `GetLeaveBalance` parallel                                           | Serial independent queries                                           | §5 **[Code]**       | `Promise.all`                                                                                            | ~−87 ms per RPC (estimate)                                                              | Low                              | leave-service unit tests; gRPC duration log before and after                                                | Revert                 | Deploy only                   |
| R12 | pending-all duplicate fetch                                          | Engine and gateway both fetch instances                              | §5 **[Code]**       | Engine returns fields                                                                                    | ~−43 ms                                                                                 | Low                              | Approval-chain tests (existing `approvalChains.test.ts`) + probe                                            | Revert                 | Deploy only                   |
| R13 | Org-chart re-fetch                                                   | `resolveUserNames` ignores loaded users                              | §5 **[Code]**       | Reuse map                                                                                                | ~−43 ms                                                                                 | Low                              | Snapshot test of org-chart output                                                                           | Revert                 | Deploy only                   |
| R14 | Dashboard caller/layout round + memoisation                          | Serial + repeated reads                                              | §5 **[Code]**       | Parallel round + per-request memo                                                                        | ~−43 ms + fewer queries                                                                 | Low                              | `dashboardHandlers.test.ts` + probe                                                                         | Revert                 | Deploy only                   |
| R15 | Reconcile job relies on missing unique index                         | `skipDuplicates` needs a unique index                                | §1 #9 **[Code]**    | Until R6: pre-filter existing `(userId, date)` before `createMany`; after R6, behaviour is correct as is | Prevents new duplicates                                                                 | Low                              | Scheduler test with an existing row                                                                         | Revert                 | Deploy only                   |
| R16 | Query instrumentation (MongoDB audit §18)                            | No query timing anywhere                                             | MongoDB audit §7    | Prisma `$extends` timing per request                                                                     | Measured, not modelled                                                                  | Must not log `args`              | Unit test: no `args` in log output                                                                          | Feature flag off       | Deploy only                   |

## 7. Highest-priority next actions

1. **R1: restart Claude Code** so read-only mode loads. Then I run P1–P5 (read-only) and produce `attendance-duplicate-review.csv`, the complete live index inventory, and the audit-volume counts.
2. **R16 + R11 + R12 + R13:** small, low-risk code changes, measurable with the existing tooling. They need deploy approval only.
3. **R7 + R8 + R9:** audit-log policy and shape. R7 is your policy call; R9 is the largest single endpoint win.
4. **R3 → R4 → R5/R6:** dedupe on staging, fix the migration script, then indexes. All production steps need your explicit approval.
5. **R10:** existing-snapshot remediation, after a retention policy decision.

## 8. Decisions that need your approval

| Decision                                                 | Options                                        | Notes                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Restart Claude Code (R1)                                 | —                                              | Required before any further production DB inspection                                       |
| Attendance dedupe (R3)                                   | approve the procedure after reviewing P2's CSV | Some groups will need HR review; disbursed payroll months need a policy (correct or leave) |
| Audit `WalkthroughProgress` / `DashboardPreference` (R7) | skip entirely, or log without diffs            | Compliance owner                                                                           |
| Snapshot policy for large and sensitive fields (R8)      | omit-if-large threshold; diff-only storage     | Affects what auditors can see later                                                        |
| Existing resume snapshots (R10)                          | redact in place with an archive, or keep       | Data-minimisation vs audit integrity                                                       |
| Audit retention (§4.5)                                   | e.g. strip diffs after N months                | Compliance                                                                                 |
| Production index builds and migration (R5/R6)            | after R3 and staging validation                | Off-peak window                                                                            |
| Staging environment                                      | Atlas backup restore vs local container        | Needed for R3–R6, R10                                                                      |

## 9. Executed remediation (2026-11-01, authorised by the owner)

Every write below went to the **shared** Atlas cluster, which serves both dev and production.

- **Process:** a recoverable backup was taken first. Changes were applied by exact `_id` from a manifest, and the apply step refused to run if the live scope differed from the manifest.
- **Reporting:** all output was counts only. No credentials, Aadhaar numbers, resume contents or raw identifiers were printed or written to the repo.

### 9.1 Scope recomputed (the earlier manifest was stale)

The earlier 583-group manifest covered only the duplicated subset. A recount using the established seed evidence found a larger footprint, so the scope was recomputed rather than applying the old manifest. The evidence used:

- **Creation window:** ObjectId timestamps from 2026-07-09 15:30 to 16:40 UTC.
- **Attendance signature:** `workingHours = 8`, `timeOut` set, status Present/Late/WFH, date before 2026-07-09 IST.
- **Leave signature:** Approved, 1 day, `from = to = appliedOn = approvedOn`.

**Every** record created in the window matched the signature, so no non-matching (possibly legitimate) record was in scope.

| Database         | Attendance removed                            | Leaves removed | Leave-balance rows removed | Ledger rows repaired |
| ---------------- | --------------------------------------------- | -------------- | -------------------------- | -------------------- |
| hrms-acme-corp   | 5,120 (101 employees, 2026-05-01 → 07-08 IST) | 564            | 1 (duplicate)              | 98 (2 were hybrids)  |
| hrms-appinventiv | 375 (11 employees)                            | 33             | 1 (duplicate)              | 10                   |

**Counts after cleanup:**

- acme: attendance 6,821 → 1,701; leaves 1,495 → 931; leave balances 108 → 107.
- appinventiv: attendance 375 → 0; leaves 33 → 0; leave balances 12 → 11.

**Verification:** no duplicate attendance groups or duplicate balance users remain, and no record still matches the seed signature.

### 9.2 Ledger reconstruction rule

- For each employee covered by the seed, the monthly ledger entries for May–July 2026 were removed **only where they exactly matched seed-derived values**: `earnedPL = 1`, `usedLWP = 0`, and `usedPL` equal to that employee's seed PL leaves in that month.
- Where the scheduler had already carried such a month forward (`remainingPL = 0`), `accumulatedPLBeforeCurrentMonth` was reduced by the synthetic remainder `max(0, 1 − seedPL)`. Totals: acme −110 PL, appinventiv −13 PL. No value went negative.
- **27 (acme) and 16 (appinventiv) seed-month entries did not match exactly and were kept** for review.
- Where an employee had two rows, the earliest row was kept.
- Hybrid rows (`{"0": {...}, PL: n}`) were rewritten as arrays.

### 9.3 Left in place deliberately (owner decision needed)

- **appinventiv demo organisation data:** created entirely by the seed on 2026-07-09 15:45–15:46 UTC, though the tenant itself (2026-05-23) is genuine. It covers departments 4, designations 9, branches 1, shifts 1, salary structures 33, a payroll run with 10 line items, 8 assets and assignments, 5 job openings, 18 applications, and 5 HR activities. Removing it is a product decision.
- **Master `tenant_memberships`:** 40 rows created 15:45–15:47. A missing master user is common across all dates, so these can't be identified as orphans by that alone. Not touched.

### 9.4 Backup and recovery

- **Location:** `~/.praesto-backups/2026-11-01-seed-cleanup/` (mode 700; files 600). It holds full documents per database and collection plus `*.plan.json`, and its SHA-256 checksums were verified after the copy.
- **Restore:** insert the documents back with `$runCommandRaw({ insert, documents })` in batches of 500, then `$set` each repaired leave-balance row from its backed-up `balances` and `accumulatedPLBeforeCurrentMonth`.
- The unique index on `attendance_records` now rejects re-inserting a duplicate. Restore only into a scope that was removed.

### 9.5 Applicant PII (backlog D12) — executed

- **Scope (re-verified):** 4 applications holding a clear-text Aadhaar number (3 with inline base64 resumes); 61 audit rows (57 `JobApplication` with Aadhaar, 56 of them with resumes; 4 `ApplicationDraft` with form data).
- **Backup:** `~/.praesto-backups/2026-11-01-applicant-pii/applicant-pii.tar.enc` (AES-256, PBKDF2). The key is in the macOS Keychain (`praesto-pii-backup-2026-11-01`). Decryption was verified by a checksum round trip, then the plaintext was deleted from both the host and the container.
- **Applied:**
  - 3 resumes uploaded to the private bucket under the current convention `job_applications/{tenantId}/{uuid}.pdf`; each object's size was verified before its record was updated.
  - `aadharNo` set to `null` on all 4 applications.
  - The 61 audit rows rewritten in place (Aadhaar → `[REDACTED]`, resume → `[OMITTED: N bytes]`, draft data → `[OMITTED]`) with raw commands, so no new audit rows were created.
- **Verification (counts):** applications with PII 0; audit rows with PII 0; inline resumes 0.
- **Rollback:** decrypt the archive and replace the documents by `_id`. The S3 objects stay in place.

### 9.6 Leave-balance code fixed (backlog D16)

- `ensureTrackedBalance` no longer spreads an array ledger into a flat map (that spread was the source of the hybrids). Ledger rows stay "untracked" for the flat-map quota (fail-open, as before).
- `reconcileAttendance` reads hybrids through `ledgerEntries()` instead of crashing.
- Balance readers use `orderBy: { id: "asc" }`.
- Tests were added in both services.
