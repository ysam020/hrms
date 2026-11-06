# Praesto load testing

GET-only, sequential-stage Autocannon benchmarks against an **isolated copy of the backend** (`docker-compose.loadtest.yml`), with monitoring analysis after every stage. The latest results are in [`reports/baseline-2026-11-05.md`](reports/baseline-2026-11-05.md).

This folder is a standalone npm project, not a pnpm workspace member. That keeps Autocannon out of the monorepo lockfile. Run `npm install` here once.

## Safety model

The database is the shared Atlas cluster `<atlas host>/hrms-dev`, which **production also uses** (500-connection limit, shared/Flex tier). Everything here exists to keep a benchmark from hurting it:

| Risk                     | Guard                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touching real tenants    | Load and checks use only the synthetic `LOADTEST_` orgs. Tokens carry their tenant. `verify-isolation.js` (340 checks) must pass before `run-load-test.js` will start.                                                                                                                |
| Writing data             | The request picker only emits GET. `smoke.js` excludes routes that write on read. Every run snapshots document counts in the synthetic databases and their master rows before and after (the app's audit middleware logs every write it makes, so `auditlogs` doubles as a tripwire). |
| Exhausting Atlas         | A 1-second live guard aborts and **tears the stack down** (releasing its connections) when cluster connections reach 400, or when the cluster's round trip stays above 2 s for 5 polls. A stage won't start if the cluster is already at the threshold.                               |
| Hitting production's API | `config/environments.js` refuses any non-localhost target. Tokens are signed with a per-run secret that only the loadtest stack accepts.                                                                                                                                              |
| Leaving limits raised    | See [Rate limits](#rate-limits).                                                                                                                                                                                                                                                      |
| Paid side effects        | CloudWatch shipping is off in the stack (`CLOUDWATCH_LOGS_DISABLED`); logs go to the local Loki. The prod scheduler won't email synthetic users (all `kyc_approval: Approved`, `@loadtest.invalid` addresses).                                                                        |

## Run a benchmark

```bash
cd load-testing && npm install            # once

# 1. Isolated stack (12 services + own Redis), prod-equal container limits.
node scripts/stack.js up --build          # --build after code changes

# 2. Synthetic orgs (once; writes only LOADTEST_ records, ids in .state/manifest.json)
cd .. && DEV_MONGODB_URI=… CONFIRM_DB_WRITE_HOST=<atlas host> \
  pnpm --filter=@hrms/db exec tsx src/loadtest/seed.ts && cd load-testing

# 3. Validate the workload (one GET per role/endpoint) and compile the plan, then isolation.
node scripts/smoke.js
node scripts/verify-isolation.js

# 4. Run the stages. Leave the machine awake and on power.
caffeinate -dims node scripts/run-load-test.js

# 5. Compare against an earlier run.
node scripts/compare-results.js reports/<before-run> reports/<after-run> --label "permission cache"

node scripts/stack.js down
```

`seed.ts` needs `DEV_MONGODB_URI` in the environment. Take it from `local-secrets.json` and never paste it into reports. Tokens last 6 hours, so re-run `smoke.js` (which mints them) before a later run.

## Latency breakdown sampling (not a load test)

To see where a request's time goes, start the stack with the gateway's breakdown lines on, sample sequentially, then analyse:

```bash
REQUEST_TIMING_LOG=true REQUEST_TIMING_OPS=true node scripts/stack.js up
node scripts/latency-sample.js --tenant acme-corp --passes 3 --burst 5
node scripts/latency-analyse.js reports/latency-sample-<ts>.json
node scripts/stack.js down
```

- **What the sampler sends:** one GET at a time, about 2 requests per second, each tagged with its own `x-request-id`. Every client timing is joined to the gateway's breakdown line in Loki.
- **What a breakdown line holds:** stages, every DB/Redis/gRPC wait, the I/O union, non-I/O time, serialisation and CPU.
- **What the analysis adds:** per-endpoint medians, critical-path "waves" and per-op statistics.
- **Findings:** `docs/performance/latency-root-cause-analysis.md`.
- **Comparing two samples:** `node scripts/permission-compare.js <before.json> <after.json> [--cold] [--out file.md]` (used for `docs/performance/permission-resolution-comparison.md`). Add `--redact` to a sample run when its file will be kept: it drops request ids and user identifiers.

## Configuration

Every value can be overridden with an environment variable:

| What                                | Variable (default)                                                                | File                   |
| ----------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Stages (connections)                | `LT_STAGES` (`100,500,1000,1500,2000`, then +500 up to `LT_MAX_CONNECTIONS`=5000) | `config/stages.js`     |
| Warm-up / measure / cooldown        | `LT_WARMUP_S` 30, `LT_MEASURE_S` 120, `LT_COOLDOWN_S` 60                          | ″                      |
| Request timeout                     | `LT_TIMEOUT_S` 10                                                                 | ″                      |
| Autocannon worker threads           | `LT_WORKERS` 5 (each gets ⌊connections/workers⌋)                                  | ″                      |
| Error rate healthy / fail           | `LT_ERR_HEALTHY` 0.5 / `LT_ERR_FAIL` 2 (%)                                        | `config/thresholds.js` |
| P95 / P99 fail                      | `LT_P95_FAIL` 2000 / `LT_P99_FAIL` 5000 (ms)                                      | ″                      |
| Timeout fail, 429 fail              | `LT_TIMEOUT_FAIL` 1, `LT_429_FAIL` 0.5 (%)                                        | ″                      |
| CPU fail (% of container limit)     | `LT_CPU_FAIL` 90                                                                  | ″                      |
| Gateway memory growth fail          | `LT_MEM_GROWTH_FAIL` 25 (%)                                                       | ″                      |
| Atlas connection abort              | `LT_ATLAS_CONN_ABORT` 400                                                         | ″                      |
| Atlas round-trip abort              | `LT_ATLAS_RTT_ABORT_MS` 2000 × `LT_ATLAS_THROTTLE_POLLS` 5                        | ″                      |
| Live error-rate abort (10 s window) | `LT_LIVE_ERR_ABORT` 20 (%)                                                        | ″                      |
| Generator saturation                | `LT_GEN_CPU_SAT` 85 (% of worker threads busy)                                    | ″                      |

**What a stage measures:** N concurrent keep-alive connections, each acting as one signed-in person. A connection requests its next page as soon as the previous response arrives (closed loop, no think time). N is not a number of human users, who pause between clicks, and not requests per second; RPS is the measured outcome.

## Workload

- **Endpoints:** `config/endpoints.js` holds 34 GET endpoints with parameters taken from the web app's own calls. `reports/endpoint-inventory.md` lists all 177 gateway GET routes, each marked as used, excluded (with the reason) or not used.
- **Pages:** `config/workload.js` defines weighted page visits (shell, Today dashboard, background polling, attendance, leave, people, insights, settings, audit…). Each connection is one seeded person, chosen by role activity weight, who walks pages in order.
- **Weights:** derived from 14 days of real route counts in Prometheus, blended with the proposed category split, and adjusted per role. The resulting mix (Dashboard 32%, Notifications 16%, Employees 13%, Shell 13%, Leave 13%, Attendance 9%, Organisation 4%, Reports 1%, Settings 0.6%, Audit 0.1%) is printed in every `smoke-*.md`. Reports and Audit stay small because 11 of 310 people can open them.
- **Role check:** `smoke.js` drops any (role, endpoint) pair that doesn't answer 2xx, so the benchmark never pads its numbers with 403s.
- **Seeded data:** alpha 250 people, beta 60. Each person has 75 days of attendance, about 6 leave applications, leave balances, teams, holidays, notifications and audit history. The data is deterministic.

## Reading the results

Each run writes `reports/run-<UTC timestamp>/`:

- **`stage-NNNNN.md` / `.json`**, per stage:
  - Client totals (Autocannon), and per-endpoint p50/p95/p99 from the request picker's histograms.
  - Threshold verdicts.
  - Changes since the previous stage.
  - Prometheus figures for the exact window: gateway RPS and percentiles, CPU, RSS, heap, event-loop lag, GC, gRPC outcomes, cache operations.
  - Container CPU and memory (docker stats).
  - Atlas connections, ops/s and round trip.
  - Redis INFO.
  - Loki pattern counts and `db-heavy request` / `slow prisma query` detail.
  - A diagnosed bottleneck with prioritised findings.
- **`summary.md` / `.json`:** capacity table (sustainable concurrency, peak RPS, first failing stage, failure mode, bottleneck), stage comparison, MongoDB/Redis by stage, most expensive endpoints, and run integrity (rate-limit restoration, read-only check).

How to read them:

- **p95** is merged from per-route log buckets, accurate to about ±5%; Autocannon itself reports no p95. p50, p90, p97.5 and p99 come straight from Autocannon.
- **If "Load generator" says INVALID,** the generator was the bottleneck and that stage says nothing about the server.
- **Atlas ops/s is cluster-wide.** It includes production.

## Grafana, Prometheus and Loki

While the stack runs, its 12 services are scraped by the dev Prometheus. `stack.js up` adds a clearly marked block to `monitoring/prometheus.yml` and hot-reloads Prometheus; `down` removes it again. The services carry the labels `service="loadtest-<name>"` and `stack="loadtest"`. In Grafana (http://localhost:3000, dashboard `hrms-nodejs`), pick a `loadtest-*` service and set the time range to the stage window printed in its report. Don't use a relative range: it would mix stages or runs.

Useful queries:

```promql
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_ms_bucket{service="loadtest-api-gateway"}[1m])))
sum by (service) (rate(process_cpu_seconds_total{stack="loadtest"}[1m]))
max by (service) (nodejs_eventloop_lag_p99_seconds{stack="loadtest"})
```

```logql
{service="loadtest-api-gateway"} |= "db-heavy request"
{service=~"loadtest-.*"} |= "slow prisma query"
{service=~"loadtest-.*"} | level="error"
```

**Not available on this setup:** container metrics (cAdvisor), MongoDB or Redis exporters, BullMQ metrics, and Atlas CPU, disk and profiler data (shared tier). The runner samples `docker stats`, `serverStatus` and Redis `INFO` itself instead.

## Rate limits

Original configuration, from `apps/api-gateway/src/config/rateLimiters.ts` and `middleware/rateLimiter.ts`:

| Limiter                 | Key        | Window |    Max | Applies to                              |
| ----------------------- | ---------- | ------ | -----: | --------------------------------------- |
| authLimiter             | user or IP | 15 min |  1,000 | login, WebAuthn, Google, /refresh-token |
| profileLimiter          | user or IP | 1 min  |    300 | /api/v1/profile                         |
| generalLimiter          | user or IP | 1 min  | 10,000 | every /api request                      |
| publicLimiter           | user or IP | 15 min |  2,500 | public careers routes                   |
| draftRecoveryLimiter    | IP         | 15 min |     10 | careers draft recovery                  |
| applicationWriteLimiter | IP         | 15 min |     60 | careers application POSTs               |
| defaultLimiter          | **IP**     | 1 min  |  5,000 | all business routes                     |

How the overrides work:

1. **Mechanism:** each limiter reads an optional `RATE_LIMIT_MAX_<NAME>` at startup (`limitMax()`). The value is ignored when `NODE_ENV=production`, and invalid values fall back to the coded default.
2. **Applying:** for a run, `run-load-test.js` writes `DEFAULT`, `GENERAL` and `PROFILE` = 50,000,000 to `.state/ratelimit.env`, which the loadtest stack's `env_file` loads, then recreates the gateway. The originals and overrides are recorded in `.state/ratelimit-record.json`.
3. **Restoring:** on run end, failure, exception or SIGINT/SIGTERM, the runner empties the file, recreates the gateway, and verifies three things: the file is empty, the container has no `RATE_LIMIT_MAX_*` variables, and a live business GET reports `RateLimit-Limit: 5000`. If a guard stopped the stack, clearing the file is enough, since no container is left. After a `kill -9`, run `node scripts/stack.js restore-limits`.
4. **Scope:** production and the dev stack never read this file. Nothing permanent changed.

HTTP 429s are counted per stage and fail the stage above 0.5%.

## Cleanup

```bash
cd .. && DEV_MONGODB_URI=… CONFIRM_DB_WRITE_HOST=<atlas host> \
  pnpm --filter=@hrms/db exec tsx src/loadtest/cleanup.ts --dry-run   # then without --dry-run
```

**Ownership check:** for each org in the manifest, cleanup first verifies the tenant row (manifest id, `loadtest-` slug, `LOADTEST_` name, dbName) and the database's `_init` marker (same run id). Only then does it delete:

- memberships, by id and tenant;
- users, by id, `loadtest_` username and tenant;
- the `hrms-loadtest-*` database;
- the tenant row.

Any mismatch leaves that org untouched. Other master rows that reference the tenant are reported, not deleted. While the two orgs exist, the cluster sits at **494 of its 500 collections**, so clean up once the before/after series is done.
