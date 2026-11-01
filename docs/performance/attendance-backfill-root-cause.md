# Attendance Backfill Incident: Root Cause (2026-07-09 22:00 IST)

**Status:** investigation complete · **Data changed:** none · **Evidence labels:**

- **[Measured]**: read-only production query in this session (read-only MCP verified; counts and sanitised metadata only)
- **[Code]**: repository or git inspection
- **[Local repro]**: reproduced against throwaway databases in the local Docker MongoDB, not production
- **[Suspected]**: strongly suspected
- **[Unverified]**: not verified

## 1. Summary

The 583 duplicate attendance groups were written by the **`db:seed` demo-data script** (`packages/database/src/seed.ts` → `seedRunner.ts`). It was **run twice concurrently against the production database** on 2026-07-09 between 22:00:19 and 22:01:40 IST.

The script existed in the repository only from commit `a34c87e` (2026-07-10 00:44 IST, committed about 2.7 hours _after_ the writes, so it was being developed when it ran) until commit `98fa794` (2026-07-11), which deleted it. **Confidence: high.**

The data matches the script on every distinctive field (§3) [Measured + Code]. _Who_ launched the two concurrent runs, and how, can't be established: the logs that would show it no longer exist (§5).

Three defects combined:

1. **The "local dev only" guard checked the wrong thing [Code].** `seed.ts` refused to run unless `CLIENT_URL` started with `https://localhost`. Local dev _does_ have that `CLIENT_URL`, but its secrets point at **the same Atlas cluster as production**, so the guard passed and the seed wrote production data.
2. **The seed's idempotency check was check-then-write with no constraint behind it [Code].**
   - Per employee, it read `leaveBalance.balances` to see which months were "already seeded".
   - It then inserted every attendance and leave row for the missing months.
   - Only **after that** did it write the month markers.
   - Two concurrent runs both saw "nothing seeded yet" for any employee whose markers the other run hadn't written yet, so both inserted.
3. **No unique index on `attendance_records (tenantId, userId, date)` in `hrms-acme-corp` [Measured].** The schema declares it, but it was never built, because `prisma db push` fails on existing duplicates [Local repro] (see `database-remediation-plan.md` §3). With the index, the second insert would have failed instead of duplicating.

## 2. Code paths that create or update historical attendance

| Entry point                                                                                                                                                      | Trigger                                                        | Selects employees / dates                                                                                                                                                                         | Duplicate protection                                                                     | Concurrency exposure                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`packages/database/src/seed.ts` → `seedRunner.ts` `runSeed` → `seedTenant` → `seedAttendanceAndLeaveForEmployee`** (existed `a34c87e`..`98fa794`; now deleted) | Manual `pnpm db:seed` (root: `turbo run db:seed`, so one task) | Every tenant with `isActive`; every user of the tenant; weekdays of the last 2 full months plus the current month through yesterday (`targetPayrollMonths`, `weekdaysInMonth`), in **local time** | Check-then-write on `leaveBalance.balances` month markers, written **after** the inserts | Two concurrent invocations duplicate any employee in progress in both. **This is the incident** [Measured + Code]                                                                                                                                               |
| `apps/scheduler-service/src/jobs/seedDailyAttendance.ts` (same commit range; deleted)                                                                            | Cron `0 23 * * *`, dev-guarded by the same `CLIENT_URL` check  | Active users; **today only**; no `timeOut`                                                                                                                                                        | `findFirst` existing, then `create`                                                      | Ruled out for this incident: duplicates span two months and all have `timeOut` [Measured]                                                                                                                                                                       |
| `apps/scheduler-service/src/jobs/reconcileAttendance.ts`                                                                                                         | Cron `15 0 * * *` (IST)                                        | Active users; current month to yesterday (or the previous month on the 1st); missing days only                                                                                                    | Reads existing records, then `createMany({ skipDuplicates: true })`                      | **`skipDuplicates` only skips rows that violate a unique index.** In `hrms-acme-corp` there is none, so concurrent runs can duplicate Holiday/Week Off/Leave rows [Code + Measured: index missing]. Not the source of this incident (its rows have no `timeIn`) |
| `apps/attendance-service/src/handlers/markAttendance.ts`                                                                                                         | Punch in/out                                                   | One user, today                                                                                                                                                                                   | `findFirst` then `create`                                                                | Double-submit race possible without the unique index [Code]                                                                                                                                                                                                     |
| `apps/attendance-service/src/handlers/correctAttendance.ts`                                                                                                      | HR correction                                                  | One user-date                                                                                                                                                                                     | `findFirst` then `create`                                                                | Same [Code]                                                                                                                                                                                                                                                     |
| `apps/api-gateway/src/handlers/approvalChains.ts` (~L650)                                                                                                        | Approved WFH/leave sync                                        | One user-date                                                                                                                                                                                     | `upsert` keyed by the compound unique                                                    | Prisma's MongoDB upsert is find-then-write; it's atomic only with the unique index [Code]                                                                                                                                                                       |

