# Production latency verification

**Date:** 2026-11-05, 02:43–02:52 UTC.

**Method:** read-only, as authorised by the user for [latency-root-cause-analysis.md](latency-root-cause-analysis.md) §12.4. Three SSM `AWS-RunShellScript` invocations ran on the production host `<prod instance>` (ap-south-1c, m7i-flex.large, 2 vCPU, 7.6 GB):

| Invocation                         | What it ran                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `5db61456…`                        | DNS/TCP/TLS timing, host sockets, `docker stats`, Prometheus queries                                            |
| `e605bb78…`                        | Atlas connections per container via `/proc/net/tcp`, 60 s apart; container metadata                             |
| third invocation (ID not recorded) | Kernel `ss -tni` on the app's existing Atlas connections, via `nsenter` into two containers' network namespaces |

Production's CloudWatch group `/hrms/api-gateway/production` was also read.

Nothing was written, restarted or reconfigured. No MongoDB client was created. The TCP probes opened bare TCP connections, and the TLS probe opened 3 bare TLS handshakes to port 27017, all without MongoDB authentication.

**Evidence labels:** **[Measured]** means from those commands. **[Inferred]** means a conclusion that wasn't measured directly.

## 1. Production → Atlas network

| Measurement                                                                                                    | Value                                                                                                        | Notes                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Placement                                                                                                      | Production EC2 in `ap-south-1c` = **`aps1-az2`**; Atlas primary `shard-00-02`, `AP_SOUTH_1` / **`aps1-az2`** | same availability zone                                                                                          |
| DNS (`getent`, A record per shard host)                                                                        | **2.9–7.0 ms** (first lookup 7 ms, then ~3 ms)                                                               | the VPC resolver; drivers resolve once per topology change                                                      |
| TCP connect from the host (SYN → SYN-ACK)                                                                      | **2.8–3.7 ms** (15 samples, 3 hosts)                                                                         | includes NAT and Atlas-proxy SYN handling                                                                       |
| **Kernel RTT on the app's live connections** (gateway, leave-service; `ss -tni` in each container's namespace) | **min RTT 0.11–0.74 ms; smoothed RTT 0.5–1.3 ms** on most connections                                        | a few rarely used connections show srtt 5–6.6 ms with rttvar ≈ 11 ms (too few samples to be meaningful)         |
| TLS handshake incl. TCP (`openssl s_client`, primary)                                                          | 48–60 ms                                                                                                     | **upper bound**: includes starting the `openssl` process; the handshake itself is a few RTTs plus server crypto |
| TCP retransmissions (host lifetime)                                                                            | 56 of 752,734 segments (**0.007%**)                                                                          | network is healthy                                                                                              |

**Result: production's network round trip to Atlas is about 0.5–1.3 ms, not 33 ms.** That's 25–60× less than from the Mac. **[Measured]**

The claim of "1–3 ms" isn't quite right either. The measured network RTT is lower (~1 ms), but a MongoDB-level round trip adds driver, Atlas-proxy and server time on top. That figure wasn't measured, because doing so needs a new authenticated client (§9).

## 2. Production connection pools

Atlas connections per container, read from each container's `/proc/net/tcp` at t0 and t0 + 60 s (production otherwise idle):

| Container                    |      t0 | t0 + 60 s | Kept | New | Closed |
| ---------------------------- | ------: | --------: | ---: | --: | -----: |
| api-gateway                  |      13 |        13 |   13 |   0 |      0 |
| each of the 11 gRPC services |      12 |        12 |   12 |   0 |      0 |
| scheduler-service            |       7 |         7 |    7 |   0 |      0 |
| **Total**                    | **152** |   **152** |  152 |   0 |      0 |

