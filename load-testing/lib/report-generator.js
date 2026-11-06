// Markdown + JSON reports: one per stage, one summary per run. Tokens and
// connection strings are never part of any input here.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const fmt = (v, unit = "") =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : `${typeof v === "number" ? v.toLocaleString("en-US") : v}${unit}`;
const table = (head, rows) =>
  [
    `| ${head.join(" | ")} |`,
    `|${head.map((h, i) => (i === 0 ? "---" : "---:")).join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

export function writeStageReport(dir, a, meta) {
  mkdirSync(dir, { recursive: true });
  const m = a.metrics;
  const base = resolve(
    dir,
    `stage-${String(a.metrics.connections).padStart(5, "0")}`,
  );
  writeFileSync(`${base}.json`, JSON.stringify({ meta, ...a }, null, 2));

  const lines = [
    `# Stage: ${m.connections.toLocaleString("en-US")} connections`,
    "",
    `Run ${meta.runId} · measured ${meta.window.start} → ${meta.window.end} (${m.durationS} s after a ${meta.warmupS} s warm-up) · ${meta.environmentNote}`,
    "",
    a.stop
      ? `**Stop condition: ${a.stop}.**${a.mode ? ` Mode: ${a.mode}.` : ""}`
      : "**All configured thresholds passed.**",
    "",
    `Bottleneck: **${a.bottleneck}**${a.evidence.length ? `\n\n${a.evidence.map((e) => `- ${e}`).join("\n")}` : ""}`,
    "",
    `## Client-side results (${meta.resultSource})`,
    "",
    table(
      ["Metric", "Value"],
      [
        ["Connections (effective)", fmt(m.effectiveConnections)],
        ["Total requests", fmt(m.requests)],
        ["Requests/s (mean)", fmt(m.rps)],
        ["Throughput", fmt(m.throughputMBps, " MiB/s")],
        [
          "Latency mean / p50 / p90",
          `${fmt(m.latency.avgMs)} / ${fmt(m.latency.p50Ms)} / ${fmt(m.latency.p90Ms)} ms`,
        ],
        [
          "Latency p95* / p97.5 / p99 / max",
          `${fmt(m.latency.p95Ms)} / ${fmt(m.latency.p97_5Ms)} / ${fmt(m.latency.p99Ms)} / ${fmt(m.latency.maxMs)} ms`,
        ],
        [
          "Status codes",
          Object.entries(m.status)
            .map(([k, v]) => `${k}: ${v.toLocaleString("en-US")}`)
            .join(", ") || "—",
        ],
        [
          "Non-2xx / connection errors / timeouts / resets",
          `${fmt(m.non2xx)} / ${fmt(m.errors)} / ${fmt(m.timeouts)} / ${fmt(m.resets)}`,
        ],
        [
          "Error rate / timeout rate / 429 rate",
          `${fmt(m.errorRatePct, "%")} / ${fmt(m.timeoutRatePct, "%")} / ${fmt(m.rateLimitedPct, "%")}`,
        ],
        [
          "Load generator",
          `${fmt(m.generator.busyCoresMedian)} busy cores (median) for ${m.generator.workers} workers + main; host load avg max ${fmt(m.generator.hostLoadAvgMax)}${m.generator.saturated ? " — **SATURATED**" : ""}`,
        ],
      ],
    ),
    "",
    "*p95 comes from the merged per-route histograms (log buckets, ±5%); autocannon itself reports no p95.",
    "",
    "## Threshold verdicts",
    "",
    table(
      ["Check", "Value", "Healthy", "Fail", "Verdict"],
      a.verdicts.map((v) => [
        v.name,
        fmt(v.value),
        fmt(v.healthy),
        fmt(v.fail),
        v.verdict,
      ]),
    ),
    "",
    "## Changes vs previous stage",
    "",
    a.changes
      ? [
          `RPS ${fmt(a.changes.rpsChangePct, "%")}, p95 ${fmt(a.changes.p95ChangePct, "%")}, p99 ${fmt(a.changes.p99ChangePct, "%")}, error rate ${fmt(a.changes.errorRateFrom, "%")} → ${fmt(m.errorRatePct, "%")}.`,
          "",
          a.changes.slowedRoutes.length
            ? table(
                [
                  "Route (largest p95 increase)",
                  "Previous p95",
                  "This p95",
                  "Factor",
                ],
                a.changes.slowedRoutes.map((s) => [
                  s.route,
                  fmt(s.from, " ms"),
                  fmt(s.to, " ms"),
                  `×${s.factor}`,
                ]),
              )
            : "",
        ].join("\n")
      : "First stage of the run.",
    "",
    "## Per-endpoint results (client side, slowest p95 first)",
    "",
    table(
      [
        "Endpoint",
        "Requests",
        "RPS",
        "p50 ms",
        "p95 ms",
        "p99 ms",
        "Non-2xx %",
        "Lost",
        "Avg bytes",
      ],
      a.routes.map((r) => [
        r.route,
        fmt(r.requests),
        fmt(r.rps),
        fmt(r.p50Ms),
        fmt(r.p95Ms),
        fmt(r.p99Ms),
        fmt(r.errorPct),
        fmt(r.lost),
        fmt(r.avgBytes),
      ]),
    ),
    "",
    "## Server side (Prometheus, exact stage window)",
    "",
    table(
      ["Metric", "Value"],
      [
        [
          "Gateway RPS",
          fmt(a.prom?.gateway?.rps && Math.round(a.prom.gateway.rps)),
        ],
        [
          "Gateway p50 / p95 / p99",
          `${fmt(a.prom?.gateway?.p50Ms && Math.round(a.prom.gateway.p50Ms))} / ${fmt(a.prom?.gateway?.p95Ms && Math.round(a.prom.gateway.p95Ms))} / ${fmt(a.prom?.gateway?.p99Ms && Math.round(a.prom.gateway.p99Ms))} ms`,
        ],
        ["Gateway RSS growth over window", fmt(m.gatewayRssGrowthPct, "%")],
        [
          "Event-loop lag p99 (max, by service)",
          Object.entries(a.prom?.services?.maxEventLoopLagP99s ?? {})
            .map(
              ([s, v]) =>
                `${s.replace("loadtest-", "")} ${Math.round(v * 1000)} ms`,
            )
            .join(", ") || "—",
        ],
        [
          "CPU cores used (Prometheus, by service)",
          Object.entries(a.prom?.services?.cpuCores ?? {})
            .map(([s, v]) => `${s.replace("loadtest-", "")} ${v.toFixed(2)}`)
            .join(", ") || "—",
        ],
        [
          "GC time (s/s, by service)",
          Object.entries(a.prom?.services?.gcSecondsPerSecond ?? {})
            .filter(([, v]) => v > 0.001)
            .map(([s, v]) => `${s.replace("loadtest-", "")} ${v.toFixed(3)}`)
            .join(", ") || "—",
        ],
        [
          "Process restarts",
          Object.entries(a.prom?.services?.restarts ?? {})
            .filter(([, v]) => v > 0)
            .map(([s, v]) => `${s} ${v}`)
            .join(", ") || "none",
        ],
        [
          "Scrape targets down",
          (a.prom?.services?.scrapeDown ?? []).join(", ") || "none",
        ],
        [
          "gRPC non-OK outcomes",
          (Array.isArray(a.prom?.grpc?.nonOk) ? a.prom.grpc.nonOk : [])
            .filter((r) => r.count > 0)
            .map(
              (r) =>
                `${r.service.replace("loadtest-", "")} ${r.outcome} ${Math.round(r.count)}`,
            )
            .join(", ") || "none",
        ],
        [
          "Cache operations (app CacheManager)",
          (Array.isArray(a.prom?.cache?.operations)
            ? a.prom.cache.operations
            : []
          )
            .filter((r) => r.count > 0)
            .map((r) => `${r.result ?? r.op ?? "?"} ${Math.round(r.count)}`)
            .join(", ") || "—",
        ],
      ],
    ),
    "",
    "### Containers (docker stats; CPU % is per core)",
    "",
    table(
      [
        "Container",
        "CPU median %",
        "CPU max %",
        "Limit (cores)",
        "Median % of limit",
        "Mem max MiB",
        "Mem limit MiB",
      ],
      m.containers.map((c) => [
        c.name,
        fmt(c.cpuMedianPct),
        fmt(c.cpuMaxPct),
        fmt(c.cpuLimitCores),
        fmt(c.cpuOfLimitPct),
        fmt(c.memMaxMiB),
        fmt(c.memLimitMiB),
      ]),
    ),
    "",
    "### MongoDB Atlas (shared cluster; serverStatus sampled every few seconds)",
    "",
    table(
      ["Metric", "Value"],
      [
        [
          "Connections idle baseline → median / max",
          `${fmt(m.atlas.baselineConnections)} → ${fmt(m.atlas.connectionsMedian)} / ${fmt(m.atlas.connectionsMax)}`,
        ],
        [
          "Ops/s median / max (cluster-wide, includes production)",
          `${fmt(m.atlas.opsPerSecMedian)} / ${fmt(m.atlas.opsPerSecMax)}`,
        ],
        [
          "serverStatus round trip median / max",
          `${fmt(m.atlas.rttMsMedian)} / ${fmt(m.atlas.rttMsMax)} ms`,
        ],
        ["Network out (median)", fmt(m.atlas.netOutMBpsMedian, " MiB/s")],
        [
          "Not measurable on this tier",
          "CPU, memory, disk I/O, query execution stats, connection-pool wait time (no Atlas API access, profiler/$queryStats/getLog disallowed)",
        ],
      ],
    ),
    "",
    "### Redis (the stack's own instance)",
    "",
    table(
      ["Metric", "Value"],
      [
        ["Connected clients (max)", fmt(m.redis.connectedClientsMax)],
        ["Ops/s (max)", fmt(m.redis.opsPerSecMax)],
        [
          "Keyspace hit ratio over window",
          fmt(m.redis.keyspaceHitRatioPct, "%"),
        ],
        [
          "App-side Redis command p99 (cache_redis_duration_ms)",
          fmt(m.redis.appSideRedisP99Ms, " ms"),
        ],
        ["Used memory (max)", fmt(m.redis.usedMemoryMiBMax, " MiB")],
        [
          "Evicted keys / rejected connections / blocked clients (max)",
          `${fmt(m.redis.evictedKeys)} / ${fmt(m.redis.rejectedConnections)} / ${fmt(m.redis.blockedClientsMax)}`,
        ],
      ],
    ),
    "",
    "## Loki (exact stage window, loadtest services only)",
    "",
    table(
      ["Pattern", "Lines by service"],
      Object.entries(a.loki?.counts ?? {}).map(([k, v]) => [
        k,
        v && !v.error
          ? Object.entries(v)
              .map(([s, n]) => `${s.replace("loadtest-", "")} ${n}`)
              .join(", ") || "0"
          : `error: ${v?.error ?? "?"}`,
      ]),
    ),
    "",
    a.heavy.length
      ? table(
          [
            "db-heavy route",
            "Count",
            "Median queries",
            "Median DB ms",
            "Median total ms",
            "Max in flight",
          ],
          a.heavy.map((h) => [
            h.route,
            fmt(h.count),
            fmt(h.medianQueries),
            fmt(h.medianDbMs),
            fmt(h.medianTotalMs),
            fmt(h.maxInFlight),
          ]),
        )
      : "No db-heavy request lines.",
    "",
    Object.keys(a.loki?.slowByModel ?? {}).length
      ? table(
          ["Slow Prisma query", "Count", "Max ms", "Mean ms"],
          Object.entries(a.loki.slowByModel)
            .sort((x, y) => y[1].count - x[1].count)
            .slice(0, 15)
            .map(([k, s]) => [
              k,
              fmt(s.count),
              fmt(s.maxMs),
              fmt(Math.round(s.sumMs / s.count)),
            ]),
        )
      : "No slow Prisma query lines (threshold 300 ms).",
    "",
    a.loki?.errorSamples?.length
      ? `Error samples:\n\n\`\`\`\n${a.loki.errorSamples.join("\n")}\n\`\`\``
      : "No error-level log lines.",
    "",
    "## Findings (prioritised; nothing was changed automatically)",
    "",
    a.findings.length
      ? a.findings.map((f) => `- **${f.priority}:** ${f.text}`).join("\n")
      : "- None.",
    "",
  ];
  writeFileSync(`${base}.md`, lines.join("\n"));
  return `${base}.md`;
}

