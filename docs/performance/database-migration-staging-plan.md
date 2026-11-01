# Migration and Index Recovery: Staging-First Plan

**Status:** plan only. No production migration, index or data change has been made.

## 0. Verified starting state

| Database            | Indexes vs schema                                                                                         | Blocking duplicates                                                                                                                                                                                                                                              | Label                       |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `hrms-acme-corp`    | 92 declared missing, 4 present (the 16 survivors = the failed-push signature)                             | `attendance_records (tenantId, userId, date)`: **583** groups; `leavebalances (tenantId, userId)`: **1**; 19 other unique keys: 0                                                                                                                                | Measured                    |
| `hrms-appinventiv`  | Same partial pattern (90 indexes / 74 collections)                                                        | `attendance_records`: **95** groups (211 docs; some with 3 copies; 159 from the 2026-07-09 16:30 UTC concurrent seed runs, **52 from an earlier seed run at 15:45 UTC the same evening**); `leavebalances`: **1** (created 16:31:45/46); 19 other unique keys: 0 | **Measured (this session)** |
| `hrms-praesto`      | Complete except `walkthrough_progress` (collection not yet created)                                       | —                                                                                                                                                                                                                                                                | Measured                    |
| `hrms-test`         | 186 indexes; 0 documents                                                                                  | none possible                                                                                                                                                                                                                                                    | Measured                    |
| `hrms-dev` (master) | Missing `users_tenantId_employeeStatus_idx`; other indexes exist (some under `ensureMasterIndexes` names) | `users` unique keys present already                                                                                                                                                                                                                              | Measured                    |

The **migration script reports failure correctly** [verified on local throwaway databases]. `push-to-all-tenants.ts` prints `FAILED: <db>` for the tenant with duplicates, continues with the next tenant, and the **process exits with code 1**. The risk is operational: long output, and nothing in the deploy path runs or checks it.

## 1. Staging sequence

1. **Staging environment.**
   - Restore the latest Atlas backup of `hrms-dev`, `hrms-acme-corp`, `hrms-appinventiv` and `hrms-praesto` into an **isolated** cluster: no production credentials, and no scheduler or app pointing at it except the test harness.
   - **Disable every scheduler that can reach staging**, and deploy the run lease (§4) before any scheduler is enabled.
2. **Scan** every tenant DB for duplicates on all 21 declared tenant unique keys (queries in `database-verification-2026-11-01.md` §5). Expected: the 4 known blocking sets above.
3. **Resolve on staging:**
   - attendance per `attendance-reconciliation-options.md`: remove the seed footprint in `hrms-acme-corp` and the equivalent footprint in `hrms-appinventiv` (needs its own count review, including the 15:45 UTC run);
   - leave balances per `leave-balance-reconciliation.md`, after the shape fix (D16).
4. **Verify** all unique keys have zero duplicates (rerun step 2).
5. **Migrate staging:** `pnpm db:migrate` (per tenant) and `pnpm db:push` (master). **Require exit code 0**, and check that the summary shows no `FAILED:` lines.
6. **Compare** live indexes with the expected inventory: the 122 indexes in `index-differences.csv` plus the master `ensureMasterIndexes` set. The diff must be empty for every DB.
7. **Concurrency test (staging):** run two scheduler instances against the staging DB with the lease enabled.
   - Trigger `reconcileAttendance` and `updateLeaveBalance` simultaneously.
   - Expect one "Running" and one "Skipping scheduled job" per period, and no new duplicates (rerun step 2).
   - Also trigger a deliberate failure: the retry claims the lease once.
8. **Application smoke test on staging:** attendance views, payroll recalculation for June (see the reconciliation options doc), leave balances, audit log list.

## 2. Production rollout (separate approval per step)

| Step | Action                                                                                                              | Verification                                                                                 | Rollback                              |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| P1   | Deploy the code (redaction, scheduler lease)                                                                        | Logs show `Skipping scheduled job` on a second instance; no sensitive values in sampled logs | Revert the image tag                  |
| P2   | Disable the local Docker scheduler, or move local dev to its own DB                                                 | No local job lines in `/hrms/scheduler-service/dev`                                          | Re-enable                             |
| P3   | Archive, then apply the data reconciliation (attendance, leave balances) in `hrms-acme-corp` and `hrms-appinventiv` | Counts match the staging dry run exactly                                                     | Restore from archive by `_id`         |
| P4   | Off-peak `pnpm db:migrate` + master `db:push`                                                                       | Exit 0; `listIndexes` diff empty                                                             | `dropIndex` by name (non-destructive) |
| P5   | Re-run the duplicate scan                                                                                           | 0 for all keys                                                                               | —                                     |

## 3. Index design follow-up (after P4)

The declared indexes lead with `tenantId`, which tenant-DB queries never include (see the MongoDB audit). After the migration, add the database-per-tenant performance indexes (`auditlogs {timestamp:-1,_id:-1}`, `notification_recipients {userId, isCleared}` and so on) **in `schema.prisma`**, so a future `db push` keeps them. Validate them on staging with `explain` first.

## 4. Preconditions met in development

- Scheduler run lease (`apps/scheduler-service/src/utils/jobLease.ts`), with tests and validation against real MongoDB semantics.
- Redaction changes (`applicant-pii-remediation.md`).
- Migration failure semantics verified (exit code 1).
