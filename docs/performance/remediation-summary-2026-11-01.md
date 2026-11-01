# Performance and data remediation summary (2026-11-01)

Everything here is local and uncommitted; nothing was deployed. **Data changes were applied to the shared Atlas cluster** (used by both dev and prod), under the owner's authorisation, each after a verified backup.

## Results (measured)

- **API response times** (local stack, browser benchmark):
  - Median over all GETs: 108 → **59 ms**.
  - P95 / P99: 364 / 735 → **441 / 1,363 ms (worse; cause not isolated, see `api-performance-audit.md` §28)**.
- **Audit log page:** 756 KB → 71 KB, and P95 3.3 s → 433 ms. The query now uses an index scan instead of a 14.7 MB collection scan.
- **Probes:** unmatched-404 46 → 16 ms, tenant-settings 116 → 58 ms, payroll/advances 168 → 94 ms, org chart 241 → 146 ms, pending approvals 190 → 140 ms.
- **Tests:** 3,063 jest (231 suites) and 176 web vitest pass. Lint and typecheck are clean on the changed packages.

## Data integrity (done on the shared database)

| Action                                                                                  | Count                                                | Backup                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Synthetic seed attendance removed (by `_id`, signature + creation window)               | acme 5,120 · appinventiv 375                         | `~/.praesto-backups/2026-11-01-seed-cleanup/`                                     |
| Synthetic seed leaves removed                                                           | acme 564 · appinventiv 33                            | same                                                                              |
| Duplicate leave-balance rows removed / ledgers repaired                                 | 2 / 108 (accumulated PL −110 acme, −13 appinventiv)  | same                                                                              |
| Duplicate attendance groups remaining                                                   | **0**                                                | —                                                                                 |
| Applicant PII: Aadhaar cleared, inline resumes moved to private S3, audit rows redacted | 4 apps · 3 resumes · 61 audit rows → **0 remaining** | `~/.praesto-backups/2026-11-01-applicant-pii/` (encrypted; key in macOS Keychain) |
| Indexes: tenant migration completed (previously blocked by duplicates)                  | 4 tenant DBs, 0 dropped; master `users` index added  | —                                                                                 |

## Code changes (uncommitted)

- **Safety:**
  - The scheduler is opt-in (`SCHEDULER_ENABLED=true` in prod compose only), with a run lease.
  - Bulk scripts need `CONFIRM_DB_WRITE_HOST`.
  - Leave-balance writers no longer corrupt ledgers.
  - Shared redaction for audit snapshots and logs.
- **Performance:**
  - Audit-log list/detail split. `GET /audit-logs` no longer returns `oldValue`/`newValue`; the new `GET /audit-logs/:id` does. This is a documented contract change; the web app is updated and Swagger documents it.
  - Tenant-local schema indexes.
  - Round-trip removals in pending approvals, the org chart, the dashboard and leave balance.
  - Subscription-check cache.
  - Analytics fetches attendance trends once.
  - Cache TTL jitter.
- **Observability:** Prisma query timing (slow-query and per-request "db-heavy" logs; never query arguments).

## Behaviour changes to be aware of

1. **Subscription revocation can lag.** A subscription revoked by a webhook or job can take up to ~30 s to block a tenant on other gateway workers. Payment and other grants apply immediately.
2. **Untracked flat quota for ledger employees.** Employees whose leave balance is the monthly ledger stay "untracked" for the flat per-type quota, as before. They no longer get a corrupted hybrid row.

## Needs your decision

1. **appinventiv demo organisation data.** Departments, payroll run, assets, job openings and applications were created by the seed on 2026-07-09. They were kept for now.
2. **Unreviewed rows.** 40 master `tenant_memberships` from the seed window, and 43 seed-month ledger entries that didn't exactly match, were kept for review.
3. **Deploying.** The shared database already has the new data and indexes, but production code is unchanged. In particular, the production scheduler needs `SCHEDULER_ENABLED=true` when this code ships, or crons stop.

## Next highest-value work

1. `/dashboard/data` admin layout: 48 parallel queries per call. Cache org-wide widgets in Redis, with the capability check before the cache read.
2. Axios: share in-flight GETs instead of cancelling and retrying.
3. Reduce the tenant pool size before onboarding many tenants.
4. Single-flight in `CacheManager`.

Details: `api-performance-audit.md` §28, `database-remediation-plan.md` §9, `database-schema-and-index-audit.md`, `cache-performance-audit.md`, `architecture-performance-audit.md`, `performance-results-before-after.csv`, `api-performance-backlog.csv`.