export function writeSummaryReport(dir, run) {
  const measured = run.stages.filter((s) => s.analysis);
  const rows = measured.map((s) => s.analysis.metrics);
  const warmupAborts = run.stages.filter((s) => s.abortedDuringWarmup);
  const lines = [
    `# Load-test summary: ${run.runId}`,
    "",
    `${run.environmentNote}`,
    "",
    `Started ${run.startedAt}, finished ${run.finishedAt}. Stages measured: ${rows.map((r) => r.connections).join(", ") || "none"}${warmupAborts.length ? `; aborted during warm-up: ${warmupAborts.map((s) => `${s.connections} (${s.abortedDuringWarmup})`).join(", ")}` : ""}. Stop reason: ${run.stopReason ?? "—"}. Warm-up ${run.config.warmupSeconds} s, measurement ${run.config.measureSeconds} s, cooldown ${run.config.cooldownSeconds} s, pipelining 1, timeout ${run.config.timeoutSeconds} s, ${run.config.workers} autocannon workers.`,
    "",
    "## Capacity",
    "",
    table(
      ["Result", "Value"],
      [
        [
          "Maximum sustainable concurrency (last stage passing every threshold)",
          fmt(run.capacity.sustainable?.connections),
        ],
        [
          "Throughput at that stage",
          fmt(run.capacity.sustainable?.rps, " req/s"),
        ],
        [
          "p95 / p99 at that stage",
          run.capacity.sustainable
            ? `${fmt(run.capacity.sustainable.latency.p95Ms)} / ${fmt(run.capacity.sustainable.latency.p99Ms)} ms`
            : "—",
        ],
        [
          "Maximum achieved throughput (any stage)",
          run.capacity.peak
            ? `${fmt(run.capacity.peak.rps)} req/s at ${fmt(run.capacity.peak.connections)} connections`
            : "—",
        ],
        [
          "First failing stage",
          run.capacity.firstFailingConnections
            ? `${fmt(run.capacity.firstFailingConnections)} (${run.capacity.firstFailingReason})`
            : "none (stopped by configuration)",
        ],
        ["Failure mode", run.capacity.mode ?? "—"],
        ["Main bottleneck", run.capacity.bottleneck ?? "—"],
      ],
    ),
    "",
    "## Stage comparison",
    "",
    table(
      [
        "Concurrency",
        "RPS",
        "P50 ms",
        "P95 ms",
        "P99 ms",
        "Error rate",
        "Gateway CPU % of limit",
        "Gateway mem max MiB",
        "Verdict",
      ],
      measured.map(({ analysis: a }) => {
        const m = a.metrics;
        const gw = m.containers.find((c) => c.name === "api-gateway");
        return [
          fmt(m.connections),
          fmt(m.rps),
          fmt(m.latency.p50Ms),
          fmt(m.latency.p95Ms),
          fmt(m.latency.p99Ms),
          fmt(m.errorRatePct, "%"),
          fmt(gw?.cpuOfLimitPct),
          fmt(gw?.memMaxMiB),
          a.stop ?? "pass",
        ];
      }),
    ),
    "",
    "## MongoDB and Redis by stage",
    "",
    table(
      [
        "Concurrency",
        "Atlas conns max",
        "Atlas ops/s median",
        "Atlas RTT median ms",
        "Redis ops/s max",
        "Redis hit %",
        "App Redis p99 ms",
        "db-heavy lines",
      ],
      measured.map(({ analysis: a }) => {
        const m = a.metrics;
        return [
          fmt(m.connections),
          fmt(m.atlas.connectionsMax),
          fmt(m.atlas.opsPerSecMedian),
          fmt(m.atlas.rttMsMedian),
          fmt(m.redis.opsPerSecMax),
          fmt(m.redis.keyspaceHitRatioPct),
          fmt(m.redis.appSideRedisP99Ms),
          fmt(a.heavy.reduce((s, h) => s + h.count, 0)),
        ];
      }),
    ),
    "",
    "## Most expensive endpoints (highest p95 at the last completed stage)",
    "",
    table(
      ["Endpoint", "p50 ms", "p95 ms", "p99 ms", "Share of requests"],
      (measured.at(-1)?.analysis.routes ?? [])
        .slice(0, 12)
        .map((r) => [
          r.route,
          fmt(r.p50Ms),
          fmt(r.p95Ms),
          fmt(r.p99Ms),
          fmt(
            Math.round(
              (1000 * r.requests) /
                Math.max(1, measured.at(-1).analysis.metrics.requests),
            ) / 10,
            "%",
          ),
        ]),
    ),
    "",
    "## Run integrity",
    "",
    `- Rate limits: overrides ${JSON.stringify(run.rateLimits.overrides)} applied for the run; restored ${run.rateLimits.restored?.ok ? "and verified" : "**NOT verified**"} (${JSON.stringify(run.rateLimits.restored)}).`,
    `- Read-only check (synthetic databases + their master rows, before vs after): ${run.integrity.diffs.length ? `**changed**: ${run.integrity.diffs.join("; ")}` : "no changes"}.`,
    `- Workload: GET only; request mix per endpoint is in \`summary.json\` (expected vs observed).`,
    "",
    "## Infrastructure limitations of this measurement",
    "",
    ...run.limitations.map((l) => `- ${l}`),
    "",
    "## Recommended next steps",
    "",
    ...run.nextSteps.map((l) => `- ${l}`),
    "",
  ];
  writeFileSync(resolve(dir, "summary.md"), lines.join("\n"));
  writeFileSync(resolve(dir, "summary.json"), JSON.stringify(run, null, 2));
  return resolve(dir, "summary.md");
}
