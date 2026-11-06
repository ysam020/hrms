#!/usr/bin/env node
// Before/after comparison for request-scoped user-access resolution, from two
// latency-sample files taken with identical sampler settings. Warm requests
// only (passes 1..n, overlap 0) unless --cold. Latency improvement is
// (before − after) / before; counts are per request.
//
// usage: node scripts/permission-compare.js <before.json> <after.json> [--out file.md]
import { readFileSync, writeFileSync } from "node:fs";

const [beforeFile, afterFile] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const outIdx = process.argv.indexOf("--out");
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const B = load(beforeFile);
const A = load(afterFile);

const q = (xs, p) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null;
};
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r = (x, d = 1) =>
  x === null || !Number.isFinite(x)
    ? "—"
    : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("en-US");
const pct = (b, a) =>
  b && Number.isFinite(b) && Number.isFinite(a)
    ? `${(((b - a) / b) * 100).toFixed(1)}%`
    : "—";

function waves(ops) {
  const s = [...ops].sort((x, y) => x[1] - y[1]);
  let n = 0;
  let front = -Infinity;
  for (const [, st, d] of s) {
    if (st >= front) {
      n++;
      front = st + d;
    } else front = Math.max(front, st + d);
  }
  return n;
}

function rows(d, phase) {
  return d.samples
    .filter(
      (s) =>
        s.server &&
        s.status < 400 &&
        s.phase === phase &&
        (s.server.overlap ?? 0) === 0,
    )
    .map((s) => {
      const ops = s.server.ops ?? [];
      const userFind = ops.filter((o) => o[0] === "master:User.findUnique");
      return {
        endpoint: s.endpoint,
        role: s.role,
        serverMs: s.server.totalMs,
        clientMs: s.clientMs,
        queries: s.server.queries,
        userFindUnique: userFind.length,
        userFindUniqueMs: sum(userFind.map((o) => o[2])),
        accessLookups: s.server.stages?.["userAccess:lookup"]?.n ?? null,
        accessLookupMs: s.server.stages?.["userAccess:lookup"]?.ms ?? null,
        accessReuses: s.server.stages?.["userAccess:reuse"]?.n ?? null,
        dbSumMs: s.server.dbMs,
        dbBusyMs: s.server.dbBusyMs,
        waves: waves(ops),
      };
    });
}

function summary(rs) {
  // The access-resolver stages exist only in the "after" code.
  const hasStages = rs.some(
    (x) => x.accessLookups !== null || x.accessReuses !== null,
  );
  return {
    n: rs.length,
    userFindUnique: mean(rs.map((x) => x.userFindUnique)),
    userFindUniqueMs: mean(rs.map((x) => x.userFindUniqueMs)),
    accessLookups: hasStages ? mean(rs.map((x) => x.accessLookups ?? 0)) : null,
    accessLookupMs: hasStages
      ? mean(rs.map((x) => x.accessLookupMs ?? 0))
      : null,
    accessReuses: hasStages ? mean(rs.map((x) => x.accessReuses ?? 0)) : null,
    queries: mean(rs.map((x) => x.queries)),
    dbSumMs: mean(rs.map((x) => x.dbSumMs)),
    dbBusyMs: mean(rs.map((x) => x.dbBusyMs)),
    waves: mean(rs.map((x) => x.waves)),
    p50: q(
      rs.map((x) => x.serverMs),
      0.5,
    ),
    p95: q(
      rs.map((x) => x.serverMs),
      0.95,
    ),
    p99: q(
      rs.map((x) => x.serverMs),
      0.99,
    ),
    meanMs: mean(rs.map((x) => x.serverMs)),
    totalMs: sum(rs.map((x) => x.serverMs)),
    clientP50: q(
      rs.map((x) => x.clientMs),
      0.5,
    ),
  };
}

const phase = process.argv.includes("--cold") ? "cold" : "warm";
const rb = rows(B, phase);
const ra = rows(A, phase);
const sb = summary(rb);
const sa = summary(ra);

// Endpoints where the before-run made at least one user lookup.
const eps = [
  ...new Set(
    rb
      .filter((x) => x.userFindUnique > 0)
      .map((x) => `${x.role}|${x.endpoint}`),
  ),
].sort();
const epRows = eps.map((k) => {
  const [role, ep] = k.split("|");
  const b = rb.filter((x) => x.role === role && x.endpoint === ep);
  const a = ra.filter((x) => x.role === role && x.endpoint === ep);
  const med = (xs, f) => q(xs.map(f), 0.5);
  return {
    role,
    ep,
    n: `${b.length}/${a.length}`,
    bu: mean(b.map((x) => x.userFindUnique)),
    au: mean(a.map((x) => x.userFindUnique)),
    bq: mean(b.map((x) => x.queries)),
    aq: mean(a.map((x) => x.queries)),
    bw: med(b, (x) => x.waves),
    aw: med(a, (x) => x.waves),
    bms: med(b, (x) => x.serverMs),
    ams: med(a, (x) => x.serverMs),
  };
});

const line = (label, b, a, unit = "", improve = true) =>
  `| ${label} | ${r(b)}${unit} | ${r(a)}${unit} | ${improve ? pct(b, a) : "—"} |`;
const md = [
  `| Metric (${phase} requests, mean per request unless noted) | Before | After | Reduction |`,
  "|---|---:|---:|---:|",
  `| Requests compared | ${sb.n} | ${sa.n} | — |`,
  line(
    "Master `User.findUnique` round trips / request",
    sb.userFindUnique,
    sa.userFindUnique,
    "",
    true,
  ),
  line(
    "Time in those round trips (sum) / request",
    sb.userFindUniqueMs,
    sa.userFindUniqueMs,
    " ms",
  ),
  `| Access lookups executed / reused per request (after only) | — | ${r(sa.accessLookups, 2)} / ${r(sa.accessReuses, 2)} | — |`,
  line("MongoDB operations / request", sb.queries, sa.queries),
  line(
    "Cumulative DB time (sum of query durations) / request",
    sb.dbSumMs,
    sa.dbSumMs,
    " ms",
  ),
  line(
    "DB wait wall time (≥ 1 query in flight) / request",
    sb.dbBusyMs,
    sa.dbBusyMs,
    " ms",
  ),
  line("Sequential DB/Redis/gRPC waves / request", sb.waves, sa.waves),
  line("P50 server latency", sb.p50, sa.p50, " ms"),
  line("P95 server latency", sb.p95, sa.p95, " ms"),
  line("P99 server latency", sb.p99, sa.p99, " ms"),
  line("Mean server latency", sb.meanMs, sa.meanMs, " ms"),
  line(
    "Total server time, all compared requests",
    sb.totalMs,
    sa.totalMs,
    " ms",
  ),
  line("P50 client-observed latency", sb.clientP50, sa.clientP50, " ms"),
  "",
  "Per endpoint and role (endpoints whose before-run made ≥ 1 user lookup; medians for waves and latency, means for counts):",
  "",
  "| Role | Endpoint | n before/after | User lookups b → a | Queries b → a | Waves b → a | Server p50 ms b → a |",
  "|---|---|---|---|---|---|---|",
  ...epRows.map(
    (x) =>
      `| ${x.role} | ${x.ep} | ${x.n} | ${r(x.bu, 2)} → ${r(x.au, 2)} | ${r(x.bq)} → ${r(x.aq)} | ${x.bw} → ${x.aw} | ${r(x.bms)} → ${r(x.ams)} |`,
  ),
].join("\n");

if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], md + "\n");
console.log(md);
console.log("\nJSON:", JSON.stringify({ before: sb, after: sa }));
