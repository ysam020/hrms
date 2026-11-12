# Attendance day key: UTC midnight vs the organisation's day

Status: **investigation only** (2026-11-12). No code or data was changed. Kept
out of the reminders PRs on purpose; a fix needs its own PR and, for existing
rows, an approved data migration.

## How the key is built today

`AttendanceRecord` is unique on `(tenantId, userId, date)` and `(userId, date)`.
`date` is meant to identify one working day. Every current writer and reader
builds it as **UTC midnight of the current UTC date**:

| Where                                              | Code                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Punch in/out                                       | `apps/attendance-service/src/handlers/markAttendance.ts` — `dayjs().utc().startOf("day")` |
| Today's status                                     | `getTodayAttendance.ts` — same                                                            |
| Correction                                         | `correctAttendance.ts` — `targetDate.utc().startOf("day")`                                |
| Range reads                                        | `getAttendance.ts`, gateway `attendance.ts` — `dayjs.utc(x).startOf("day")`               |
| Nightly reconcile (absent / week-off / leave rows) | `scheduler-service/src/jobs/reconcileAttendance.ts` — `dayjs.utc(date).startOf("day")`    |
| Dashboard "today"                                  | `api-gateway/src/handlers/dashboard.ts` — `dayjs.utc().startOf("day")`                    |

Lateness, by contrast, is judged on the **process clock**
(`isLate` uses `dayjs(t).hour()`), which is IST because every container sets
`TZ=Asia/Kolkata` (`docker/base.Dockerfile`).

## Why it is wrong

The organisation's day and the UTC day differ for 5 h 30 min (IST is UTC+5:30):

- A punch-in between **00:00 and 05:29 IST** is filed under the _previous_
  date, and "today" screens between those hours show yesterday's record.
- A punch-out after 05:30 IST the next morning looks for a different key and
  can't find its punch-in (an overnight shift can never close).
- A punch-out between 00:00 and 05:29 IST _does_ find the previous evening's
  record. That's an accident of the bug, not a design.
- For a tenant in another zone (now possible with `Tenant.timeZone`, added in
  the reminders work) the mismatch is that zone's offset, not 5:30.

## What the production data shows (read-only counts, 2026-11-12)

Run against the tenant databases with aggregation counts only; no personal
fields were read.

| Database | Records | With punch-in | Punch-in 00:00–05:29 IST | Key ≠ IST date of punch-in |
| -------- | ------- | ------------- | ------------------------ | -------------------------- |
| tenant A | 1,703   | 263           | 0                        | 0                          |
| tenant B | 0       | —             | —                        | —                          |

So the early-morning case hasn't happened yet. The query did find a
**second, real inconsistency**:

- **351 rows in tenant A are keyed at 18:30 UTC** (IST midnight), not
  00:00 UTC. They span 2025-12-31 to 2026-03-27: 151 Present, 97 Half Day,
  100 Week Off, 2 Leave and 1 corrected Present.
- That is the key a local-time `setHours(0, 0, 0, 0)` produces on an IST
  machine. `packages/database/src/seed-bonami.ts:61` does exactly that, and
  the date range matches seeded history. The one corrected row (2026-03-27)
  means an earlier version of the correction path did the same.
- Read with the UTC-date convention, each of these rows names the **previous
  calendar day**. That's why 148 of them appear to have a punch-out "a day
  after" their date.
- Because the two key styles differ, the unique index doesn't stop both from
  existing for one person and day: **55 (user, IST day) pairs have two rows.**

The only genuine cross-midnight punch-outs are 2 corrected rows
(2026-05-15 and 2026-07-09).

## Related

`attendanceSettings.ts` `resolveOvertimeHours` looks up approved overtime
with `dayjs(date).startOf("day")` / `endOf("day")`. That's the process-local
(IST) day, a third convention. It works today only because the container is
IST.

## Options (for a separate decision)

1. **Key by the tenant's calendar date.** Keep storing `YYYY-MM-DDT00:00Z`,
   but derive `YYYY-MM-DD` from the punch instant in `Tenant.timeZone`
   (`zonedDateKey` in `@hrms/common`) instead of the UTC date. This is the
   smallest change: the stored format is unchanged and every reader that
   formats `date` as UTC keeps working. It fixes early-morning punches and
   other zones.
2. **Normalise the 351 legacy rows** to the 00:00 UTC key of their IST date,
   merging the 55 collisions. This is a production data migration and needs
   its own approval, a backup and a dry run. Merge rule to agree first: the
   row with a punch-in wins over a reconcile-generated Week Off / Absent row.
3. **Overnight shifts** need a shift model (out of scope by decision). Until
   then a punch-out must find the open punch-in from the previous day
   explicitly, not by date key.

## What the reminders work does meanwhile

The punch reminders (PR 3) never rely on this bug. They:

- compute "today" as the tenant-local calendar date;
- treat a person as punched in if a record exists keyed at **either** that
  date's 00:00 UTC (current writers) **or** its local midnight (the legacy
  rows). That's one indexed range query, `date ∈ [local midnight, 00:00Z]`;
- revalidate the record immediately before sending.

So the legacy rows can't cause a false "you haven't punched in" reminder.
