#!/usr/bin/env node
// Before/after comparison of two runs, stage by stage (same connection
// counts only). Latency improvement = (before − after) / before; throughput
// improvement = (after − before) / before. Flags any stage where p50 got
// better but p99 got worse (a tail regression to investigate, not a win).
//
// usage: node scripts/compare-results.js reports/<before-run> reports/<after-run> [--label "change name"]
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const [beforeDir, afterDir] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const labelIdx = process.argv.indexOf("--label");
const label =
  labelIdx > 0 ? process.argv[labelIdx + 1] : "change under evaluation";
if (!beforeDir || !afterDir) {
  console.error(
    "usage: compare-results.js <before-run-dir> <after-run-dir> [--label name]",
  );
  process.exit(2);
}
const load = (d) =>
  JSON.parse(readFileSync(resolve(d, "summary.json"), "utf8"));
const before = load(beforeDir);
const after = load(afterDir);

const pct = (b, a, lowerIsBetter) => {
  if (!Number.isFinite(b) || !Number.isFinite(a) || b === 0) return "—";
  const v = lowerIsBetter ? ((b - a) / b) * 100 : ((a - b) / b) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};
const f = (v, u = "") =>
  Number.isFinite(v) ? `${Math.round(v * 10) / 10}${u}` : "—";

const lines = [
  `# Comparison: ${label}`,
  "",
  `Before: \`${basename(beforeDir)}\` (${before.startedAt}). After: \`${basename(afterDir)}\` (${after.startedAt}).`,
  "",
];
const diffCfg = [
  "warmupSeconds",
  "measureSeconds",
  "cooldownSeconds",
  "timeoutSeconds",
  "workers",
].filter((k) => before.config[k] !== after.config[k]);
lines.push(
  diffCfg.length
    ? `**Configuration differs** (${diffCfg.map((k) => `${k}: ${before.config[k]} → ${after.config[k]}`).join(", ")}): results are not directly comparable.`
    : "Same stage configuration in both runs.",
  "",
);
lines.push(
  "Positive = improvement. Latency: (before − after) / before. Throughput: (after − before) / before.",
  "",
);

const byConn = (run) =>
  Object.fromEntries(
    run.stages
      .filter((s) => s.analysis)
      .map((s) => [s.connections, s.analysis.metrics]),
  );
const B = byConn(before);
const A = byConn(after);
const tailRegressions = [];
for (const c of Object.keys(B)
  .filter((c) => A[c])
  .map(Number)
  .sort((x, y) => x - y)) {
  const b = B[c];
  const a = A[c];
  const gwB = b.containers.find((x) => x.name === "api-gateway");
  const gwA = a.containers.find((x) => x.name === "api-gateway");
  lines.push(
    `## ${c} connections`,
    "",
    "| Metric | Before | After | Improvement |",
    "|---|---:|---:|---:|",
  );
  const row = (name, vb, va, lower, u = "") =>
    lines.push(
      `| ${name} | ${f(vb, u)} | ${f(va, u)} | ${pct(vb, va, lower)} |`,
    );
  row("P50 latency", b.latency.p50Ms, a.latency.p50Ms, true, " ms");
  row("P95 latency", b.latency.p95Ms, a.latency.p95Ms, true, " ms");
  row("P99 latency", b.latency.p99Ms, a.latency.p99Ms, true, " ms");
  row("Requests/sec", b.rps, a.rps, false);
  row("Error rate", b.errorRatePct, a.errorRatePct, true, "%");
  row(
    "Gateway CPU (median % of limit)",
    gwB?.cpuOfLimitPct,
    gwA?.cpuOfLimitPct,
    true,
    "%",
  );
  row("Gateway memory (max)", gwB?.memMaxMiB, gwA?.memMaxMiB, true, " MiB");
  row(
    "Atlas ops/s per gateway request",
    b.atlas.opsPerSecMedian / b.rps,
    a.atlas.opsPerSecMedian / a.rps,
    true,
  );
  row(
    "Redis ops/s per gateway request",
    b.redis.opsPerSecMax / b.rps,
    a.redis.opsPerSecMax / a.rps,
    true,
  );
  lines.push("");
  if (a.latency.p50Ms < b.latency.p50Ms && a.latency.p99Ms > b.latency.p99Ms)
    tailRegressions.push(c);
}
if (!Object.keys(B).some((c) => A[c]))
  lines.push("No stage was measured in both runs.", "");
lines.push(
  tailRegressions.length
    ? `**Tail regression:** p50 improved but p99 worsened at ${tailRegressions.join(", ")} connections. Investigate before accepting.`
    : "No stage shows a p50-better / p99-worse tail regression.",
  "",
  "Atlas ops/s is cluster-wide (production traffic included), so the per-request ratio is an estimate of database calls per request, not an exact count.",
  "",
);
const out = resolve(afterDir, `comparison-vs-${basename(beforeDir)}.md`);
writeFileSync(out, lines.join("\n"));
console.log(out);
