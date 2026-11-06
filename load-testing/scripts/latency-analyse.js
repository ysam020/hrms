#!/usr/bin/env node
// Turns a latency-sample-*.json into the end-to-end breakdown tables used by
// docs/performance/latency-root-cause-analysis.md. Pure post-processing.
//
// usage: node scripts/latency-analyse.js reports/latency-sample-<ts>.json
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, "utf8"));
const q = (xs, p) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length
    ? Math.round(v[Math.min(v.length - 1, Math.floor(p * v.length))] * 10) / 10
    : null;
};
const med = (xs) => q(xs, 0.5);

// Critical-path depth: number of sequential "waves" of external waits
// (an op that starts after every earlier op has ended begins a new wave).
function waves(ops) {
  const sorted = [...ops].sort((a, b) => a[1] - b[1]);
  let depth = 0;
  let frontier = -Infinity;
  for (const [, start, dur] of sorted) {
    if (start >= frontier) {
      depth++;
      frontier = start + dur;
    } else frontier = Math.max(frontier, start + dur);
  }
  return depth;
}
function unionOf(ops) {
  const s = [...ops].sort((a, b) => a[1] - b[1]);
  let tot = 0;
  let cs = -1;
  let ce = -1;
  for (const [, st, d] of s) {
    const en = st + d;
    if (st > ce) {
      if (ce > cs) tot += ce - cs;
      cs = st;
      ce = en;
    } else if (en > ce) ce = en;
  }
  if (ce > cs) tot += ce - cs;
  return tot;
}

const rows = data.samples.filter((s) => s.server && s.status < 400);
const warm = rows.filter((s) => s.phase === "warm" && s.server.overlap === 0);
const cold = rows.filter((s) => s.phase === "cold");

function breakdown(set) {
  const by = {};
  for (const s of set) (by[s.endpoint] ??= []).push(s);
  return Object.entries(by)
    .map(([endpoint, xs]) => {
      const sv = xs.map((x) => x.server);
      const kindUnion = (kind) =>
        sv.map((v) =>
          unionOf(
            (v.ops ?? []).filter(
              (o) =>
                o[0].startsWith(kind === "db" ? "master:" : kind) ||
                (kind === "db" && o[0].startsWith("tenant:")),
            ),
          ),
        );
      const masterUser = sv.map(
        (v) =>
          (v.ops ?? []).filter((o) => o[0].startsWith("master:User.")).length,
      );
      return {
        endpoint,
        n: xs.length,
        clientMs: med(xs.map((x) => x.clientMs)),
        serverMs: med(sv.map((v) => v.totalMs)),
        preRouteMs: med(sv.map((v) => v.middlewareMs)),
        authN: med(sv.map((v) => v.stages?.authenticate?.n ?? 0)),
        authMs: med(sv.map((v) => v.stages?.authenticate?.ms ?? 0)),
        rlMs: med(
          sv.map(
            (v) =>
              (v.stages?.["rateLimit:general"]?.ms ?? 0) +
              (v.stages?.["rateLimit:default"]?.ms ?? 0),
          ),
        ),
        subMs: med(sv.map((v) => v.stages?.requireActiveSubscription?.ms ?? 0)),
        queries: med(sv.map((v) => v.queries)),
        masterUserLookups: med(masterUser),
        dbSumMs: med(sv.map((v) => v.dbMs)),
        dbUnionMs: med(kindUnion("db")),
        maxInFlight: med(sv.map((v) => v.maxInFlight)),
        waves: med(sv.map((v) => waves(v.ops ?? []))),
        redisCalls: med(sv.map((v) => v.redisCalls)),
        redisMs: med(sv.map((v) => v.redisMs)),
        grpcCalls: med(sv.map((v) => v.downstreamCalls)),
        grpcMs: med(sv.map((v) => v.downstreamMs)),
        ioBusyMs: med(sv.map((v) => v.ioBusyMs)),
        nonIoMs: med(sv.map((v) => v.nonIoMs)),
        serializeMs: med(sv.map((v) => v.serializeMs)),
        cpuMs: med(sv.map((v) => v.cpuMs)),
        bytes: med(xs.map((x) => x.bytes)),
      };
    })
    .sort((a, b) => b.serverMs - a.serverMs);
}

