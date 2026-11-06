// Reads monitoring data for an exact time window: Prometheus and Loki through
// their HTTP APIs (the same datasources Grafana shows; querying them
// directly avoids needing a Grafana API token in a script), plus samplers
// for what the existing monitoring doesn't collect: container CPU/memory
// (docker stats; no cAdvisor), the shared Atlas cluster (serverStatus over
// one read-only connection; no MongoDB exporter), the stack's Redis (INFO;
// no Redis exporter) and the load generator itself.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { environment } from "../config/environments.js";

const execFileP = promisify(execFile);
const SVC = `service=~"${environment.serviceLabelPrefix}.*"`;
const GW = `service="${environment.serviceLabelPrefix}api-gateway"`;

// ── Prometheus ──────────────────────────────────────────────────────────────
async function promQuery(query, atSec) {
  const url = new URL("/api/v1/query", environment.prometheusUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("time", String(atSec));
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "success")
    throw new Error(`PromQL failed: ${query}: ${json.error}`);
  return json.data.result.map((r) => ({
    labels: r.metric,
    value: Number(r.value[1]),
  }));
}

async function promRange(query, startSec, endSec, stepSec = 5) {
  const url = new URL("/api/v1/query_range", environment.prometheusUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("start", String(startSec));
  url.searchParams.set("end", String(endSec));
  url.searchParams.set("step", String(stepSec));
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "success")
    throw new Error(`PromQL failed: ${query}: ${json.error}`);
  return json.data.result.map((r) => ({
    labels: r.metric,
    values: r.values.map(([t, v]) => [t, Number(v)]),
  }));
}

const byLabel = (rows, label) =>
  Object.fromEntries(rows.map((r) => [r.labels[label] ?? "", r.value]));

/**
 * Server-side metrics for [startMs, endMs]. Every query is evaluated at the
 * window's end over exactly the window's length, so earlier runs never leak
 * in. Only metrics the services actually export are queried.
 */
export async function prometheusWindow(startMs, endMs) {
  const end = Math.floor(endMs / 1000);
  const w = `${Math.max(15, Math.round((endMs - startMs) / 1000))}s`;
  const q = (expr) => promQuery(expr, end).catch((e) => ({ error: e.message }));
  const [
    httpRate,
    httpStatus,
    httpP50,
    httpP95,
    httpP99,
    routeP95,
    routeRate,
    grpcRate,
    grpcP95,
    grpcErr,
    cpu,
    rss,
    heap,
    lag,
    gc,
    cacheOps,
    cacheRedisP99,
    up,
    restarts,
  ] = await Promise.all([
    q(`sum(rate(http_requests_total{${GW}}[${w}]))`),
    q(`sum by (status) (increase(http_requests_total{${GW}}[${w}]))`),
    q(
      `histogram_quantile(0.5, sum by (le) (rate(http_request_duration_ms_bucket{${GW}}[${w}])))`,
    ),
    q(
      `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket{${GW}}[${w}])))`,
    ),
    q(
      `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_ms_bucket{${GW}}[${w}])))`,
    ),
    q(
      `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_ms_bucket{${GW}}[${w}])))`,
    ),
    q(`sum by (route) (rate(http_requests_total{${GW}}[${w}]))`),
    q(`sum by (service, method) (rate(grpc_requests_total{${SVC}}[${w}]))`),
    q(
      `histogram_quantile(0.95, sum by (le, service, method) (rate(grpc_request_duration_ms_bucket{${SVC}}[${w}])))`,
    ),
    q(
      `sum by (service, outcome) (increase(grpc_requests_total{${SVC}, outcome!="ok"}[${w}]))`,
    ),
    q(`sum by (service) (rate(process_cpu_seconds_total{${SVC}}[${w}]))`),
    q(
      `max_over_time(sum by (service) (process_resident_memory_bytes{${SVC}})[${w}:5s])`,
    ),
    q(
      `max_over_time(sum by (service) (nodejs_heap_size_used_bytes{${SVC}})[${w}:5s])`,
    ),
    q(
      `max_over_time(max by (service) (nodejs_eventloop_lag_p99_seconds{${SVC}})[${w}:5s])`,
    ),
    q(`sum by (service) (rate(nodejs_gc_duration_seconds_sum{${SVC}}[${w}]))`),
    q(
      `sum by (service, result) (increase(cache_operations_total{${SVC}}[${w}]))`,
    ),
    q(
      `histogram_quantile(0.99, sum by (le) (rate(cache_redis_duration_ms_bucket{${SVC}}[${w}])))`,
    ),
    q(`min_over_time(up{stack="loadtest"}[${w}])`),
    q(`sum by (service) (changes(process_start_time_seconds{${SVC}}[${w}]))`),
  ]);
  const one = (rows) => (Array.isArray(rows) && rows[0] ? rows[0].value : null);
  const rssTrend = await promRange(
    `sum(process_resident_memory_bytes{${GW}})`,
    Math.floor(startMs / 1000),
    end,
    10,
  ).catch(() => []);
  return {
    window: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    },
    gateway: {
      rps: one(httpRate),
      statusCounts: Array.isArray(httpStatus)
        ? byLabel(httpStatus, "status")
        : httpStatus,
      p50Ms: one(httpP50),
      p95Ms: one(httpP95),
      p99Ms: one(httpP99),
      routeP95Ms: Array.isArray(routeP95)
        ? byLabel(routeP95, "route")
        : routeP95,
      routeRps: Array.isArray(routeRate)
        ? byLabel(routeRate, "route")
        : routeRate,
      rssTrendBytes: rssTrend[0]?.values ?? [],
    },
    grpc: {
      rps: Array.isArray(grpcRate)
        ? grpcRate.map((r) => ({ ...r.labels, rps: r.value }))
        : grpcRate,
      p95Ms: Array.isArray(grpcP95)
        ? grpcP95.map((r) => ({ ...r.labels, p95Ms: r.value }))
        : grpcP95,
      nonOk: Array.isArray(grpcErr)
        ? grpcErr.map((r) => ({ ...r.labels, count: r.value }))
        : grpcErr,
    },
    services: {
      cpuCores: Array.isArray(cpu) ? byLabel(cpu, "service") : cpu,
      maxRssBytes: Array.isArray(rss) ? byLabel(rss, "service") : rss,
      maxHeapUsedBytes: Array.isArray(heap) ? byLabel(heap, "service") : heap,
      maxEventLoopLagP99s: Array.isArray(lag) ? byLabel(lag, "service") : lag,
      gcSecondsPerSecond: Array.isArray(gc) ? byLabel(gc, "service") : gc,
      restarts: Array.isArray(restarts)
        ? byLabel(restarts, "service")
        : restarts,
      scrapeDown: Array.isArray(up)
        ? up.filter((r) => r.value === 0).map((r) => r.labels.service)
        : up,
    },
    cache: {
      operations: Array.isArray(cacheOps)
        ? cacheOps.map((r) => ({ ...r.labels, count: r.value }))
        : cacheOps,
      redisP99Ms: one(cacheRedisP99),
    },
  };
}

