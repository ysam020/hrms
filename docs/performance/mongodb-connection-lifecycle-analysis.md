# MongoDB connection lifecycle analysis

**Date:** 2026-11-05. **Phase:** investigation only. No code, configuration, pool size or production setting was changed.

**Question:** why do the first database operations after idle take ~320 ms in production when the network RTT is 0.5–1.3 ms and hot queries execute in 0–2 ms?

**Evidence labels:**

| Label               | Meaning                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **[Measured-prod]** | Read-only production probes: SSM, inside the gateway container; no MongoDB authentication, no application connections               |
| **[Measured-lab]**  | Controlled experiments from the Mac against the same Atlas cluster: trivial read-only queries, a handful of short-lived connections |
| **[Code]**          | Read from the source                                                                                                                |
| **[Docs]**          | Driver defaults per documentation; not observable in this deployment                                                                |
| **[Inferred]**      | Concluded but not measured                                                                                                          |

## 0. Summary

1. **The ~320 ms clusters are cold _client_ creation, not idle connection reaping.** **[Measured-prod]** Production's slow-query log shows them right after gateway start-up (master warm-up queries 372–595 ms) and at the **first use of a tenant database in a process** (14:56:06, 3 minutes after start: 17 tenant queries, all 313–349 ms).
   - `tenantClientPool.ts` creates a new `PrismaClient` per tenant database on first use and **destroys it after 30 minutes idle**. **[Code]**
   - With production's sparse traffic, most tenant activity therefore starts on a brand-new client: SRV/TXT lookup, server discovery, new TLS connections, SCRAM authentication and query-engine start-up, per process.
2. **The network isn't the cost.** Measured in production from inside the gateway container **[Measured-prod]**:

   | Stage                   |                                                             Time |
   | ----------------------- | ---------------------------------------------------------------: |
   | DNS (SRV, TXT, A+AAAA)  |                          0.5–2.3 ms (first `getaddrinfo` 5.4 ms) |
   | TCP connect             |                                                       **0.6 ms** |
   | TLS handshake incl. TCP | **37.5 ms** median (first 77 ms), mostly crypto, not round trips |

3. **A connection is about 7 round trips plus ~10–20 ms of server/crypto work.** **[Measured-lab]** In the lab, at a 31 ms RTT:

   | Lab stage                                            |                  Time |
   | ---------------------------------------------------- | --------------------: |
   | Pooled connection without auth (TCP + TLS + `hello`) |                133 ms |
   | Pooled connection with SCRAM auth                    |            195–250 ms |
   | **Authentication alone**                             | ≈ 75–100 ms ≈ 2–3 RTT |
   | Server discovery for a new client                    |               ~142 ms |
   | Command on an existing connection                    |      29–32 ms (1 RTT) |
   | Server selection once discovery has completed        |                   ≈ 0 |

4. **Applying production's RTT and TLS cost to that model predicts a cold client ready in roughly 100–150 ms, not 313–349 ms.** **[Inferred]** About **150–200 ms remains unexplained**. Candidates: SCRAM on the M0 proxy, Prisma query-engine start-up on the 2-vCPU host, CPU contention at that moment (13 Node processes plus a 17-query request on 2 vCPUs). Closing this gap needs one controlled production measurement (§12, **awaiting approval**).
5. **The cluster is Atlas M0 (free tier). [Measured]** The shard hosts are CNAMEs to `mtm-aws-apsouth1-0-m0-7-shard-0x…` ("mtm" = multi-tenant, "m0" = free tier). The connection math in §7 is bounded by M0's 500-connection limit, and the baseline's degradation at ~110 ops/s fits M0's documented operation throttling.
6. **Lab caution:** on this Mac's current network, OS `getaddrinfo` for A+AAAA takes **5,015 ms** (the AAAA query times out; IPv4-only takes 5.7 ms). Every new connection from this Mac currently pays that, which produced 5.2 s connection setups and 8 s Prisma first queries in early runs. **This is local only:** in production the same lookup takes 0.5–5.4 ms. All lab figures above use IPv4-only resolution.
7. **Memory:** the ~150 MB of "external" memory per gateway worker is **`geoip-lite`**: +140.9 MB external / +142 MB RSS per process at import. **[Measured-lab]** It's used only for login geolocation.

