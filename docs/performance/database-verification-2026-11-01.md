# Production Database Verification (read-only)

**Session:** 2026-10-31 19:12 IST → 2026-11-01 · **Cluster:** `cluster0.ooxsrgq.mongodb.net` (MongoDB 8.0.36) · **Scope:** the five read-only checks P1–P5 defined in [`database-remediation-plan.md` §0](./database-remediation-plan.md#0-status-production-database-inspection-paused)

> Every statement below is either **[Newly verified]**, meaning measured in this session against production under verified read-only mode, or **[Earlier]**, meaning an observation from 2026-10-31 made before read-only mode was enforced. No data, index, configuration or application code was changed. No migration was run. No employee names, Aadhaar numbers, resume content or credentials were read out or written to any file.

## 1. Read-only mode verification

| Requirement                                     | Evidence                                                                                                                                                                                                                                                                                                               | Result       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Process restarted with the flag                 | `mongodb-mcp-server` PID 64960, started 2026-10-31 19:12:25 IST; its environment (credentials masked) contains `MDB_MCP_READ_ONLY=true`                                                                                                                                                                                | **Verified** |
| Connected to the intended cluster               | Same process: `MDB_MCP_CONNECTION_STRING=mongodb+srv://***@cluster0.ooxsrgq.mongodb.net`; `preconfigured` lists `hrms-acme-corp`, `hrms-appinventiv`, `hrms-dev`, `hrms-praesto`, `hrms-test`, `encryption`, `admin`, `local` (identical to the earlier Atlas inventory, not the local `rentrecord`/`clamav` instance) | **Verified** |
| Write tools not exposed                         | The effective tool list has **20** tools (31 before the restart). `insert-many`, `update-many`, `delete-many`, `drop-collection`, `drop-database`, `drop-index`, `create-index`, `create-collection`, `rename-collection` and the Atlas-local create/delete tools are **absent**                                       | **Verified** |
| Write restriction not tested against production | No write was attempted                                                                                                                                                                                                                                                                                                 | —            |

**Unrelated process (for your attention):** an older `mongodb-mcp-server` (PID 81981, started 2026-10-31 10:31 IST) is still running. It has the _old_ config (`mongodb://localhost:27017/hrms…`, **no read-only flag**). It isn't this session's server and doesn't point at Atlas, but it's either orphaned or owned by another Claude session. It was not touched.

**Tool constraints met during the checks:**

- This cluster limits aggregation pipelines to **50 stages**, which caused two silent `export` failures; the inventories were re-run in chunks.
- `export` files under `~/.mongodb/mongodb-mcp/exports/` **expire within minutes**; the deliverables were written from the verified results before expiry.

## 2. P1: duplicate counts

| Finding                                                          | Value                                                                                                                                                                                                      | Label                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `attendance_records` duplicate `(tenantId, userId, date)` groups | **583 groups / 1,166 documents / 583 surplus**; max 2 copies; **both copies have `timeIn` in all 583 groups**                                                                                              | **[Newly verified]** (matches [Earlier]) |
| Employees affected                                               | **15** distinct (pseudonymised)                                                                                                                                                                            | **[Newly verified]**                     |
| Date range (stored as IST midnight)                              | 2026-05-01 → 2026-07-08 IST (2026-04-30T18:30Z → 2026-07-07T18:30Z)                                                                                                                                        | **[Newly verified]**                     |
| `leavebalances` duplicate `(tenantId, userId)` groups            | **1 group, 2 copies, created 2 s apart (2026-07-09 16:31:38Z / 16:31:40Z); the copies have since diverged** (accumulated paid leave 1 vs 6; different balance JSON; last updated 2026-07-11 vs 2026-07-31) | **[Newly verified]**                     |
| `attendance_breaks` documents                                    | **0**, so the cascade-delete risk on dedupe doesn't apply today                                                                                                                                            | **[Newly verified]**                     |

## 3. P2: attendance duplicate review ([`attendance-duplicate-review.csv`](./attendance-duplicate-review.csv))

**Sanitisation:**

- Employees are `sha256("hrms-acme-corp:" + server-side hashed userId)`, truncated to 10 hex characters. The server hashes first, so raw IDs never leave the database.
- Record IDs are replaced by their creation timestamps.
- Only punch times, status, working hours and correction flags are included.

**Results [Newly verified]:**

|                                                                            |  Groups |
| -------------------------------------------------------------------------- | ------: |
| Retain one record (all compared fields equal)                              |       1 |
| Merge non-conflicting information                                          |       0 |
| **Manual review required**                                                 | **582** |
| of which the date falls in **June 2026, whose payroll run is `disbursed`** |     263 |
| of which `timeIn` differs by more than 1 minute                            |     546 |
| of which status differs (Present/Late/WFH)                                 |     152 |

**Origin [Newly verified facts, interpretation Strongly suspected]:**

- **All 1,166 duplicated records were created on 2026-07-09 between 16:30:19 and 16:31:40 UTC (22:00–22:01 IST).** Each pair's copies are 1–5 s apart (median 4 s). The two copies of each pair were written **interleaved**, about 15 records per second, so the batches overlap in time.
- The leave-balance duplicate was created in the same window (16:31:38 / 16:31:40 UTC).
- The pattern fits **two concurrent executions of one backfill/import**, each generating independent punch times. It does _not_ fit organic punch races, which would be spread over many days with near-identical times.
- No script in the repository generates attendance with random times for this tenant (the random generators target `hrms-bonami-software`). The nearest commits are `a5081c5` "fix: attendance and leave sync" (2026-07-09 11:17 IST) and `a34c87e` "fix: attendance records for payroll" (2026-07-10 00:44 IST). **The actual writer is not yet verified.**

**What this means for resolution:**

- Within a pair, **neither copy is canonical by the data alone**: both are machine-generated in the same second range, with different values.
- Resolving 582 pairs one by one by hand is impractical. The realistic decision is **batch-level**: decide whether this backfill should exist at all, and if so which run to keep. Then handle June 2026 separately against the disbursed payroll (263 groups).
- The per-group CSV supports that decision and any spot checks. **Nothing has been changed.**

## 4. P3: live index inventory ([`index-differences.csv`](./index-differences.csv), now verified)

Taken with `$indexStats` (definitions plus usage counts since the server's last restart, 2026-10-30 18:14 UTC).

| Database            | Non-`_id` indexes | Against the 122 schema indexes                                                                                                                                                 | Label                |
| ------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `hrms-acme-corp`    |            **16** | **92 tenant-scope indexes missing, 4 present**; the 16 are exactly the set a failed `prisma db push` leaves (local reproduction)                                               | **[Newly verified]** |
| `hrms-praesto`      |               115 | 95 present; only `walkthrough_progress` is absent (the collection doesn't exist there yet)                                                                                     | **[Newly verified]** |
| `hrms-dev` (master) |                27 | 24 schema indexes present (several under `ensureMasterIndexes` names such as `McpGrant_*`, `SupportTicket_*`, `TrialClaim_*`); **`users_tenantId_employeeStatus_idx` missing** | **[Newly verified]** |

Usage evidence:

- `hrms-dev.users_employeeStatus_idx` served **913** operations since the restart. It's the fallback for every tenant-scoped user query that should use `[tenantId, employeeStatus]`.
- In `hrms-acme-corp`, the only used index is `attendance_records_tenantId_date_idx` (30 operations). All other tenant queries there run as collection scans (see the earlier `explain` results).
- The master's `ensureMasterIndexes`-style names show that the master DB is also **not** synced through `prisma db push`. **[Newly verified]** (names); cause **[Strongly suspected]**.

## 5. P4: other duplicate keys that could block unique indexes

All 21 tenant-scope unique keys declared in the schema were checked on `hrms-acme-corp` (count-only `$group`, which treats a missing field as `null`, as a non-sparse unique index does):

| Unique key                                                                                                                                                                                                                                                                                                                                                                                                                      | Duplicate groups |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: |
| `attendance_records (tenantId, userId, date)`                                                                                                                                                                                                                                                                                                                                                                                   |          **583** |
| `leavebalances (tenantId, userId)`                                                                                                                                                                                                                                                                                                                                                                                              |            **1** |
| `asset_categories`, `assets`, `dashboard_preferences`, `departments`, `designations`, `exit_checklist_item_statuses`, `exit_interview_responses`, `fnf_settlements`, `holidays`, `onboarding_checklist_states`, `overtime_requests`, `payroll_runs`, `performance_reviews`, `salary_component_definitions`, `salarystructures`, `tax_declarations`, `tenant_join_requests`, `tenant_settings`, `walkthrough_progress` (19 keys) |       **0 each** |

**[Newly verified]** Only the attendance and leave-balance duplicates block the migration. After they're resolved, a `db push` on `hrms-acme-corp` should complete. That still needs confirmation on staging first.

## 6. P5: audit-log volume and sensitive snapshots ([`audit-log-volume.csv`](./audit-log-volume.csv))

**Totals [Newly verified]:** 4,530 rows, 14.67 MB, 50 entity types. By month:

| Month    |  Rows |        Size |
| -------- | ----: | ----------: |
| Mar 2026 | 1,838 |      0.6 MB |
| Jul 2026 |   988 | **12.1 MB** |
| Oct 2026 |   399 |      1.5 MB |

**Largest contributors:**

| Entity                |  Rows |               Bytes | Notes                                                    |
| --------------------- | ----: | ------------------: | -------------------------------------------------------- |
| `JobApplication`      |    58 | **11.1 MB** (75.8%) | 56 rows > 2 KB; largest 209 KB; none in the last 30 days |
| `WalkthroughProgress` |   304 |             1.33 MB | **all 304 created 2026-10-31**; 272 rows > 2 KB          |
| `auth`                | 1,072 |             0.34 MB | no snapshots                                             |
| `SalaryStructure`     |   298 |             0.29 MB | —                                                        |
| `DashboardPreference` |    34 |             0.11 MB | all in the last 30 days                                  |

**Sensitive categories** (counts only; no values read) **[Newly verified]:**

| Category                                                         |                                                      Rows | Entities                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------: | ---------------------------------------------------------- |
| Inline resume text > 1 KB in `oldValue`/`newValue`               |                      **56** (largest value 102,916 bytes) | `JobApplication`                                           |
| Resume stored as a short reference only                          |                                                         1 | `JobApplication`                                           |
| **Clear-text `aadharNo`** (non-empty, not `[REDACTED]`)          |                                                    **57** | `JobApplication`                                           |
| Applicant form data (`data` object)                              |                                                         4 | `ApplicationDraft`                                         |
| Email or mobile present                                          | 88 (57 `JobApplication`, 27 `User`, 4 `ApplicationDraft`) | contact PII, not redacted by design                        |
| Redaction marker present (`aadhar_no`/`password` → `[REDACTED]`) |                                                        27 | `User`: the existing redaction works for those field names |

**Source data [Newly verified]:** the live `jobapplications` collection has **4 documents. All 4 hold a non-empty `aadharNo` and 3 hold inline resume text over 1 KB.** The 58 audit rows are the mutation history of these applications. Redacting only the audit copies would leave the same data in the source records.

## 7. What changed compared with earlier observations

| Item                          | Earlier ([Earlier])           | Now ([Newly verified])                                                                                                               |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Attendance duplicates         | 583 groups, 30 Apr–7 Jul      | Same, plus: 15 employees; **all created 2026-07-09 22:00–22:01 IST by two concurrent writers**; 263 groups in disbursed June payroll |
| Leave-balance duplicate       | 1 group                       | Created in the same window; **copies have diverged**, so it needs manual review                                                      |
| Attendance breaks             | cascade-delete risk           | **0 breaks exist**; no risk today                                                                                                    |
| Missing indexes               | 24 confirmed + 68 predicted   | **92 confirmed missing**; prediction correct                                                                                         |
| Master `users` index gap      | suspected                     | Confirmed; fallback index used 913 times                                                                                             |
| Other blocking unique keys    | unknown                       | **None**; only 2 keys block                                                                                                          |
| `aadharNo` in audit snapshots | code gap; presence unverified | **57 audit rows in clear text, plus 4 of 4 source applications**                                                                     |
| Inline resumes in audit       | 58 rows / 11.1 MB             | 56 inline + 1 reference; source collection still holds 3 inline resumes                                                              |

## 8. Checks that could not be completed

- **The backfill's actual writer:** not identifiable from the database alone. Application logs from 2026-07-09 ~16:30 UTC would be needed (check the CloudWatch or Loki retention window).
- **Which attendance copy payroll used for June 2026:** payroll line items store computed totals, not record IDs. Determining whether LOP or overtime used both copies needs a recomputation on staging.
- **Index usage before 2026-10-30 18:14 UTC:** `$indexStats` resets on server restart.
- **The other tenants** (`hrms-appinventiv`, `hrms-test`): only `hrms-acme-corp`, `hrms-praesto` and the master were inventoried, per the plan. `hrms-appinventiv` showed the same partial-index pattern on `attendance_records` earlier and should be scanned before any migration.

## 9. Updated next actions (decisions still yours)

1. **Attendance backfill decision (batch-level):** keep neither run, run A, or run B for May and July; treat June separately against the disbursed payroll. Then staging dedupe → unique index (plan §2.4, §3.3).
2. **Leave-balance duplicate:** manual review of the 2 diverged records (accrual history).
3. **Aadhaar exposure:** an immediate code fix (add `aadharNo` to the redaction list) plus a decision on removing Aadhaar and inline resumes from both `jobapplications` (4 records) and their audit history (57/56 rows), via the reviewed, archived procedure in plan §4.6. Your recruitment upgrade notes say Aadhaar collection was dropped, so these are legacy values.
4. **Migration:** after steps 1–2, validate `db push` on a staging copy of `hrms-acme-corp`; separately decide how to bring the master DB (`users_tenantId_employeeStatus_idx`) in line.
5. **Old MCP process (PID 81981):** close it if it's orphaned. It runs without read-only mode, though against localhost.
