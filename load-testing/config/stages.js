// Sequential concurrency stages. "Connections" = concurrent keep-alive
// connections, each acting as one signed-in person who requests the next page
// as soon as the previous response arrives (closed loop, no think time). It is
// NOT the number of human users (real people pause between clicks, so N
// connections stand in for many more people) and NOT requests per second
// (that is the measured outcome).
const env = process.env;
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

function stageList() {
  if (env.LT_STAGES)
    return env.LT_STAGES.split(",").map((s) => Number(s.trim()));
  // 100, 500, 1000, 1500, 2000, then +500 until a stop condition or the cap.
  const out = [100, 500, 1000, 1500, 2000];
  const cap = num(env.LT_MAX_CONNECTIONS, 5000);
  for (let c = 2500; c <= cap; c += 500) out.push(c);
  return out.filter((c) => c <= cap);
}

export const stages = {
  connections: stageList(),
  warmupSeconds: num(env.LT_WARMUP_S, 30),
  measureSeconds: num(env.LT_MEASURE_S, 120),
  cooldownSeconds: num(env.LT_COOLDOWN_S, 60),
  pipelining: 1,
  // Per-request timeout (autocannon counts a timeout and reconnects).
  timeoutSeconds: num(env.LT_TIMEOUT_S, 10),
  // Autocannon worker threads (the load generator is CPU-bound; more workers
  // spread it over cores; 0 = single-threaded). Autocannon gives each worker
  // floor(connections / workers) connections, so 5 keeps every default stage
  // exact. The runner records the real total.
  workers: num(env.LT_WORKERS, 5),
  // After cooldown, wait until the stack looks idle before the next stage.
  stabilise: {
    maxWaitSeconds: num(env.LT_STABILISE_MAX_S, 120),
    // Gateway request rate (in-flight proxy: no in-flight gauge is exported)
    // and event-loop lag must drop below these.
    maxResidualRps: 2,
    maxEventLoopLagMs: 50,
  },
};
