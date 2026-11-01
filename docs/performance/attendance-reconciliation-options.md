# Attendance Reconciliation Options: Incident INC-2026-07-09-SEED

**Scope:** `hrms-acme-corp` · **Status:** proposal only, nothing executed · **Manifest:** [`attendance-reconciliation-manifest.csv`](./attendance-reconciliation-manifest.csv) (583 rows, one per duplicate group, sanitised) · **Root cause:** [`attendance-backfill-root-cause.md`](./attendance-backfill-root-cause.md)

## 1. The incident as one batch

The duplicates are a symptom. The incident is the **whole footprint of the two concurrent `db:seed` runs**, and reconciling only the 583 duplicate pairs would leave the rest of the synthetic data in place.

| Item                                                                                              |                                                                                                          Count | Label      |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------: | ---------- |
| Attendance records created in the window                                                          |                                                                              **2,049** across **32 employees** | Measured   |
| of which in duplicate pairs                                                                       |                                                                               1,166 (583 groups, 15 employees) | Measured   |
| of which single copies                                                                            |                                                                                             883 (17 employees) | Measured   |
| Approved leave applications created in the window                                                 |                                         **243** (May 101, June 109, July 33; 130 PL; 7 employee-days with two) | Measured   |
| Leave-balance rows created in the window                                                          |                                                  2 (the duplicate pair; see `leave-balance-reconciliation.md`) | Measured   |
| Leave-balance month entries appended by the seed (`balances[]` May–July for each seeded employee) |                                                      Not separable by query (entries carry no creation marker) | Unverified |
| Genuine attendance for the 32 seeded employees in May 1 – July 8                                  | **31 employees: none.** 1 employee: 8 genuine records on days the seed didn't touch (not in the duplicate set) | Measured   |
| Genuine attendance for the other 69 employees in the period                                       |                                                                           3,072 records, untouched by the seed | Measured   |

Within each pair the two copies are both machine-generated, with independently random times. **No copy is "the real one".** The question isn't which copy to keep, but whether _any_ seed-generated attendance should remain.

## 2. Evidence available per group

| Source                                    | Available?                                                                                                          | What it shows                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance timestamps and status          | Yes                                                                                                                 | Both copies carry the seed signature (`workingHours = 8`, `timeOut` set, `faker` times); they differ randomly                                      |
| Related attendance events or breaks       | **No events**; `attendance_breaks` = 0                                                                              | Nothing to corroborate either copy                                                                                                                 |
| Employee schedules or shifts              | Tenant work week only; the seed ignored shifts                                                                      | Can't validate punch times                                                                                                                         |
| Audit history                             | **None** for the window                                                                                             | —                                                                                                                                                  |
| Backfill logs or execution metadata       | **None** (7-day log retention; no run IDs on documents)                                                             | The two runs **can't be told apart per record**: the copies are interleaved within the same seconds, so "run A" and "run B" can't be reconstructed |
| Payroll association                       | June: disbursed run with **1 line item, for an employee with no seeded records**. May and July: **no payroll runs** | Measured                                                                                                                                           |
| Genuine records on the same employee-date | **0 for all 583 groups** (no group has a third, non-seed record)                                                    | Measured                                                                                                                                           |

## 3. Options compared

| #   | Option                                                                                        | Feasible?                                                                         | Correctness                                                                  | Risk                                                                                                                                            | Verdict                                                      |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Keep the records from one identified run                                                      | **No.** Runs can't be identified per record (no run metadata, interleaved writes) | Would keep fabricated punches either way                                     | Arbitrary choice presented as reconciliation                                                                                                    | Reject                                                       |
| 2   | Keep the other run's records                                                                  | **No**, same reason                                                               | Same                                                                         | Same                                                                                                                                            | Reject                                                       |
| 3   | Reconstruct canonical records from a verified source of truth                                 | **No.** No source of truth exists: no punch events, devices, approvals or logs    | —                                                                            | —                                                                                                                                               | Not possible                                                 |
| 4   | **Remove both copies** (and the seed's leave applications and balance entries); don't rebuild | **Yes.** Records are identifiable by creation window and signature                | Restores "no attendance recorded", the truthful state for 31 of 32 employees | Those days then read as unrecorded. A later reconcile run or payroll would treat them as absent, LWP or leave-derived, so HR must confirm first | **Recommended**, subject to §4                               |
| 5   | Escalate employees whose real attendance must be entered                                      | Yes, per employee                                                                 | HR enters genuine attendance where it's known                                | Manual effort                                                                                                                                   | **Use for any employee HR says genuinely worked those days** |

## 4. Recommended procedure (for approval; staging first)

1. **HR confirmation (blocking):** for the 32 affected employees (pseudonymised list available on request through a restricted channel), did any of them work May 1 – July 8 in a way that should be on record? Yes → that employee goes to Option 5. No → Option 4.
2. **Freeze:** don't initiate May or July 2026 payroll until this is reconciled. Those runs would read the seeded attendance and leaves.
3. **Staging:** restore `hrms-acme-corp` from an Atlas backup into an isolated cluster; run the dry run (§5); review the diff counts.
4. **Archive, then remove (staging, then production after approval):**
   - Export the 2,049 attendance records, 243 leave applications and the 2 leave-balance rows to an encrypted, access-restricted archive, keyed by `_id`.
   - Delete them in one transaction per employee.
   - Rebuild the affected employees' `leavebalances` from genuine leave history and policy (see `leave-balance-reconciliation.md`).
5. **Then** build the unique index (migration plan) so this can't recur.
6. **Rollback:** re-insert from the archive by original `_id`.

## 5. Dry run (read-only; selection logic for review)

Selection criteria, all of which must hold:

- `_id` creation time between 2026-07-09T16:29:00Z and 16:33:00Z;
- the collection is `attendance_records` or `leaves`;
- for attendance: `workingHours = 8` and `timeOut` present.

Expected counts: **2,049 attendance / 243 leaves**. Any difference stops the run. The dry run emits only counts per employee pseudonym and month, never `_id`s or values. The apply step uses the `_id` list generated inside the restricted environment and never written to tickets or chat.

## 6. Payroll validation plan (staging)

Payroll stores totals, not attendance references, so validation means recomputing.

| Period                    | Current state                                                                        | Validation                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **June 2026 (disbursed)** | 1 line item; that employee has no seeded attendance and no duplicate days [Measured] | On staging, recompute June for that one employee with `utils/payrollCalc.ts`, once on the current data and once on the post-reconciliation copy. **Expect identical totals** (gross, deductions, net). A mismatch blocks the production change and is escalated. Also confirm no other employee should have been in the June run: `employeeCount` vs active employees, an HR question |
| **May 2026 / July 2026**  | No runs exist                                                                        | Recompute the would-be totals for the 32 seeded employees on current vs reconciled data, to show HR what _would_ have been paid from synthetic data. Initiate the real runs only after reconciliation                                                                                                                                                                                 |
| Leave balances            | Seed added May–July entries for seeded employees                                     | Compare balances before and after the rebuild per employee pseudonym (counts and deltas only, shown to HR in the restricted channel)                                                                                                                                                                                                                                                  |

Payroll correctness isn't inferred from duplicates alone. On the evidence, **the only disbursed run (June) didn't use seeded data**. Staging recalculation confirms it.

## 7. Decisions required

1. Approve Option 4 for the whole batch (2,049 attendance + 243 leaves + seeded balance entries), with Option 5 for employees HR flags.
2. Freeze May and July 2026 payroll initiation until done.
3. Approve a staging environment (Atlas backup restore) for the dry run and payroll recalculation.