/** Gateway in-flight work proxy + event-loop lag right now (stabilisation). */
export async function gatewayIdleSignals() {
  const now = Math.floor(Date.now() / 1000);
  const [rate, lag] = await Promise.all([
    promQuery(`sum(rate(http_requests_total{${GW}}[30s]))`, now).catch(
      () => [],
    ),
    promQuery(`max(nodejs_eventloop_lag_p99_seconds{${GW}})`, now).catch(
      () => [],
    ),
  ]);
  return {
    rps: rate[0]?.value ?? 0,
    eventLoopLagMs: (lag[0]?.value ?? 0) * 1000,
  };
}

// ── Loki ────────────────────────────────────────────────────────────────────
const LOG_PATTERNS = {
  dbHeavyRequests: '|= "db-heavy request"',
  slowPrismaQueries: '|= "slow prisma query"',
  errors: '| level="error"',
  timeouts:
    '|~ "(?i)timed? ?out|ETIMEDOUT|deadline exceeded|DEADLINE_EXCEEDED"',
  connectionErrors:
    '|~ "(?i)ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|connection (closed|refused|reset)|pool (exhaust|timeout)|MongoServerSelectionError|P1001|P2024"',
  redisErrors: '|~ "(?i)redis.*(error|timeout|reconnect)|ioredis"',
  unhandled: '|~ "(?i)unhandled(promise)?rejection|uncaught"',
  memory: '|~ "(?i)heap out of memory|ENOMEM|allocation failed"',
  authFailures: '|~ "\\"status\\":(401|403)"',
  serverErrors: '|~ "\\"status\\":5[0-9][0-9]"',
};

async function lokiCount(selector, startMs, endMs) {
  const url = new URL("/loki/api/v1/query", environment.lokiUrl);
  const secs = Math.max(1, Math.round((endMs - startMs) / 1000));
  url.searchParams.set(
    "query",
    `sum by (service) (count_over_time(${selector}[${secs}s]))`,
  );
  url.searchParams.set("time", String(endMs * 1e6));
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "success") return { error: json.error ?? res.status };
  return Object.fromEntries(
    json.data.result.map((r) => [r.metric.service, Number(r.value[1])]),
  );
}

