#!/usr/bin/env node
// Runs the concurrency stages strictly one after another:
//   warm-up → measurement (live guards) → collect Prometheus/Loki for the
//   exact window → analyse → report → cooldown → wait until the stack is
//   idle → next stage, unless a stop condition was hit.
// Rate-limit overrides are applied once for the run and restored (and
// verified) in `finally`, on SIGINT/SIGTERM and on uncaught errors.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { environment, REPORTS_DIR, STATE_DIR } from "../config/environments.js";
import { guards } from "../config/thresholds.js";
import { stages } from "../config/stages.js";
import { readManifest } from "../lib/authentication.js";
import {
  readRouteStats,
  resultFromRouteStats,
  runPhase,
} from "../lib/autocannon-runner.js";
import { apiGet } from "../lib/http.js";
import { integrityDiff, integritySnapshot } from "../lib/integrity.js";
import {
  atlasSnapshot,
  gatewayIdleSignals,
  lokiWindow,
  openAtlas,
  prometheusWindow,
  startSamplers,
} from "../lib/monitoring-client.js";
import { expectedMix, PLAN_PATH } from "../lib/plan.js";
import { analyseStage } from "../lib/result-analyser.js";
import {
  writeStageReport,
  writeSummaryReport,
} from "../lib/report-generator.js";
import {
  applyRateLimitOverrides,
  down,
  LOADTEST_OVERRIDES,
  restoreRateLimits,
  waitHealthy,
} from "../lib/stack.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── preflight ───────────────────────────────────────────────────────────────
for (const [file, hint] of [
  [resolve(STATE_DIR, "manifest.json"), "seed the synthetic orgs"],
  [PLAN_PATH, "run scripts/smoke.js"],
  [resolve(STATE_DIR, "isolation.json"), "run scripts/verify-isolation.js"],
]) {
  if (!existsSync(file)) throw new Error(`Missing ${file}: ${hint} first.`);
}
const isolation = JSON.parse(
  readFileSync(resolve(STATE_DIR, "isolation.json"), "utf8"),
);
if (isolation.failed > 0)
  throw new Error("The last isolation check failed; refusing to run load.");
await waitHealthy(30_000);
const manifest = readManifest();
const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8"));
const sampleUser = plan.users.find((u) => u.role === "employee");
const sampleRequest = () =>
  apiGet("/get-holidays/" + new Date().getFullYear(), sampleUser.token);

const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const runDir = resolve(REPORTS_DIR, runId);
mkdirSync(runDir, { recursive: true });
const environmentNote =
  "Comparative benchmark: loadtest stack and autocannon on one MacBook Pro (M5 Pro, 15 cores, 48 GB; Docker VM 15 CPUs) with prod-equal container limits, against the shared Atlas cluster (also serving production). Not a measurement of production capacity.";

const atlas = await openAtlas();
const run = {
  runId,
  environmentNote,
  startedAt: new Date().toISOString(),
  config: { ...stages, guards },
  expectedMix: expectedMix(plan),
  stages: [],
  rateLimits: { overrides: LOADTEST_OVERRIDES, restored: null },
  integrity: { diffs: [] },
  limitations: [],
  nextSteps: [],
};

// ── restoration, whatever happens ───────────────────────────────────────────
let stackStopped = false;
let restored = false;
async function restore(reason) {
  if (restored) return;
  restored = true;
  log(`restoring rate limits (${reason})…`);
  try {
    if (stackStopped) {
      // Containers are gone; clearing the override file is all that's left.
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(STATE_DIR, "ratelimit.env"), "");
      run.rateLimits.restored = {
        ok: true,
        note: "stack stopped by a guard; override file cleared, no container running",
      };
    } else {
      run.rateLimits.restored = await restoreRateLimits(sampleRequest);
    }
    log(`rate limits restored: ${JSON.stringify(run.rateLimits.restored)}`);
  } catch (e) {
    run.rateLimits.restored = { ok: false, error: e.message };
    console.error(
      "RATE-LIMIT RESTORE FAILED — run `node scripts/stack.js restore-limits`:",
      e.message,
    );
  }
}
let current = null;
// A signal stops the load and lets the normal path restore limits, check
// integrity and write the summary; a hard exit follows if that hangs.
let interrupted = null;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (interrupted) return;
    interrupted = sig;
    log(`${sig}: stopping load; finishing the run report`);
    current?.stop();
    setTimeout(async () => {
      console.error(
        "run did not finish within 120 s of the signal; restoring and exiting",
      );
      await restore(sig);
      process.exit(130);
    }, 120_000).unref();
  });
}

