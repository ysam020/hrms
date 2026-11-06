// Turns one stage's raw data (autocannon totals, per-route client stats,
// Prometheus, Loki, samplers) into numbers, threshold verdicts, a
// bottleneck diagnosis and prioritised findings. It only reports; it never
// changes code or configuration.
import { thresholds, guards } from "../config/thresholds.js";

const BASE = 0.5;
const RATIO = 1.1;
const bucketUpper = (b) => BASE * RATIO ** Number(b);

export function percentileFromBuckets(buckets, p) {
  const entries = Object.entries(buckets)
    .map(([b, n]) => [Number(b), n])
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return null;
  let seen = 0;
  for (const [b, n] of entries) {
    seen += n;
    if (seen / total >= p) return bucketUpper(b);
  }
  return bucketUpper(entries.at(-1)[0]);
}

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const max = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
};
const round = (x, d = 1) =>
  x === null || x === undefined || !Number.isFinite(x)
    ? null
    : Math.round(x * 10 ** d) / 10 ** d;

// Container CPU limits from docker-compose.loadtest.yml (cores).
const CPU_LIMITS = { "api-gateway": 1.0 };
const cpuLimit = (name) => CPU_LIMITS[name] ?? (name === "redis" ? null : 0.5);

export function summariseRoutes(routeStats, durationS) {
  const rows = Object.entries(routeStats).map(([route, s]) => {
    const ok = Object.entries(s.status)
      .filter(([k]) => k.startsWith("2") || k === "304")
      .reduce((a, [, v]) => a + v, 0);
    return {
      route,
      requests: s.n,
      rps: round(s.n / durationS, 2),
      p50Ms: round(percentileFromBuckets(s.buckets, 0.5)),
      p95Ms: round(percentileFromBuckets(s.buckets, 0.95)),
      p99Ms: round(percentileFromBuckets(s.buckets, 0.99)),
      errorPct: s.n ? round((100 * (s.n - ok)) / s.n, 2) : null,
      status: s.status,
      lost: s.lost,
      avgBytes: s.n ? Math.round(s.bytes / s.n) : null,
    };
  });
  return rows.sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0));
}