async function lokiLines(selector, startMs, endMs, limit = 400) {
  const url = new URL("/loki/api/v1/query_range", environment.lokiUrl);
  url.searchParams.set("query", selector);
  url.searchParams.set("start", String(startMs * 1e6));
  url.searchParams.set("end", String(endMs * 1e6));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "success") return [];
  return json.data.result.flatMap((s) => s.values.map(([, line]) => line));
}

const jsonTail = (line) => {
  const i = line.indexOf("{");
  try {
    return i >= 0 ? JSON.parse(line.slice(i)) : null;
  } catch {
    return null;
  }
};

/** Counts per log pattern and service, plus parsed db-heavy/slow-query detail. */
export async function lokiWindow(startMs, endMs) {
  const base = `{service=~"${environment.serviceLabelPrefix}.*"}`;
  const counts = {};
  for (const [name, filter] of Object.entries(LOG_PATTERNS)) {
    counts[name] = await lokiCount(`${base} ${filter}`, startMs, endMs).catch(
      (e) => ({ error: e.message }),
    );
  }
  const heavy = (
    await lokiLines(`${base} |= "db-heavy request"`, startMs, endMs)
  )
    .map(jsonTail)
    .filter(Boolean);
  const slow = (
    await lokiLines(`${base} |= "slow prisma query"`, startMs, endMs)
  )
    .map(jsonTail)
    .filter(Boolean);
  const errorSamples = (
    await lokiLines(`${base} | level="error"`, startMs, endMs, 20)
  ).map((l) => l.slice(0, 300));

  const heavyByRoute = {};
  for (const h of heavy) {
    const r = (heavyByRoute[h.route] ??= {
      count: 0,
      queries: [],
      dbMs: [],
      totalMs: [],
      maxInFlight: 0,
    });
    r.count++;
    r.queries.push(h.queries);
    r.dbMs.push(h.dbMs);
    r.totalMs.push(h.totalMs);
    r.maxInFlight = Math.max(r.maxInFlight, h.maxInFlight ?? 0);
  }
  const slowByModel = {};
  for (const s of slow) {
    const k = `${s.scope ?? "?"}:${s.model}.${s.action}`;
    const r = (slowByModel[k] ??= { count: 0, maxMs: 0, sumMs: 0 });
    r.count++;
    r.maxMs = Math.max(r.maxMs, s.ms);
    r.sumMs += s.ms;
  }
  return {
    counts,
    heavyByRoute,
    slowByModel,
    errorSamples,
    sampled: { heavy: heavy.length, slow: slow.length },
  };
}

// ── Samplers (run during a stage) ───────────────────────────────────────────
function redisInfo() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(environment.redis.port, environment.redis.host);
    let buf = "";
    sock.setTimeout(3000, () => sock.destroy(new Error("redis INFO timeout")));
    sock.on("connect", () => sock.write("INFO\r\n"));
    sock.on("data", (d) => {
      buf += d.toString();
      const header = buf.match(/^\$(\d+)\r\n/);
      if (
        header &&
        Buffer.byteLength(buf) >= header[0].length + Number(header[1])
      ) {
        sock.end();
        const info = {};
        for (const line of buf.slice(header[0].length).split("\r\n")) {
          const i = line.indexOf(":");
          if (i > 0) info[line.slice(0, i)] = line.slice(i + 1);
        }
        resolve(info);
      }
    });
    sock.on("error", reject);
  });
}

async function dockerStats() {
  const { stdout } = await execFileP(
    "docker",
    [
      "stats",
      "--no-stream",
      "--format",
      "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const toBytes = (s) => {
    const m = s.trim().match(/^([\d.]+)\s*([KMG]i?B|B)$/);
    if (!m) return null;
    const mult = {
      B: 1,
      KiB: 1024,
      MiB: 1024 ** 2,
      GiB: 1024 ** 3,
      KB: 1e3,
      MB: 1e6,
      GB: 1e9,
    }[m[2]];
    return Number(m[1]) * mult;
  };
  const out = {};
  for (const line of stdout.trim().split("\n")) {
    const [name, cpu, mem] = line.split("\t");
    if (!name.startsWith(`${environment.composeProject}-`)) continue;
    const [used, limit] = mem.split("/");
    out[
      name.replace(`${environment.composeProject}-`, "").replace(/-\d+$/, "")
    ] = {
      cpuPct: Number(cpu.replace("%", "")),
      memBytes: toBytes(used),
      memLimitBytes: toBytes(limit),
    };
  }
  return out;
}

export async function openAtlas() {
  const uri = JSON.parse(
    readFileSync(environment.secretsFile, "utf8"),
  ).DEV_MONGODB_URI;
  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    minPoolSize: 1,
    appName: "praesto-loadtest-monitor",
  });
  await client.connect();
  return client;
}