// Live Atlas guard (1 s polls), used in warm-up and measurement alike.
// Crossing it stops the load and tears the stack down so its connections
// to the shared cluster are released at once.
let aborted = null;
let slowAtlasPolls = 0;
async function atlasGuard(a) {
  if (aborted || !a || a.error) return;
  slowAtlasPolls = a.rttMs > guards.atlasRttAbortMs ? slowAtlasPolls + 1 : 0;
  const connHit = a.connections >= guards.atlasConnectionsAbort;
  const rttHit = slowAtlasPolls >= guards.atlasThrottlePolls;
  if (!connHit && !rttHit) return;
  aborted = connHit
    ? `Atlas connections ${a.connections} ≥ ${guards.atlasConnectionsAbort}`
    : `Atlas round trip above ${guards.atlasRttAbortMs} ms for ${slowAtlasPolls} consecutive polls (cluster degraded for production too)`;
  current?.stop();
  log(`${aborted}: stopping the stack to release connections`);
  await down().catch((e) => console.error("stack down failed:", e.message));
  stackStopped = true;
}

// ── stages ──────────────────────────────────────────────────────────────────
let integrityBefore = null;
try {
  integrityBefore = await integritySnapshot(atlas, manifest);
  await applyRateLimitOverrides();
  log(`rate-limit overrides applied: ${JSON.stringify(LOADTEST_OVERRIDES)}`);

  let previous = null;
  for (const [i, connections] of stages.connections.entries()) {
    if (interrupted) {
      run.stopReason = `interrupted (${interrupted})`;
      break;
    }
    const workers = connections >= stages.workers ? stages.workers : 0;
    const effective = workers
      ? Math.floor(connections / workers) * workers
      : connections;
    const atlasBaseline = await atlasSnapshot(atlas);
    if (atlasBaseline.connections >= guards.atlasConnectionsAbort) {
      log(
        `Atlas already at ${atlasBaseline.connections} connections before stage ${connections}; not starting it.`,
      );
      run.stopReason = `Atlas connections ${atlasBaseline.connections} before stage ${connections}`;
      break;
    }

    // Warm-up (results discarded, but a broken warm-up still stops the run).
    log(`stage ${connections}: warm-up ${stages.warmupSeconds}s`);
    current = runPhase({
      connections,
      durationSeconds: stages.warmupSeconds,
      workers,
      timeoutSeconds: stages.timeoutSeconds,
      statsDir: resolve(STATE_DIR, "stats", `warmup-${connections}`),
      salt: i * 1000,
    });
    const warmGuard = startSamplers({
      atlas,
      pollSeconds: 3600,
      onAtlasSample: atlasGuard,
    });
    const warmStart = Date.now();
    let warm = await current.promise;
    warmGuard.stop();
    if (warm.stoppedEarly) {
      await sleep(1500);
      warm = resultFromRouteStats(
        readRouteStats(resolve(STATE_DIR, "stats", `warmup-${connections}`)),
        (Date.now() - warmStart) / 1000,
      );
    }
    if (interrupted && !aborted) {
      run.stopReason = `interrupted (${interrupted}) during warm-up of stage ${connections}`;
      break;
    }
    if (aborted) {
      run.stopReason = `stage ${connections} aborted during warm-up: ${aborted}`;
      run.stages.push({
        connections,
        abortedDuringWarmup: aborted,
        warmup: {
          source: warm.source ?? "autocannon",
          requests: warm.requests.total,
          rps: warm.requests.average,
          p50: warm.latency.p50,
          p99: warm.latency.p99,
          timeouts: warm.timeouts,
          non2xx: warm.non2xx,
          status: warm.statusCodeStats,
        },
      });
      log(run.stopReason);
      break;
    }
    const warmErr =
      (warm.errors + warm.timeouts + warm.non2xx) /
      Math.max(1, warm.requests.total + warm.errors + warm.timeouts);
    if (warmErr > 0.5) {
      log(
        `warm-up error rate ${(100 * warmErr).toFixed(1)}%: not measuring this stage`,
      );
      run.stopReason = `warm-up of stage ${connections} failed (${(100 * warmErr).toFixed(1)}% errors)`;
      break;
    }

    // Measurement with live guards.
    log(
      `stage ${connections}: measuring ${stages.measureSeconds}s (${effective} effective connections, ${workers} workers)`,
    );
    const statsDir = resolve(STATE_DIR, "stats", `measure-${connections}`);
    const startMs = Date.now();
    current = runPhase({
      connections,
      durationSeconds: stages.measureSeconds,
      workers,
      timeoutSeconds: stages.timeoutSeconds,
      statsDir,
      salt: i * 1000 + 500,
    });
    let lastStats = { n: 0, bad: 0, at: startMs };
    const sampler = startSamplers({
      atlas,
      pollSeconds: guards.pollSeconds,
      onAtlasSample: atlasGuard,
      onSample: async (s) => {
        if (aborted) return;
        // Rolling client error rate over the last ~10 s.
        if (s.at - lastStats.at >= 10_000) {
          const st = readRouteStats(statsDir);
          let n = 0;
          let bad = 0;
          for (const r of Object.values(st)) {
            n += r.n + r.lost;
            bad +=
              r.lost +
              Object.entries(r.status)
                .filter(([k]) => !k.startsWith("2"))
                .reduce((a, [, v]) => a + v, 0);
          }
          const dn = n - lastStats.n;
          const db = bad - lastStats.bad;
          lastStats = { n, bad, at: s.at };
          if (dn > 50 && (100 * db) / dn >= guards.liveErrorRatePct) {
            aborted = `live error rate ${((100 * db) / dn).toFixed(1)}% over the last 10 s`;
            log(aborted);
            current.stop();
          }
        }
      },
    });
    let result = await current.promise;
    const endMs = Date.now();
    const samples = sampler.stop();
    current = null;
    await sleep(1500); // last per-route flush from the workers
    const routeStats = readRouteStats(statsDir);
    if (result.stoppedEarly)
      result = resultFromRouteStats(routeStats, (endMs - startMs) / 1000);

    // Exact-window monitoring data (scrape interval is 15 s: wait one).
    await sleep(16_000);
    const [prom, loki] = await Promise.all([
      prometheusWindow(startMs, endMs).catch((e) => ({ error: e.message })),
      lokiWindow(startMs, endMs).catch((e) => ({ error: e.message })),
    ]);
    const analysis = analyseStage({
      stage: i + 1,
      connections,
      effectiveConnections: effective,
      workers,
      result,
      routeStats,
      prom,
      loki,
      samples,
      measureMs: endMs - startMs,
      previous,
      aborted: aborted ?? (interrupted ? `interrupted (${interrupted})` : null),
      atlasBaseline,
    });
    const meta = {
      runId,
      window: {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      },
      warmupS: stages.warmupSeconds,
      environmentNote,
      resultSource: result.source ?? "autocannon",
    };
    const report = writeStageReport(runDir, analysis, meta);
    run.stages.push({
      connections,
      window: meta.window,
      report,
      analysis: { ...analysis, prom: undefined, loki: undefined },
    });
    log(
      `stage ${connections}: ${analysis.metrics.rps} req/s, p50 ${analysis.metrics.latency.p50Ms} / p95 ${analysis.metrics.latency.p95Ms} / p99 ${analysis.metrics.latency.p99Ms} ms, errors ${analysis.metrics.errorRatePct}% → ${analysis.stop ?? "pass"}`,
    );
    log(`  bottleneck: ${analysis.bottleneck}`);
    previous = analysis;
    if (analysis.stop) {
      run.stopReason = `stage ${connections}: ${analysis.stop}`;
      break;
    }

    // Cooldown, then wait for the stack to go idle before the next stage.
    if (i < stages.connections.length - 1) {
      log(`cooldown ${stages.cooldownSeconds}s`);
      await sleep(stages.cooldownSeconds * 1000);
      const t0 = Date.now();
      for (;;) {
        const idle = await gatewayIdleSignals();
        const a = await atlasSnapshot(atlas).catch(() => null);
        const atlasOk = !a || a.connections < guards.atlasConnectionsAbort - 50;
        if (
          idle.rps <= stages.stabilise.maxResidualRps &&
          idle.eventLoopLagMs <= stages.stabilise.maxEventLoopLagMs &&
          atlasOk
        )
          break;
        if (Date.now() - t0 > stages.stabilise.maxWaitSeconds * 1000) {
          log(
            `stack not idle after ${stages.stabilise.maxWaitSeconds}s (rps ${idle.rps.toFixed(1)}, lag ${idle.eventLoopLagMs.toFixed(0)} ms, Atlas ${a?.connections}); stopping escalation`,
          );
          run.stopReason = "stack did not stabilise between stages";
          break;
        }
        await sleep(5000);
      }
      if (run.stopReason) break;
    }
  }
} catch (e) {
  run.error = e.stack ?? String(e);
  console.error(e);
} finally {
  current?.stop();
  await restore("run finished");
  try {
    if (integrityBefore)
      run.integrity.diffs = integrityDiff(
        integrityBefore,
        await integritySnapshot(atlas, manifest),
      );
  } catch (e) {
    run.integrity.diffs = [`integrity check failed: ${e.message}`];
  }
  await atlas.close().catch(() => {});
}