**Transactions:** none of these wrap their check and write in a transaction. On MongoDB, a transaction alone wouldn't stop two concurrent inserts of different documents. Only a unique index, or a single atomic claim, does.

## 3. Evidence: the seed is the writer

| Seed behaviour (`seedRunner.ts` @ `a34c87e`)                                                                                          | Production observation                                                                                                                                                                              | Label                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Months = last 2 full months plus current through yesterday. Run on 2026-07-09: **May 1 → July 8**                                     | Duplicate dates (IST) **2026-05-01 → 2026-07-08**                                                                                                                                                   | Measured + Code                                                                                            |
| Weekdays only; status ∈ {Present, Late, WFH}; `workingHours: 8`; `timeIn` 09:00–09:45 or 10:00–10:45; `timeOut` 18:00–18:45 (`faker`) | All 2,049 records created in the window have `timeOut` set and `workingHours = 8`; statuses are exactly Present/Late/WFH; within a pair `timeIn` differs by more than 1 minute in 546 of 583 groups | Measured                                                                                                   |
| `new Date(year, month-1, day)` in local time (IST host)                                                                               | Dates stored as 18:30 UTC, i.e. IST midnight                                                                                                                                                        | Measured                                                                                                   |
| ~10% of days become an approved `leaveApplication` (PL/SL/CL) instead of attendance                                                   | **243** approved leave applications created in the same window (May 101, June 109, July 33; 130 PL); 7 employee-days got two                                                                        | Measured                                                                                                   |
| `leaveBalance.create` with `accumulatedPLBeforeCurrentMonth: faker 0–8` when no row exists, **after** the employee's inserts          | The duplicate `leavebalances` pair was created 2 s apart at the **end** of the window (16:31:38/40 UTC); the copies started with different accumulated PL (1 vs 6)                                  | Measured                                                                                                   |
| Runs employees sequentially; markers are written per employee at the end                                                              | **32** employees got seeded attendance; **15** were duplicated, 17 got a single copy. That fits two runs a few seconds apart overlapping on some employees and not others                           | Measured (interpretation: Suspected)                                                                       |
| Inserts through `prismaWithTenant` (audited client)…                                                                                  | …yet **no audit rows exist for 16:00–17:00 UTC that day**                                                                                                                                           | Measured. Why the writes weren't audited is unverified (the audit middleware's writes are fire-and-forget) |
| Commit timing                                                                                                                         | Writes at 22:00 IST on 07-09; script first committed 00:44 IST on 07-10; deleted 07-11                                                                                                              | Code                                                                                                       |

Other writers ruled out: `seedDailyAttendance` (today only, no `timeOut`), `reconcileAttendance` (no `timeIn`, statuses Holiday/Week Off/Leave), the punch and correction handlers (single records, real times).

## 4. How two runs could run concurrently

**[Unverified] which of these happened:**

- two `pnpm db:seed` invocations from two terminals;
- a re-run started while the first was still running (it takes about 80 s);
- an editor or task-runner re-trigger.

`turbo run db:seed` itself runs the task once (only `@hrms/db` defines it) [Code]. The interleaving of the two copies within each second (§3 of `database-verification-2026-11-01.md`) shows the runs were **simultaneous**, not sequential.

## 5. Logs

| Source                                | Covers 2026-07-09?          | Finding                                                                                                                                                                                          |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CloudWatch `/hrms/*/dev` (ap-south-1) | **No.** Retention is 7 days | These groups hold the **local** Docker stack's logs (verified: the 2026-10-31 accrual run appears there with stream `app`) [Measured]                                                            |
| Production containers (EC2)           | **No**                      | The production gateway lacks `logs:DescribeLogStreams`, so production logs never reach CloudWatch; Docker logs on the host are rotated, and the instance was replaced on 2026-10-28 [Code/notes] |
| Local Loki/Grafana                    | **No**                      | Loki container up for 3 days; no long retention                                                                                                                                                  |
| Audit log                             | **No**                      | No rows in the window [Measured]                                                                                                                                                                 |
| Git                                   | Partial                     | Establishes the script and its timing (§3) [Code]                                                                                                                                                |