async function atlasStatus(client) {
  const t0 = performance.now();
  const s = await client.db("admin").command({ serverStatus: 1 });
  const rttMs = performance.now() - t0;
  const o = s.opcounters;
  const ops = [
    "insert",
    "query",
    "update",
    "delete",
    "getmore",
    "command",
  ].reduce((a, k) => a + Number(o[k] ?? 0), 0);
  return {
    connections: s.connections?.current ?? null,
    available: s.connections?.available ?? null,
    ops,
    bytesIn: Number(s.network?.bytesIn ?? 0),
    bytesOut: Number(s.network?.bytesOut ?? 0),
    rttMs,
  };
}

/**
 * Samples every `pollSeconds` until stopped. `onSample` runs live guards.
 * Each sampler fails independently: a missing reading is recorded, never
 * invented.
 */
export function startSamplers({
  atlas,
  pollSeconds,
  atlasPollSeconds = 1,
  onSample,
  onAtlasSample,
}) {
  const samples = [];
  let stopped = false;
  let prevCpu = process.cpuUsage();
  let prevT = performance.now();
  let prevAtlas = null;
  let latestAtlas = null;

  // The Atlas guard runs on its own, faster loop: it must not wait behind
  // `docker stats` (~2 s) while the shared cluster's connections climb.
  const atlasTick = async () => {
    if (stopped || !atlas) return;
    const at = Date.now();
    try {
      const a = await atlasStatus(atlas);
      const dt = prevAtlas ? (at - prevAtlas.at) / 1000 : null;
      latestAtlas = {
        at,
        connections: a.connections,
        available: a.available,
        rttMs: a.rttMs,
        opsPerSec: prevAtlas && dt ? (a.ops - prevAtlas.ops) / dt : null,
        netInBps: prevAtlas && dt ? (a.bytesIn - prevAtlas.bytesIn) / dt : null,
        netOutBps:
          prevAtlas && dt ? (a.bytesOut - prevAtlas.bytesOut) / dt : null,
      };
      prevAtlas = { ...a, at };
    } catch (e) {
      latestAtlas = { at, error: String(e.message ?? e) };
    }
    try {
      await onAtlasSample?.(latestAtlas);
    } catch {}
    if (!stopped) atlasTimer = setTimeout(atlasTick, atlasPollSeconds * 1000);
  };
  let atlasTimer = setTimeout(atlasTick, 0);

  const tick = async () => {
    if (stopped) return;
    const at = Date.now();
    const [dstats, rinfo] = await Promise.allSettled([
      dockerStats(),
      redisInfo(),
    ]);
    const cpu = process.cpuUsage();
    const now = performance.now();
    const elapsedUs = (now - prevT) * 1000;
    const generatorCores =
      (cpu.user - prevCpu.user + cpu.system - prevCpu.system) / elapsedUs;
    prevCpu = cpu;
    prevT = now;
    const atlasSample = latestAtlas;
    const r = rinfo.status === "fulfilled" ? rinfo.value : null;
    const sample = {
      at,
      generator: {
        cores: generatorCores,
        loadAvg1: os.loadavg()[0],
        hostCpus: os.cpus().length,
      },
      containers:
        dstats.status === "fulfilled"
          ? dstats.value
          : { error: String(dstats.reason?.message ?? dstats.reason) },
      redis: r
        ? {
            connectedClients: Number(r.connected_clients),
            blockedClients: Number(r.blocked_clients),
            opsPerSec: Number(r.instantaneous_ops_per_sec),
            usedMemory: Number(r.used_memory),
            keyspaceHits: Number(r.keyspace_hits),
            keyspaceMisses: Number(r.keyspace_misses),
            evictedKeys: Number(r.evicted_keys),
            rejectedConnections: Number(r.rejected_connections),
          }
        : { error: String(rinfo.reason?.message ?? rinfo.reason) },
      atlas: atlasSample,
    };
    samples.push(sample);
    try {
      await onSample?.(sample, samples);
    } catch {}
    if (!stopped) timer = setTimeout(tick, pollSeconds * 1000);
  };
  let timer = setTimeout(tick, 0);
  return {
    samples,
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(atlasTimer);
      return samples;
    },
  };
}

export async function atlasSnapshot(atlas) {
  return atlasStatus(atlas);
}