export function analyseStage({
  stage,
  connections,
  effectiveConnections,
  workers,
  result,
  routeStats,
  prom,
  loki,
  samples,
  measureMs,
  previous,
  aborted,
  atlasBaseline,
}) {
  const durationS = measureMs / 1000;
  const total = result.requests.total + result.errors + result.timeouts; // sent attempts
  const status = Object.fromEntries(
    Object.entries(result.statusCodeStats ?? {}).map(([k, v]) => [k, v.count]),
  );
  const rateLimited = status["429"] ?? 0;
  const non2xx = result.non2xx;
  const failed = non2xx + result.errors + result.timeouts;

  // Overall percentiles: merge every route's buckets (autocannon reports no p95).
  const allBuckets = {};
  for (const s of Object.values(routeStats))
    for (const [b, n] of Object.entries(s.buckets))
      allBuckets[b] = (allBuckets[b] ?? 0) + n;

  const containers = {};
  for (const s of samples) {
    if (!s.containers || s.containers.error) continue;
    for (const [name, c] of Object.entries(s.containers)) {
      const r = (containers[name] ??= {
        cpuPct: [],
        memBytes: [],
        memLimitBytes: c.memLimitBytes,
      });
      r.cpuPct.push(c.cpuPct);
      r.memBytes.push(c.memBytes);
    }
  }
  const containerRows = Object.entries(containers).map(([name, c]) => {
    const limit = cpuLimit(name);
    const medCpu = median(c.cpuPct);
    return {
      name,
      cpuMedianPct: round(medCpu),
      cpuMaxPct: round(max(c.cpuPct)),
      cpuLimitCores: limit,
      cpuOfLimitPct: limit ? round(medCpu / limit) : null, // docker % is per core
      memMaxMiB: round(max(c.memBytes) / 2 ** 20),
      memLimitMiB: c.memLimitBytes ? round(c.memLimitBytes / 2 ** 20) : null,
    };
  });

  const atlasRows = samples.map((s) => s.atlas).filter((a) => a && !a.error);
  const redisRows = samples.map((s) => s.redis).filter((r) => r && !r.error);
  const genCores = samples.map((s) => s.generator.cores);
  const generatorBusy = median(genCores);
  const generatorSaturated =
    generatorBusy !== null &&
    generatorBusy / (workers + 1) >= guards.generatorCpuSaturationPct / 100;

  const redisFirst = redisRows[0];
  const redisLast = redisRows.at(-1);
  const hits =
    redisLast && redisFirst
      ? redisLast.keyspaceHits - redisFirst.keyspaceHits
      : null;
  const misses =
    redisLast && redisFirst
      ? redisLast.keyspaceMisses - redisFirst.keyspaceMisses
      : null;

  // Gateway RSS: growth across the window and whether it kept rising.
  const rss = prom?.gateway?.rssTrendBytes ?? [];
  const third = Math.max(1, Math.floor(rss.length / 3));
  const avg = (xs) =>
    xs.length ? xs.reduce((a, [, v]) => a + v, 0) / xs.length : null;
  const rssStart = avg(rss.slice(0, third));
  const rssEnd = avg(rss.slice(-third));
  const rssGrowthPct = rssStart ? (100 * (rssEnd - rssStart)) / rssStart : null;

  const metrics = {
    stage,
    connections,
    effectiveConnections,
    durationS,
    requests: result.requests.total,
    rps: round(result.requests.average, 1),
    throughputMBps: round(result.throughput.average / 2 ** 20, 2),
    latency: {
      avgMs: round(result.latency.average),
      p50Ms: round(result.latency.p50),
      p90Ms: round(result.latency.p90),
      p95Ms: round(percentileFromBuckets(allBuckets, 0.95)), // merged route buckets (±5%)
      p97_5Ms: round(result.latency.p97_5),
      p99Ms: round(result.latency.p99),
      maxMs: round(result.latency.max),
    },
    status,
    non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
    resets: result.resets,
    failed,
    errorRatePct: total ? round((100 * failed) / total, 3) : null,
    timeoutRatePct: total ? round((100 * result.timeouts) / total, 3) : null,
    rateLimitedPct: total ? round((100 * rateLimited) / total, 3) : null,
    generator: {
      busyCoresMedian: round(generatorBusy, 2),
      workers,
      saturated: generatorSaturated,
      hostLoadAvgMax: round(max(samples.map((s) => s.generator.loadAvg1)), 2),
    },
    containers: containerRows,
    gatewayRssGrowthPct: round(rssGrowthPct),
    atlas: {
      baselineConnections: atlasBaseline?.connections ?? null,
      connectionsMax: max(atlasRows.map((a) => a.connections)),
      connectionsMedian: median(atlasRows.map((a) => a.connections)),
      opsPerSecMedian: round(median(atlasRows.map((a) => a.opsPerSec))),
      opsPerSecMax: round(max(atlasRows.map((a) => a.opsPerSec))),
      rttMsMedian: round(median(atlasRows.map((a) => a.rttMs))),
      rttMsMax: round(max(atlasRows.map((a) => a.rttMs))),
      netOutMBpsMedian: round(
        median(atlasRows.map((a) => a.netOutBps)) / 2 ** 20,
        2,
      ),
      samples: atlasRows.length,
    },
    redis: {
      connectedClientsMax: max(redisRows.map((r) => r.connectedClients)),
      opsPerSecMax: max(redisRows.map((r) => r.opsPerSec)),
      usedMemoryMiBMax: round(
        max(redisRows.map((r) => r.usedMemory)) / 2 ** 20,
      ),
      keyspaceHitRatioPct:
        hits !== null && hits + misses > 0
          ? round((100 * hits) / (hits + misses))
          : null,
      evictedKeys:
        redisLast && redisFirst
          ? redisLast.evictedKeys - redisFirst.evictedKeys
          : null,
      rejectedConnections:
        redisLast && redisFirst
          ? redisLast.rejectedConnections - redisFirst.rejectedConnections
          : null,
      blockedClientsMax: max(redisRows.map((r) => r.blockedClients)),
      appSideRedisP99Ms: round(prom?.cache?.redisP99Ms),
    },
  };

  // ── threshold verdicts ────────────────────────────────────────────────────
  const verdicts = [];
  const check = (name, value, t, unit = "") => {
    if (value === null || value === undefined)
      return verdicts.push({ name, value: null, verdict: "no data" });
    const verdict =
      value > t.fail
        ? "FAIL"
        : t.healthy !== undefined && value > t.healthy
          ? "degraded"
          : "healthy";
    verdicts.push({
      name,
      value: `${value}${unit}`,
      healthy: t.healthy,
      fail: t.fail,
      verdict,
    });
  };
  check("Error rate", metrics.errorRatePct, thresholds.errorRatePct, "%");
  check("P95 latency", metrics.latency.p95Ms, thresholds.p95Ms, " ms");
  check("P99 latency", metrics.latency.p99Ms, thresholds.p99Ms, " ms");
  check("Timeout rate", metrics.timeoutRatePct, thresholds.timeoutRatePct, "%");
  check(
    "HTTP 429 rate",
    metrics.rateLimitedPct,
    { fail: thresholds.rateLimitedPct.fail },
    "%",
  );
  const gw = containerRows.find((c) => c.name === "api-gateway");
  check(
    "Gateway CPU (of its limit, median)",
    gw?.cpuOfLimitPct ?? null,
    thresholds.cpuPct,
    "%",
  );
  const hottest = containerRows
    .filter((c) => c.cpuOfLimitPct !== null && c.name !== "api-gateway")
    .sort((a, b) => b.cpuOfLimitPct - a.cpuOfLimitPct)[0];
  check(
    `Hottest service CPU${hottest ? ` (${hottest.name})` : ""}`,
    hottest?.cpuOfLimitPct ?? null,
    thresholds.cpuPct,
    "%",
  );
  const memVerdict =
    rssGrowthPct !== null && rssGrowthPct > thresholds.memoryGrowthPct.fail;
  verdicts.push({
    name: "Gateway memory growth over window",
    value: rssGrowthPct === null ? null : `${round(rssGrowthPct)}%`,
    verdict: memVerdict
      ? "FAIL"
      : rssGrowthPct === null
        ? "no data"
        : "healthy",
  });
  const restarts = Object.entries(prom?.services?.restarts ?? {}).filter(
    ([, v]) => v > 0,
  );
  verdicts.push({
    name: "Process restarts",
    value: restarts.length
      ? restarts.map(([s, v]) => `${s}×${v}`).join(", ")
      : "0",
    verdict: restarts.length ? "FAIL" : "healthy",
  });
  const atlasConnFail =
    metrics.atlas.connectionsMax !== null &&
    metrics.atlas.connectionsMax >= guards.atlasConnectionsAbort;
  verdicts.push({
    name: "Atlas connections (max)",
    value: metrics.atlas.connectionsMax,
    fail: guards.atlasConnectionsAbort,
    verdict:
      metrics.atlas.connectionsMax === null
        ? "no data"
        : atlasConnFail
          ? "FAIL"
          : "healthy",
  });
  const redisFail =
    (metrics.redis.rejectedConnections ?? 0) > 0 ||
    (loki?.counts?.redisErrors &&
      Object.values(loki.counts.redisErrors).some((v) => v > 0));
  verdicts.push({
    name: "Redis",
    value: `rejected ${metrics.redis.rejectedConnections ?? "?"}, app-side p99 ${metrics.redis.appSideRedisP99Ms ?? "?"} ms`,
    verdict: redisFail ? "FAIL" : "healthy",
  });
  verdicts.push({
    name: "Load generator",
    value: `${metrics.generator.busyCoresMedian} busy cores / ${workers + 1} threads`,
    verdict: generatorSaturated ? "INVALID (generator-bound)" : "healthy",
  });

  const failedChecks = verdicts
    .filter((v) => v.verdict === "FAIL")
    .map((v) => v.name);
  const stop = aborted
    ? `aborted: ${aborted}`
    : failedChecks.length
      ? `failed: ${failedChecks.join(", ")}`
      : generatorSaturated
        ? "load generator saturated (results invalid beyond this point)"
        : null;

  // ── diagnosis ─────────────────────────────────────────────────────────────
  const routes = summariseRoutes(routeStats, durationS);
  const prevRoutes = Object.fromEntries(
    (previous?.routes ?? []).map((r) => [r.route, r]),
  );
  const slowed = routes
    .filter((r) => prevRoutes[r.route]?.p95Ms && r.p95Ms)
    .map((r) => ({
      route: r.route,
      from: prevRoutes[r.route].p95Ms,
      to: r.p95Ms,
      factor: round(r.p95Ms / prevRoutes[r.route].p95Ms, 2),
    }))
    .sort((a, b) => b.factor - a.factor)
    .slice(0, 5);
  const heavy = Object.entries(loki?.heavyByRoute ?? {})
    .map(([route, h]) => ({
      route,
      count: h.count,
      medianQueries: median(h.queries),
      medianDbMs: median(h.dbMs),
      medianTotalMs: median(h.totalMs),
      maxInFlight: h.maxInFlight,
    }))
    .sort((a, b) => b.count - a.count);

  const cpuBound = containerRows.filter(
    (c) =>
      c.cpuOfLimitPct !== null && c.cpuOfLimitPct >= thresholds.cpuPct.fail,
  );
  const lagMax = max(Object.values(prom?.services?.maxEventLoopLagP99s ?? {}));
  const atlasRttGrowth =
    atlasBaseline?.rttMs && metrics.atlas.rttMsMedian
      ? metrics.atlas.rttMsMedian / atlasBaseline.rttMs
      : null;
  let bottleneck;
  const evidence = [];
  if (generatorSaturated) {
    bottleneck = "load generator (results do not reflect server capacity)";
    evidence.push(
      `autocannon used ${metrics.generator.busyCoresMedian} cores for ${workers + 1} threads`,
    );
  } else if (cpuBound.length) {
    bottleneck = `CPU: ${cpuBound.map((c) => c.name).join(", ")}`;
    evidence.push(
      ...cpuBound.map(
        (c) =>
          `${c.name} median ${c.cpuOfLimitPct}% of its ${c.cpuLimitCores}-core limit`,
      ),
    );
  } else if (atlasConnFail) {
    bottleneck = "MongoDB Atlas connections (shared cluster limit)";
    evidence.push(
      `Atlas connections reached ${metrics.atlas.connectionsMax} (abort at ${guards.atlasConnectionsAbort})`,
    );
  } else if (redisFail) {
    bottleneck = "Redis";
    evidence.push(
      `rejected connections ${metrics.redis.rejectedConnections}, app-side p99 ${metrics.redis.appSideRedisP99Ms} ms`,
    );
  } else if (lagMax !== null && lagMax > 0.2) {
    bottleneck = "event-loop blocking";
    evidence.push(`event-loop lag p99 up to ${round(lagMax * 1000)} ms`);
  } else if (heavy.length || (atlasRttGrowth && atlasRttGrowth > 2)) {
    bottleneck = "database round trips / I/O wait (CPU not saturated)";
    if (heavy[0])
      evidence.push(
        `${heavy[0].route}: ${heavy[0].count} db-heavy requests, median ${heavy[0].medianQueries} queries and ${heavy[0].medianDbMs} ms of DB time, up to ${heavy[0].maxInFlight} queries in flight`,
      );
    if (atlasRttGrowth)
      evidence.push(
        `Atlas serverStatus RTT ${metrics.atlas.rttMsMedian} ms vs ${round(atlasBaseline.rttMs)} ms idle (×${round(atlasRttGrowth, 1)})`,
      );
  } else {
    bottleneck = "none identified at this stage";
  }

  const findings = [];
  const add = (priority, text) => findings.push({ priority, text });
  if (aborted) add("Critical", `Stage aborted by a live guard: ${aborted}.`);
  if (generatorSaturated)
    add(
      "Critical",
      "The load generator is CPU-bound; this stage and higher ones measure the generator, not Praesto.",
    );
  if (atlasConnFail)
    add(
      "Critical",
      `Atlas connections reached ${metrics.atlas.connectionsMax}; the shared cluster serves production too.`,
    );
  if (metrics.rateLimitedPct > 0)
    add(
      metrics.rateLimitedPct > thresholds.rateLimitedPct.fail
        ? "Critical"
        : "High",
      `${status["429"]} requests got HTTP 429: a rate limiter, not the app, limited part of this stage.`,
    );
  for (const v of verdicts.filter(
    (x) =>
      x.verdict === "FAIL" &&
      !["Atlas connections (max)", "HTTP 429 rate"].includes(x.name),
  ))
    add(
      "Critical",
      `${v.name} failed: ${v.value} (threshold ${v.fail ?? "—"}).`,
    );
  for (const v of verdicts.filter((x) => x.verdict === "degraded"))
    add("High", `${v.name} degraded: ${v.value} (healthy ≤ ${v.healthy}).`);
  for (const h of heavy.slice(0, 3))
    add(
      "High",
      `${h.route}: ${h.count} db-heavy requests (median ${h.medianQueries} queries, ${h.medianDbMs} ms DB time, ${h.maxInFlight} in flight).`,
    );
  for (const [k, s] of Object.entries(loki?.slowByModel ?? {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3))
    add("Medium", `Slow Prisma query ${k}: ${s.count}× (max ${s.maxMs} ms).`);
  const authFails = Object.values(loki?.counts?.authFailures ?? {}).reduce(
    (a, b) => a + (typeof b === "number" ? b : 0),
    0,
  );
  if (authFails)
    add(
      "High",
      `${authFails} log lines with 401/403 during the window: check token expiry or the smoke-validated role map.`,
    );
  for (const r of routes.filter((x) => (x.errorPct ?? 0) > 1).slice(0, 5))
    add(
      "High",
      `${r.route}: ${r.errorPct}% non-2xx (${JSON.stringify(r.status)}).`,
    );
  if (slowed[0] && slowed[0].factor > 2)
    add(
      "Medium",
      `Largest slow-down vs previous stage: ${slowed[0].route} p95 ${slowed[0].from} → ${slowed[0].to} ms (×${slowed[0].factor}).`,
    );
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  findings.sort((a, b) => order[a.priority] - order[b.priority]);

  const changes = previous
    ? {
        rpsChangePct: previous.metrics.rps
          ? round(
              (100 * (metrics.rps - previous.metrics.rps)) /
                previous.metrics.rps,
            )
          : null,
        p95ChangePct: previous.metrics.latency.p95Ms
          ? round(
              (100 * (metrics.latency.p95Ms - previous.metrics.latency.p95Ms)) /
                previous.metrics.latency.p95Ms,
            )
          : null,
        p99ChangePct: previous.metrics.latency.p99Ms
          ? round(
              (100 * (metrics.latency.p99Ms - previous.metrics.latency.p99Ms)) /
                previous.metrics.latency.p99Ms,
            )
          : null,
        errorRateFrom: previous.metrics.errorRatePct,
        slowedRoutes: slowed,
      }
    : null;

  // Degradation vs failure: a failure that appears with RPS still rising and
  // errors appearing suddenly is an immediate failure; rising latency with
  // flat RPS is gradual saturation.
  let mode = null;
  if (stop && previous) {
    const errJump =
      (metrics.errorRatePct ?? 0) >
      5 * Math.max(previous.metrics.errorRatePct ?? 0, 0.1);
    mode = errJump
      ? "immediate failure (errors jumped)"
      : "gradual degradation (latency rose, throughput plateaued)";
  }

  return {
    metrics,
    verdicts,
    stop,
    mode,
    bottleneck,
    evidence,
    findings,
    routes,
    heavy,
    changes,
    loki,
    prom,
  };
}