## 1. Measured connection establishment time

| Stage                                           | Production (in gateway container) |            Lab (Mac, IPv4-only, RTT ≈ 31 ms) |
| ----------------------------------------------- | --------------------------------: | -------------------------------------------: |
| SRV lookup / TXT lookup                         |           0.9–2.3 ms / 0.9–1.3 ms | ~1,030 ms in total (this network's resolver) |
| `getaddrinfo` A+AAAA / A only                   |              0.5–5.4 / 0.4–1.9 ms |                               5,015 / 5.7 ms |
| TCP connect                                     |          **0.6 ms** (median of 5) |                                        31 ms |
| TLS handshake incl. TCP                         |  **37.5 ms** median (first 77 ms) |                                      ~110 ms |
| Pooled connection, TCP + TLS + `hello`, no auth |          not measured (needs §12) |                                   **133 ms** |
| Pooled connection incl. SCRAM-SHA-256           |          not measured (needs §12) |                       **195–250 ms** (n = 5) |

**[Measured-lab]** Earlier today on a different network, connection setup from the same Mac took 210–330 ms (raw driver, 60-read bursts), consistent with these figures.

## 2. Pool checkout waiting

Lab, Node driver CMAP events, 10 concurrent reads on a client with one warm connection **[Measured-lab]**:

- checkout wait **p50 150–165 ms, max 390–444 ms**;
- 3 new connections opened, at most 2 at a time (`maxConnecting`);
- command time 30–35 ms throughout.

Earlier 60-read bursts: checkout wait p50 112–533 ms with the command round trip flat at ~31 ms, and `maxPoolSize` 10 vs 60 made no difference.

**Checkout wait is the time to create connections, not a shortage of pool slots.** In production, setup per connection should be roughly 40–100 ms rather than 200–250. **[Inferred]** Prisma exposes no checkout metrics for MongoDB; its `metrics` preview reports zeros (measured earlier).

## 3. Server selection

**[Measured-lab]** SDAM event trace of a cold client:

| t (ms after construction) | Event                                                                       |
| ------------------------: | --------------------------------------------------------------------------- |
|                     1,034 | topology opening (after SRV + TXT)                                          |
|               1,176–1,183 | first heartbeats from all 3 hosts (31–35 ms each) → `ReplicaSetWithPrimary` |
|                     1,428 | `connect()` resolves                                                        |
|                     1,458 | first ping (29 ms)                                                          |

Selection itself is immediate once discovery completes. The selection cost on a cold client is **discovery**: SRV/TXT plus TCP + TLS + `hello` to each host, in parallel. In production that should be ~40–80 ms, dominated by TLS. **[Inferred]**

## 4. TLS and authentication overhead

| Overhead                                                                       | Production                                                                  | Lab                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **TLS**                                                                        | **≈ 37 ms** (0.6 ms RTT, so ~36 ms is handshake crypto) **[Measured-prod]** | 110 − 31 (TCP) ≈ 79 ms ≈ 2 RTT + ~17 ms **[Measured-lab]**     |
| **SCRAM auth** (saslStart + saslContinue; the client derives keys with PBKDF2) | **unknown**                                                                 | ≈ 75–100 ms ≈ 2–3 RTT + ≤ 10 ms server work **[Measured-lab]** |

Production auth needs §12. The driver caches the client-side key per client, so it's paid once per client, not per connection. **[Docs]**

## 5. First query vs reused connection

|                              | Production                                                                 | Lab                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold client, first query     | **313–349 ms** (17 concurrent queries, 14:56:06) **[Measured-prod, logs]** | Node driver 29–34 ms _after_ a `connect()` of 1.4–2.8 s, dominated by this network's DNS. Prisma: `$connect` 38–62 ms (10–13 ms CPU); its first query was distorted by the 5 s AAAA timeout and is not used. |
| Cold process, master warm-up | 372–595 ms **[Measured-prod, logs]**                                       | —                                                                                                                                                                                                            |
| Reused connection            | network 0.6 ms + execution 0–2 ms (no direct sample)                       | **27–32 ms ≈ 1 RTT**                                                                                                                                                                                         |

The production endpoint medians (10–80 ms) are consistent with warm clients most of the time. The ~0.8 s `/dashboard/data` p95 is consistent with cold clients in the gateway and in the gRPC services the request fans out to.

## 6. Existing pool configuration

| Setting                   | Value                                                                                                                           | Source                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Driver                    | Prisma 5.22 query engine (Rust MongoDB driver) in every process; **no Node MongoDB driver in the image**                        | [Measured-prod]                                                             |
| Processes holding clients | gateway 2 workers (primary has no DB client); 11 gRPC services × 2 workers; scheduler 1                                         | [Measured-prod] (`WEB_CONCURRENCY` unset → `cpus()` = 2)                    |
| Master client             | 1 per process; URI without pool options                                                                                         | [Code] `prismaClient.ts`                                                    |
| Tenant clients            | 1 `PrismaClient` per tenant DB per process, created on first use; LRU cap 50; **evicted after 30 min idle** (sweep every 5 min) | [Code] `tenantClientPool.ts`                                                |
| `maxPoolSize`             | tenant clients **50**; master: driver default **10**                                                                            | [Code]; [Docs]                                                              |
| `minPoolSize`             | **0** (default)                                                                                                                 | [Docs]                                                                      |
| `maxConnecting`           | **2** (default)                                                                                                                 | [Docs]; matches the lab's "2 at a time"                                     |
| `maxIdleTimeMS`           | none (connections aren't reaped while the client lives)                                                                         | [Docs]                                                                      |
| `waitQueueTimeoutMS`      | none                                                                                                                            | [Docs]                                                                      |
| Monitoring connections    | **2 per server per client** (heartbeat + RTT) → 6 per client                                                                    | [Measured-prod]: 12 per container = 2 workers × 1 live client × 3 hosts × 2 |
| Observed at rest          | 152 Atlas connections from production: monitoring only, plus 1 gateway pool connection; tenant clients evicted                  | [Measured-prod]                                                             |

## 7. Total potential connections

Production has 25 client-holding processes (gateway 2 + services 22 + scheduler 1) and 4 tenant databases. Each live client costs 6 monitoring connections whether it's busy or not.

| Scenario                                                       |           Monitoring |          Application (query) |   Total |
| -------------------------------------------------------------- | -------------------: | ---------------------------: | ------: |
| At rest (measured)                                             |                  150 |                           ~1 | **152** |
| Every process has master + 4 tenant clients alive (no queries) | 25 × 5 × 6 = **750** |                            0 | **750** |
| Same, plus 1 warm query connection per client                  |                  750 |                          125 | **875** |
| Theoretical ceiling, 4 tenants (pools full)                    |                  750 |   25 × (10 + 4 × 50) = 5,250 |   6,000 |
| Theoretical ceiling, 50 cached tenants                         |  25 × 51 × 6 = 7,650 | 25 × (10 + 50 × 50) = 62,750 |  70,400 |

**On M0's 500-connection limit, about 2 tenant databases can have live clients in every process before monitoring connections alone hit the cap.** Each additional live tenant client set costs 150 connections across the deployment. The 30-minute eviction is, in effect, what keeps production under the cap today. **[Inferred from measured per-client cost]** This is why simply keeping clients alive longer, or raising `minPoolSize`, is not safe.

## 8. Memory impact of pool-warming options

| Option                                                                                                                                          | Effect on cold starts                                                                                                                                                                    | Extra Atlas connections                                   | Extra memory                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| A. `minPoolSize = 1` on tenant clients                                                                                                          | Only avoids pool-connection setup **while the client lives**. Connections aren't reaped anyway (no `maxIdleTimeMS`), so the gain is small. **Doesn't help first use or after eviction.** | +1 per live client (≤ +100 at 4 tenants)                  | negligible                                    |
| B. Longer or no idle eviction                                                                                                                   | Removes repeat cold clients                                                                                                                                                              | **+150 per active tenant, over the M0 cap at 3+ tenants** | +2.5 MB per client per process [Measured-lab] |
| C. `WEB_CONCURRENCY=1` for the 11 gRPC services (CPU ~0.003 cores each)                                                                         | Halves the independent pools that must warm per service                                                                                                                                  | **−66 at rest; ceilings halve**                           | **−~120 MB per service** (one worker's RSS)   |
| D. Pre-warm the tenant client when a session starts (e.g. on `/refresh-token`), in the background, gateway plus the services a page fans out to | Hides most first-use cold starts from users                                                                                                                                              | Same as today once used, but **earlier**                  | none extra                                    |
| E. Start-up warm-up of the master client (already exists: `warmUpDatabase`)                                                                     | Only the master client                                                                                                                                                                   | none                                                      | none                                          |
| F. Fewer clients per process (one client across tenant DBs)                                                                                     | Removes per-tenant discovery and engine start-up                                                                                                                                         | Big reduction                                             | Big reduction                                 |

Option F isn't possible with Prisma's fixed datasource URL; it needs an architectural change.

**The gateway's memory budget** (732 MiB peak of 768 MiB) is dominated by geoip-lite (§10), not by pools. The pool options above change memory by at most a few MB per client in the gateway.

## 9. Recommended solution (for approval; not implemented)

1. **Run the §12 production measurement** to attribute the remaining ~150–200 ms (auth vs engine start-up vs CPU contention) before choosing between options.
2. **If auth or TLS dominates** (likely on M0's shared proxy): reduce the number of cold clients, not pool sizes.
   - **C:** one worker for the gRPC services.
   - **D:** a bounded background pre-warm of the caller's tenant client on session start.
   - Keep the 30-minute eviction. Revisit it only if C frees enough of the connection budget.
3. **If engine start-up or CPU dominates:** the same C and D, plus avoid creating clients on the request path, e.g. by creating them at authentication time.
4. **Independently:** decide on the Atlas tier. M0's 500-connection limit and operation throttling cap both warmth and throughput. Any dedicated tier also removes the shared proxy from the TLS/auth path.
5. **Do not raise `maxPoolSize`.** It has no effect on cold-start cost (measured), and it raises the ceiling against a 500-connection limit.

## 10. Expected improvement

| Case                                                                                     | Today                                                                                                        | Expected                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Requests that currently hit a cold client (a large share of production's sparse traffic) | ~300–350 ms per affected request, more when a request fans out to several cold service processes in sequence | the warm path: per-query ~1–3 ms plus execution, endpoint medians 10–80 ms |
| `/dashboard/data` p95                                                                    | ~0.8 s                                                                                                       | ~100 ms                                                                    |

These are **[Inferred]** targets to verify with production per-route percentiles before and after (same method as `production-latency-verification.md`), and with the gateway's breakdown lines at a low sample rate.

## 11. Security and operational risks

| Area                                                | Risk / finding                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection budget (M0, 500)                         | Any warming that keeps more clients alive can exhaust the shared limit **for every tenant and for production as a whole**. Every option needs the §7 arithmetic redone.                                               |
| Pre-warming on session start                        | Must use the caller's verified tenant only (JWT-derived, as `getClientForDb` does today). Must be fire-and-forget and bounded, so a burst of logins can't open many clients at once.                                  |
| Fewer workers                                       | A single worker per service loses intra-container redundancy. A crash restarts the container (`restart` policy) instead of failing over to a sibling worker. CPU headroom per service is ample (0.003 cores average). |
| `isPrivileged` reorder (asked in §5 of the request) | See §13.                                                                                                                                                                                                              |

## 12. Controlled production measurement (awaiting approval; not run)

**Purpose:** attribute the ~150–200 ms gap between the measured network/TLS costs and the logged 313–349 ms cold-client time, using the application's own driver (Prisma) and configuration.

**Exact operation:** one short-lived Node process inside `hrms-prod-api-gateway` (`docker exec`). It:

1. loads secrets exactly as `bootstrap.ts` does (`loadSecrets` from `@hrms/common`, instance role, secret `hrms/config`);
2. creates **one** `PrismaClient` for one existing tenant database with the app's `maxPoolSize=50` URL, and the engine's query event logging (durations only);
3. times, with wall clock and process CPU:
   - construction;
   - `$connect()` (engine start-up + SRV + discovery + pool connection + auth);
   - one `tenantSettings.findFirst({ select: { id: true } })`, then a second identical read;
   - one burst of 5 concurrent identical reads;
4. calls `$disconnect()` and exits.

The same script also measures TCP + TLS + `hello` without credentials to the primary (raw socket, no auth) for the auth split.

**Expected impact:**

- About 6 monitoring + 1–3 query connections, for **≈ 3–5 seconds**, out of 152 in use against a limit of 500.
- 8 trivial index-backed reads, ~0.1 s of CPU, ~60 MB transient memory in a separate process. The running workers are untouched.
- Nothing is written, and nothing is printed except durations.

**Cleanup:** `$disconnect()` and process exit close every connection. Verified by re-reading `/proc/net/tcp` connection counts afterwards; they should return to the measured 13.

## 13. `isPrivileged`: can the database lookup go?

```ts
// handlers/approvalChains.ts (current)
const superUser = await isSuperUser(userId); // DB lookup (now request-scoped)
return superUser || hasPrivilegedRole(tenantRole); // JWT role (owner/admin)
```

**Decisions are identical if the role is checked first.** Because of the `||`, a privileged JWT role already yields `true` whatever the database says. Checking it first and skipping the lookup changes no decision when the database is up.

| Concern                            | Effect of the reorder                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deactivation / role revocation** | **No change, because there's nothing to weaken.** The current code doesn't use the lookup to deny privileged roles. `isSuperUser` doesn't read `employeeStatus`, and a deactivated owner/admin with a valid JWT is already admitted today until the token expires (the 24 h JWT-role gap in the phase-1 audit).            |
| **Database failure**               | **The one behavioural difference.** Today an owner/admin gets an error (500) if the superuser lookup fails. After the reorder they're admitted on their JWT role, as they would be when the database is up. This doesn't weaken authorisation (the outcome matches the success path) but it does change failure behaviour. |
| Non-privileged roles               | Unchanged: they still need the superuser lookup.                                                                                                                                                                                                                                                                           |

Recommendation: safe to implement as a separate, measured change. The same reorder applies to the copies of the pattern in `exitChecklist`, `exitInterviewTemplates`, `interviewPipelines`, `noticePeriodPolicies`, `payrollComponents` and `taxDeclaration`. The real fix for deactivation and role revocation is the separate JWT-role versioning item; this reorder neither helps nor hurts it.

## 14. Memory investigation: external memory per worker

**[Measured-prod]** per gateway worker (`/proc/<pid>/smaps_rollup`, largest mappings):

| Mapping                |           Size |
| ---------------------- | -------------: |
| RSS                    |     374–385 MB |
| Anonymous private      | **309–321 MB** |
| `node` binary (shared) |          49 MB |
| Prisma engine `.so`    |          11 MB |
| libstdc++ / libcrypto  |     2 / 1.5 MB |
| Threads                |  18 per worker |

Attribution:

| Suspect                                                             | Measured                                                                                                                                                        | Verdict                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **`geoip-lite`** (imported by `services/loginEventService.ts` only) | **+140.9 MB external, +139.3 MB ArrayBuffers, +142 MB RSS** at import; data files: city 76 MB, city6 59 MB, names 10 MB, country 10 + 4.5 MB **[Measured-lab]** | **Source of the ~150 MB external per worker** (≈ 280 MB of the gateway's 768 MiB across two workers) |
| Prisma query engine                                                 | first client +10 MB RSS, each further client +2.5 MB, 0 external **[Measured-lab]**                                                                             | Small                                                                                                |
| MongoDB driver buffers                                              | inside the Prisma engine (above)                                                                                                                                | Small                                                                                                |
| Redis (ioredis), gRPC                                               | not separately measured; no large mappings beyond the anonymous heap                                                                                            | Not indicated                                                                                        |
| Worker threads                                                      | 18 OS threads per worker (libuv + Prisma tokio runtime); no Node worker_threads                                                                                 | Normal                                                                                               |

Options, not implemented, for later:

- import `geoip-lite` lazily on first login event;
- move geolocation to a single process (e.g. auth-service) or to the scheduler/worker path;
- switch to a memory-mapped MaxMind reader (`maxmind` + `.mmdb`), shared via the page cache;
- use a country-only database if city precision isn't needed for login-risk scoring.

Expected saving: up to ~140 MB per gateway worker. Verify with the same `smaps_rollup` reading.
