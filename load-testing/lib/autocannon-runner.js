// One autocannon phase (warm-up or measurement) for a stage. Connections are
// spread over worker threads; each connection is driven by
// lib/request-picker.cjs. Per-route stats land in `statsDir`.
import autocannon from "autocannon";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { environment, ROOT } from "../config/environments.js";
import { PLAN_PATH } from "./plan.js";

const PICKER = resolve(ROOT, "lib/request-picker.cjs");
const require = createRequire(import.meta.url);

/**
 * @returns {{ promise: Promise<object>, stop: () => void }}
 */
export function runPhase({
  connections,
  durationSeconds,
  workers,
  timeoutSeconds,
  statsDir,
  salt,
}) {
  rmSync(statsDir, { recursive: true, force: true });
  mkdirSync(statsDir, { recursive: true });
  // Read by request-picker.cjs at load time (worker threads inherit env).
  process.env.LT_PLAN_FILE = PLAN_PATH;
  process.env.LT_STATS_DIR = statsDir;
  process.env.LT_WORKER_SALT = String(salt);

  const useWorkers = workers > 0 && connections >= workers;
  const instance = autocannon({
    url: environment.baseUrl,
    connections,
    duration: durationSeconds,
    pipelining: 1,
    timeout: timeoutSeconds,
    workers: useWorkers ? workers : undefined,
    // Worker mode needs a file path; single-threaded mode needs the function.
    setupClient: useWorkers ? PICKER : require(PICKER),
    method: "GET",
    // The picker replaces this on every request (GET only).
    path: `${environment.apiPrefix}/health`,
  });
  // In worker mode autocannon's stop() discards the workers' results and
  // never emits "done", so stop() settles the promise itself; the caller
  // then rebuilds totals from the per-route files (resultFromRouteStats).
  let settle;
  const promise = new Promise((resolveP, reject) => {
    settle = resolveP;
    instance.on("done", resolveP);
    instance.on("error", reject);
  });
  return {
    promise,
    stop: () => {
      instance.stop();
      settle({ stoppedEarly: true });
    },
  };
}

/** Merge every worker's per-route file. */
export function readRouteStats(statsDir) {
  const merged = {};
  let files = [];
  try {
    files = readdirSync(statsDir).filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files) {
    const data = JSON.parse(readFileSync(resolve(statsDir, f), "utf8"));
    for (const [route, s] of Object.entries(data)) {
      const m = (merged[route] ??= {
        n: 0,
        lost: 0,
        status: {},
        buckets: {},
        bytes: 0,
      });
      m.n += s.n;
      m.lost += s.lost;
      m.bytes += s.bytes;
      for (const [k, v] of Object.entries(s.status))
        m.status[k] = (m.status[k] ?? 0) + v;
      for (const [k, v] of Object.entries(s.buckets))
        m.buckets[k] = (m.buckets[k] ?? 0) + v;
    }
  }
  return merged;
}

/**
 * Autocannon-shaped totals from the picker's per-route counters, for a phase
 * that was stopped early. Connection errors aren't visible to the picker;
 * requests that never answered are counted as timeouts ("lost").
 */
export function resultFromRouteStats(routeStats, durationS) {
  let total = 0;
  let lost = 0;
  let non2xx = 0;
  let bytes = 0;
  const status = {};
  const buckets = {};
  for (const s of Object.values(routeStats)) {
    total += s.n;
    lost += s.lost;
    bytes += s.bytes;
    for (const [k, v] of Object.entries(s.status)) {
      status[k] = (status[k] ?? 0) + v;
      if (!k.startsWith("2")) non2xx += v;
    }
    for (const [k, v] of Object.entries(s.buckets))
      buckets[k] = (buckets[k] ?? 0) + v;
  }
  const q = (p) => {
    const e = Object.entries(buckets)
      .map(([b, n]) => [Number(b), n])
      .sort((a, b) => a[0] - b[0]);
    let seen = 0;
    for (const [b, n] of e) {
      seen += n;
      if (seen / total >= p) return 0.5 * 1.1 ** b;
    }
    return null;
  };
  return {
    source: "request-picker counters (autocannon stopped early)",
    requests: { total, average: total / Math.max(1, durationS) },
    throughput: { average: bytes / Math.max(1, durationS) },
    latency: {
      average: null,
      p50: q(0.5),
      p90: q(0.9),
      p97_5: q(0.975),
      p99: q(0.99),
      max: q(1),
    },
    statusCodeStats: Object.fromEntries(
      Object.entries(status).map(([k, v]) => [k, { count: v }]),
    ),
    non2xx,
    errors: 0,
    timeouts: lost,
    resets: 0,
  };
}
