// Healthy targets and failure thresholds. Initial guardrails, not universal
// standards; every value can be overridden with the env variable shown.
const env = process.env;
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

export const thresholds = {
  errorRatePct: {
    healthy: num(env.LT_ERR_HEALTHY, 0.5),
    fail: num(env.LT_ERR_FAIL, 2),
  },
  p95Ms: {
    healthy: num(env.LT_P95_HEALTHY, 1000),
    fail: num(env.LT_P95_FAIL, 2000),
  },
  p99Ms: {
    healthy: num(env.LT_P99_HEALTHY, 2000),
    fail: num(env.LT_P99_FAIL, 5000),
  },
  timeoutRatePct: { healthy: 0.05, fail: num(env.LT_TIMEOUT_FAIL, 1) },
  // Container CPU, as a share of the container's own CPU limit.
  cpuPct: { healthy: 70, fail: num(env.LT_CPU_FAIL, 90) },
  // Gateway RSS growth across the measurement window that, together with a
  // rising trend, counts as "continuous growth".
  memoryGrowthPct: { fail: num(env.LT_MEM_GROWTH_FAIL, 25) },
  // 429s mean a rate limiter, not the application, is the limit.
  rateLimitedPct: { fail: num(env.LT_429_FAIL, 0.5) },
};

// Live guards checked every few seconds DURING a stage. Crossing one stops
// the load immediately (and for Atlas, tears the stack down so its
// connections are released): the cluster is shared with production.
export const guards = {
  pollSeconds: num(env.LT_GUARD_POLL_S, 2),
  // Atlas reports a 500-connection limit; production + dev already use
  // ~80–140. Stop well before the limit.
  atlasConnectionsAbort: num(env.LT_ATLAS_CONN_ABORT, 400),
  // Abort when the cluster itself is badly degraded for everyone: the
  // serverStatus round trip (idle 35–75 ms; 567 ms median at 10 connections
  // on 2026-11-05) stays above this for N consecutive 1 s polls.
  atlasRttAbortMs: num(env.LT_ATLAS_RTT_ABORT_MS, 2000),
  atlasThrottlePolls: num(env.LT_ATLAS_THROTTLE_POLLS, 5),
  // Rolling (last 10 s) client error rate that aborts mid-stage.
  liveErrorRatePct: num(env.LT_LIVE_ERR_ABORT, 20),
  // Load generator: average busy cores per worker thread above this share
  // means the generator, not the server, is the bottleneck.
  generatorCpuSaturationPct: num(env.LT_GEN_CPU_SAT, 85),
};