// ── summary ─────────────────────────────────────────────────────────────────
const analyses = run.stages.filter((s) => s.analysis).map((s) => s.analysis);
const passing = analyses.filter((a) => !a.stop);
const failing = analyses.find((a) => a.stop);
run.finishedAt = new Date().toISOString();
run.capacity = {
  sustainable: passing.at(-1)?.metrics ?? null,
  peak: analyses.map((a) => a.metrics).sort((x, y) => y.rps - x.rps)[0] ?? null,
  firstFailing: failing?.metrics ?? null,
  firstFailingReason: failing?.stop ?? run.stopReason ?? null,
  firstFailingConnections:
    failing?.metrics.connections ??
    run.stages.find((s) => s.abortedDuringWarmup)?.connections ??
    null,
  mode: failing?.mode ?? null,
  bottleneck: (failing ?? analyses.at(-1))?.bottleneck ?? null,
};
const observed = {};
const lastRoutes = analyses.at(-1)?.routes ?? [];
const totalReq = lastRoutes.reduce((s, r) => s + r.requests, 0);
for (const r of lastRoutes)
  observed[r.route] = r.requests / Math.max(1, totalReq);
run.observedMix = observed;
run.limitations = [
  "Load generator and application share one machine (15 cores): containers are capped at prod's per-container CPU/memory limits, but unlike prod's 2-vCPU host they don't compete for two cores. Treat absolute numbers as an optimistic comparative baseline, not production capacity.",
  "The database is the shared Atlas cluster (shared/Flex tier, 500-connection limit, also serving production). Its CPU, memory, disk I/O, query statistics and pool wait time can't be read on this tier; only serverStatus connections, op counters and network bytes, plus round-trip time, are reported.",
  "Network: client and gateway talk over loopback, and every database query crosses the internet to Atlas (~40 ms round trip). Production runs in AWS ap-south-1 close to Atlas, so per-query latency there is lower and per-request database time differs.",
  "No think time: each connection sends its next request as soon as the previous answers, so a connection is far more demanding than one human user.",
  "Prometheus scrapes every 15 s, so server-side figures for windows shorter than ~1 min are coarse.",
];
run.nextSteps = [
  "Per the agreed plan, apply one optimisation at a time (permission caching, bitmask, redundant permission queries, duplicate auth verification, tenant resolution/pools, algorithms, MongoDB queries/indexes, Redis) and re-run the same stages with this exact configuration.",
  "Keep the dataset and seed fixed between runs (seed.ts is deterministic); re-seed only after cleanup and note it in the comparison.",
];
const summary = writeSummaryReport(runDir, run);
log(`summary: ${summary}`);
if (run.error || !run.rateLimits.restored?.ok || run.integrity.diffs.length)
  process.exitCode = 1;