- **[Measured]** No churn while idle.
- **[Inferred]** 12 is exactly 2 workers × 3 replica-set members × 2 monitoring connections (the driver's heartbeat and RTT monitors). So at rest the **query pools are essentially empty**: 0 per service and 1 in the gateway. Any request that arrives after an idle period, or any burst, must first open connections.
- **[Measured]** Production's slow-query log agrees. The 23 `slow prisma query` lines in CloudWatch (2026-11-02 14:52 → 11-03 00:44) form three clusters, and **17 of them fall within 2 seconds of each other**: many unrelated queries (`TenantSettings`, `Holiday`, `LeaveApplication`, `AttendanceRecord`, `PayrollRun`, `Resignation`, `Ticket`…), almost all **313–349 ms**. Those queries execute in 0–2 ms. A uniform ~320 ms across unrelated queries in one burst is the signature of **waiting for new connections**. That matches the 210–330 ms per-connection setup measured from the Mac, which means connection setup cost is dominated by **TLS + SCRAM work on the server/proxy side, not by distance**. **[Inferred, Medium–High confidence]**
- **Not measurable:** Prisma's pool and checkout-wait metrics don't exist for MongoDB (latency-root-cause-analysis §4.2).

## 3. Production endpoint latency

Production Prometheus has only existed since the 2026-11-03 deploy, so it holds **≈ 1.5 days and 652 requests in total** (0.0011 req/s). Statuses: 412 × 200, 129 × 304, 57 × 401, 54 × 404 (scanners: `/wp-login.php`, `/xmlrpc.php`…), no 5xx. Samples per route are small, so treat these percentiles as indicative. Bucket boundaries are 5/10/25/50/100/250/500/1000 ms, so values are interpolated within buckets.

| GET route                                      |      n | p50 ms |  p95 ms |  p99 ms |
| ---------------------------------------------- | -----: | -----: | ------: | ------: |
| `/dashboard/data`                              |     74 |     81 | **794** | **959** |
| `/get-attendance-summary/:userId/:year/:month` |     18 |     53 |     108 |     222 |
| `/get-attendances/:year/:month`                |     18 |     50 |      95 |      99 |
| `/get-holidays/:year`                          |     18 |     53 |      95 |      99 |
| `/get-calendar-events`                         |     18 |     53 |      95 |      99 |
| `/birthdays-anniversaries`                     |     18 |     26 |      53 |      91 |
| `/get-hr-activities`                           |     18 |     25 |      48 |      50 |
| `/dashboard`                                   |     18 |     10 |      24 |      25 |
| `/chat/unread-counts`, `/get-notifications`    | 1 each |    375 |       — |       — |
| `/profile`                                     |      1 |    175 |       — |       — |
| `/health` (no DB)                              |    276 |    2.5 |     4.8 |     5.0 |
| All GET                                        |    541 |    3.8 |      90 |     629 |

gRPC (all services): `GetNotifications` p50 108 / p95 236 ms; `GetAttendance` p50 0.7 / p95 460 ms; `GetLeaveBalance` p50 5 / p95 450 ms; `RefreshToken` p50 3 ms.

**Interpretation [Inferred]:**

- **Medians are low in production:** 10–80 ms, against 36–170 ms on the Mac.
- **Tails remain:** `/dashboard/data` p95 ≈ 0.8 s and gRPC p95 ≈ 450 ms are the same bimodal shape as on the Mac. With an ~1 ms network, those tails can't come from round-trip depth. They match connection setup on the empty pools in §2, plus in-process caches expiring between sparse requests (`/get-holidays` takes 5 ms warm on the Mac but has a 53 ms median in production).

**Not available in production:**

- Endpoint coverage: employee, leave-list and audit-log endpoints had **no traffic** in the window, so they can't be compared.
- `cache_operations_total` and `cache_redis_duration_ms` returned no data, so production Redis latency can't be read from metrics.
- The event-loop-utilisation gauge isn't deployed yet.

## 4. Production resource utilisation

| Resource                                        | Value                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Host                                            | 2 vCPU; memory 3.5 GB used / 7.6 GB total                                                                                           |
| Gateway CPU                                     | 0.003 cores on average over the window; **max 0.41 cores** (5-min rate)                                                             |
| Service CPU                                     | 0.001–0.003 cores each                                                                                                              |
| **Gateway memory**                              | container **674 MiB / 768 MiB** now; RSS **max 732 MiB**; processes: primary 73 MB + workers **376 MB + 370 MB**                    |
| Gateway heap / external (sum of processes, max) | heap used 282 MB, **external 290 MB**                                                                                               |
| Gateway event-loop lag p99                      | median 10.3 ms, max 10.9 ms                                                                                                         |
| Gateway GC                                      | 0.00005 s/s                                                                                                                         |
| Services RSS (max)                              | 191–207 MB each (limit 384 MiB)                                                                                                     |
| Redis                                           | 6 MiB / 256 MiB                                                                                                                     |
| Restarts                                        | Docker `RestartCount` 0. Prometheus showed `hrm-service` with 23 start-time "changes": a scrape/aggregation artefact, not restarts. |
| Atlas CPU / memory / disk / queueing            | **not readable** (shared/Flex tier, no Atlas API access)                                                                            |

## 5. Mac-based findings vs production

| Finding (latency-root-cause-analysis.md)                         | In production?                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Query execution 0–2 ms, index-backed                             | **Applies** (same cluster)                                                                                                 |
| Network RTT ≈ 33 ms per query                                    | **Mac-specific.** Production is about 0.5–1.3 ms                                                                           |
| Endpoint latency ≈ waves × RTT (140–170 ms for 4–5 waves)        | **Mostly Mac-specific.** At ~1 ms RTT, five waves add ~5–10 ms. Production medians are 10–80 ms.                           |
| Connection setup 210–330 ms and checkout waits under bursts      | **Applies, and dominates production tails.** The query pools are empty at idle and the slow-query clusters sit at ~320 ms. |
| Permission/user lookups = 19% of server time                     | **Smaller in production when warm** (each ~1–3 ms). They still add one connection checkout each when pools are cold.       |
| Gateway memory near its limit                                    | **Applies, worse:** 732 MiB peak of 768 MiB                                                                                |
| Middleware, JWT, Redis, serialisation, event loop, GC negligible | **Applies** (lag ~10 ms, CPU idle)                                                                                         |

## 6. What this changes

- **The biggest production lever is connection lifecycle, not query count:** keeping warm connections, e.g. a small `minPoolSize`, and checking why pools drain at idle. That is out of scope for this phase (pool changes were explicitly deferred).
- **Request-scoped permission resolution** (the change approved for this phase) still removes round trips and checkouts. **[Inferred]** Its effect in production should be roughly 1–3 ms per removed lookup when warm, and larger only when a removed lookup would have had to wait on a cold pool. The Mac-based sampler will show a larger effect because its RTT is about 33 ms. Comparisons will say so.

## 7. Measurement gaps

1. **MongoDB-level RTT via the production driver configuration:** needs one short-lived authenticated client inside the gateway container (≈ 6–8 connections for a few seconds). Not done, because you asked not to create connections only to measure. Command for approval:
   `docker exec hrms-prod-api-gateway node -e "<20 × prisma.$runCommandRaw({ping:1}) timings>"`
2. **Checkout wait inside Prisma:** not exposed for MongoDB. It needs Prisma `tracing` (new dependency) or a driver-level probe in production.
3. **Endpoint coverage:** production traffic is too sparse (652 requests) for employee, leave-list, audit and permission-heavy endpoints. Revisit after a week of real use.
4. **Production Redis latency:** the cache metrics returned no series. Check that the deployed image registers them.
5. **Atlas server metrics:** need Atlas API access or the Atlas UI.
