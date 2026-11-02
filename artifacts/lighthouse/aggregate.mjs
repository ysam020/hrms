// Medians per route × mode from a run directory's summary.csv, plus the
// union of failing audits. node aggregate.mjs <dir> [<compareDir>]
import fs from "node:fs";
const parse = (dir) => {
  const [head, ...rows] = fs.readFileSync(`${dir}/summary.csv`, "utf8").trim().split("\n");
  const keys = head.split(",");
  return rows.map((r) => {
    const failing = r.match(/"(.*)"$/)?.[1] ?? "";
    const v = r.replace(/,"[^"]*"$/, "").split(",");
    return { ...Object.fromEntries(keys.slice(0, -1).map((k, i) => [k, v[i]])), failing };
  });
};
const med = (xs) => { const s = xs.map(Number).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const group = (rows) => {
  const g = new Map();
  for (const r of rows) { const k = `${r.route}|${r.mode}`; g.set(k, [...(g.get(k) ?? []), r]); }
  return new Map([...g].map(([k, rs]) => [k, {
    n: rs.length,
    ...Object.fromEntries(["performance", "accessibility", "best_practices", "seo", "fcp_ms", "lcp_ms", "tbt_ms", "cls", "si_ms", "total_bytes", "script_bytes", "requests"].map((m) => [m, med(rs.map((r) => r[m]))])),
    perfRange: `${Math.min(...rs.map((r) => +r.performance))}–${Math.max(...rs.map((r) => +r.performance))}`,
    failing: [...new Set(rs.flatMap((r) => r.failing.split(" ").filter(Boolean)))].sort().join(" "),
  }]));
};
const [dir, cmp] = process.argv.slice(2);
const A = group(parse(dir)); const B = cmp ? group(parse(cmp)) : null;
const cols = ["performance", "accessibility", "best_practices", "seo", "fcp_ms", "lcp_ms", "tbt_ms", "cls", "si_ms", "total_bytes", "script_bytes", "requests"];
console.log(["route|mode", "n", "perfRange", ...cols].join("\t"));
for (const [k, a] of A) {
  const b = B?.get(k);
  console.log([k, a.n, a.perfRange, ...cols.map((c) => b ? `${a[c]}→${b[c]}` : a[c])].join("\t"));
}
console.log("\nFailing audits (score < 0.9, any run):");
for (const [k, a] of A) console.log(k.padEnd(22), B ? `\n   before: ${a.failing}\n   after:  ${B.get(k)?.failing}` : a.failing);