const allOps = (set) => set.flatMap((s) => s.server.ops ?? []);
const opStats = (ops, prefix) => {
  const d = ops.filter((o) => o[0].startsWith(prefix)).map((o) => o[2]);
  return {
    n: d.length,
    p50: q(d, 0.5),
    p90: q(d, 0.9),
    p99: q(d, 0.99),
    max: q(d, 1),
  };
};
const burstRows = rows.filter((s) => s.phase.startsWith("burst"));
const seqDash = warm.filter(
  (s) =>
    s.endpoint.startsWith("dashboard") && s.path.startsWith("/dashboard/data"),
);

const totals = (set) => {
  const sv = set.map((s) => s.server);
  const sum = (f) => sv.reduce((a, v) => a + (f(v) ?? 0), 0);
  const total = sum((v) => v.totalMs);
  return {
    requests: set.length,
    serverMsTotal: Math.round(total),
    shareIoPct: Math.round((100 * sum((v) => v.ioBusyMs)) / total),
    shareNonIoPct: Math.round((100 * sum((v) => v.nonIoMs)) / total),
    cpuShareOfServerPct: Math.round((100 * sum((v) => v.cpuMs)) / total),
    serializeSharePct:
      Math.round((1000 * sum((v) => v.serializeMs)) / total) / 10,
    authSharePct:
      Math.round((1000 * sum((v) => v.stages?.authenticate?.ms ?? 0)) / total) /
      10,
    clientMinusServerMedMs: med(set.map((s) => s.clientMs - s.server.totalMs)),
  };
};

const result = {
  file,
  window: [data.startedAt, data.endedAt],
  totalsWarm: totals(warm),
  totalsCold: totals(cold),
  opsWarm: {
    db: opStats(allOps(warm), "master:").n + opStats(allOps(warm), "tenant:").n,
    master: opStats(allOps(warm), "master:"),
    tenant: opStats(allOps(warm), "tenant:"),
    redis: opStats(allOps(warm), "redis:"),
    redisRateLimit: opStats(allOps(warm), "redis:ratelimit"),
    grpc: opStats(allOps(warm), "grpc:"),
  },
  opsCold: {
    master: opStats(allOps(cold), "master:"),
    tenant: opStats(allOps(cold), "tenant:"),
    grpc: opStats(allOps(cold), "grpc:"),
  },
  dashboardDbOps: {
    sequential: opStats(allOps(seqDash), "tenant:"),
    sequentialMaster: opStats(allOps(seqDash), "master:"),
    burst: opStats(allOps(burstRows), "tenant:"),
    burstMaster: opStats(allOps(burstRows), "master:"),
    burstServerMs: med(burstRows.map((s) => s.server.totalMs)),
    sequentialServerMs: med(seqDash.map((s) => s.server.totalMs)),
  },
  warm: breakdown(warm),
  cold: breakdown(cold),
};
const out = file.replace(/\.json$/, "-analysis.json");
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(
  JSON.stringify(
    {
      totalsWarm: result.totalsWarm,
      totalsCold: result.totalsCold,
      opsWarm: result.opsWarm,
      opsCold: result.opsCold,
      dashboardDbOps: result.dashboardDbOps,
    },
    null,
    1,
  ),
);
console.log("\nWARM per endpoint (medians, overlap 0):");
console.log(
  "endpoint | client | server | preRoute | auth n/ms | rl | sub | q | mUser | dbSum | dbUnion | inFl | waves | redis n/ms | grpc n/ms | io | nonIo | ser | cpu | bytes",
);
for (const r of result.warm)
  console.log(
    [
      r.endpoint,
      r.clientMs,
      r.serverMs,
      r.preRouteMs,
      `${r.authN}/${r.authMs}`,
      r.rlMs,
      r.subMs,
      r.queries,
      r.masterUserLookups,
      r.dbSumMs,
      r.dbUnionMs,
      r.maxInFlight,
      r.waves,
      `${r.redisCalls}/${r.redisMs}`,
      `${r.grpcCalls}/${r.grpcMs}`,
      r.ioBusyMs,
      r.nonIoMs,
      r.serializeMs,
      r.cpuMs,
      r.bytes,
    ].join(" | "),
  );
console.log(`\n→ ${out}`);