To identify the exact invocation, you'd need shell history from the machine that ran it, or terminal/IDE logs from that evening. **It can't be done from production data.**

## 6. Related live risk found during this investigation

**Every scheduler that can reach the database runs every cron job [Measured].**

- The local Docker `scheduler-service` (separate Redis, same Atlas data) executed **`updateLeaveBalance` against production at 2026-10-31 19:00 UTC**: "updated 118 leave balance records across 4 tenants".
- Production's scheduler uses the same image, the same `TZ=Asia/Kolkata` and the same cron, so it would fire at the same moment.
- `updateLeaveBalance` has no once-per-month marker [Code].
- Whether production _also_ ran it that night, accruing twice, is **[Unverified]**: production host logs are only reachable via SSM, which needs your approval.
- The same local scheduler also ran `reconcileAttendance` at 18:45 UTC and failed for all 104 employees (`balances.find is not a function`, the leave-balance shape bug in `leave-balance-reconciliation.md`).

## 7. Prevention (development changes made; not deployed)

| Mechanism                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **One run per period across all schedulers** | `apps/scheduler-service/src/utils/jobLease.ts` + `worker.ts`. Every cron run first claims a lease document in the master DB with a deterministic `_id`: `updateLeaveBalance:<YYYY-MM>`, `reconcileAttendance:<YYYY-MM-DD>`, otherwise `<job>:<fire minute>`. MongoDB's unique `_id` makes the claim atomic, so no new index is needed. A second claimant skips; `failed` or stale (> 2 h) leases can be retried; outcomes are recorded | Implemented + tested                                           |
| Idempotent retries                           | `failed` → exactly one retrier wins; `done` → rerun skipped for the period                                                                                                                                                                                                                                                                                                                                                             | Tested                                                         |
| Unique constraint                            | Build `attendance_records_tenantId_userId_date_key` (and the other declared unique keys) after dedupe                                                                                                                                                                                                                                                                                                                                  | Planned (`database-migration-staging-plan.md`); needs approval |
| Seed / backfill guard                        | Any future bulk-data script must check the **database target** (refuse unless the connection's host is local or a named non-production cluster), not `CLIENT_URL`                                                                                                                                                                                                                                                                      | Recommendation (the seed no longer exists)                     |
| Dev isolation                                | Local Docker must not use production's database; at minimum, disable the scheduler in `docker-compose.dev.yml`                                                                                                                                                                                                                                                                                                                         | Recommendation; your decision                                  |
| Accurate reporting                           | Lease documents record `status`, `attempts`, `holder`, `startedAt`/`finishedAt` and the failure detail. Per-row inserted/skipped/failed counts for `reconcileAttendance` are a follow-up (the job currently logs only "processed N, errors M")                                                                                                                                                                                         | Partly done                                                    |

**Validation [Local repro, real MongoDB 8 in Docker]:**

| Case                                     | Result                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Duplicate `_id` insert                   | `ok:1` + `writeErrors[0].code = 11000` (not thrown); the implementation handles both shapes    |
| 6 simultaneous claims                    | 1 winner                                                                                       |
| 3 simultaneous retries of a failed lease | 1 winner                                                                                       |
| Lease types                              | fresh-running → skip; stale-running → takeover; done → skip; `startedAt` stored as BSON `date` |

**Automated tests:**

- `apps/scheduler-service/src/__tests__/jobLease.test.ts`: lease IDs (IST month/day/minute boundaries, two schedulers producing the same ID), simultaneous claims, reruns, failed retries, stale takeover, non-duplicate errors surfaced.
- `worker.test.ts`: skip when not leased, mark done, mark failed and rethrow, SLA jobs exempt.
- Scheduler suite: **128/128 pass**. Full backend suite after all changes: **3,039/3,039 tests across 229 suites pass**.

**Rollout requirements:**

1. Deploy the scheduler change to production _before_ re-enabling any local scheduler.
2. The first production run creates `scheduler_job_leases` in the master DB. That's a new collection; confirm it's acceptable.
3. Watch for "Skipping scheduled job" log lines to confirm leases work across instances.
4. Rollback: revert `worker.ts` (lease documents are inert).
