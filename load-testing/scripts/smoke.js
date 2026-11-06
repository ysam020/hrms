#!/usr/bin/env node
// Validates the workload before any load: for one user per (org, role), GET
// every endpoint the role is expected to use, once, sequentially. Records
// status/latency/size, discovers each role's dashboard widget groups, keeps
// only (role, endpoint) pairs that answered 2xx, compiles the plan, and
// proves with a before/after snapshot that the pass wrote nothing.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { REPORTS_DIR, STATE_DIR } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";
import { authenticatedOrgs, readManifest } from "../lib/authentication.js";
import { apiGet } from "../lib/http.js";
import { integrityDiff, integritySnapshot } from "../lib/integrity.js";
import { openAtlas } from "../lib/monitoring-client.js";
import {
  compilePlan,
  dateContext,
  expectedMix,
  mulberry32,
} from "../lib/plan.js";

// Mirrors apps/web/src/features/dashboard (Today.tsx + registry.tsx): server
// widgets the layout shows, split by refresh group.
const LIVE = new Set(["team-today", "org-today"]);
function widgetGroups(body) {
  const cfg = body?.data ?? body;
  const available = new Map((cfg?.widgets ?? []).map((w) => [w.id, w]));
  const shown = (cfg?.layout ?? []).filter(
    (e) => e.visible && available.has(e.id),
  );
  const server = shown
    .filter((e) => available.get(e.id)?.source === "server")
    .map((e) => e.id)
    .sort();
  return {
    live: server.filter((id) => LIVE.has(id)),
    slow: server.filter((id) => !LIVE.has(id)),
  };
}

const atlas = await openAtlas();
const manifest = readManifest();
try {
  const before = await integritySnapshot(atlas, manifest);
  const orgs = authenticatedOrgs();
  const rows = [];
  const allowed = new Map();
  const widgetsByOrgRole = {};
  for (const org of orgs) {
    for (const role of ["owner", "admin", "hr", "manager", "employee"]) {
      const user = org.users.find((u) => u.role === role);
      if (!user) continue;
      const dash = await apiGet("/dashboard", user.token);
      const widgets =
        dash.status === 200 ? widgetGroups(dash.body) : { live: [], slow: [] };
      widgetsByOrgRole[`${org.key}|${role}`] = widgets;
      user.widgets = widgets;
      const ctx = { user, org, ...dateContext(), rnd: mulberry32(7) };
      for (const [id, ep] of Object.entries(endpoints)) {
        if (!ep.roles.includes(role)) continue;
        const path = ep.path(ctx);
        if (!path) {
          rows.push({
            org: org.key,
            role,
            id,
            path: "(none: no widgets in this group)",
            status: "skip",
          });
          continue;
        }
        const r = await apiGet(path, user.token);
        const ok = r.status >= 200 && r.status < 300;
        if (ok)
          allowed.set(`${role}|${id}`, allowed.get(`${role}|${id}`) !== false);
        else allowed.set(`${role}|${id}`, false);
        rows.push({
          org: org.key,
          role,
          id,
          path,
          status: r.status,
          ms: Math.round(r.ms),
          bytes: r.bytes,
          message: ok ? "" : String(r.body?.message ?? "").slice(0, 80),
        });
      }
    }
  }

  // Every user gets its org+role's widget groups; then compile the plan.
  for (const org of orgs)
    for (const u of org.users)
      u.widgets = widgetsByOrgRole[`${org.key}|${u.role}`];
  const plan = compilePlan(orgs, allowed);
  const mix = expectedMix(plan);

  const after = await integritySnapshot(atlas, manifest);
  const diffs = integrityDiff(before, after);

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    resolve(STATE_DIR, "smoke.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        allowed: [...allowed],
        widgetsByOrgRole,
        diffs,
      },
      null,
      2,
    ),
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(REPORTS_DIR, { recursive: true });
  const dropped = [...allowed].filter(([, v]) => !v).map(([k]) => k);
  const md = [
    `# Smoke check ${ts}`,
    "",
    `One request per (org, role, endpoint), sequential. ${rows.length} requests. Read-only check: ${diffs.length ? `**CHANGED** — ${diffs.join("; ")}` : "no document changed"}.`,
    "",
    `Dropped from the plan (not 2xx for that role): ${dropped.length ? dropped.join(", ") : "none"}.`,
    "",
    "Dashboard widget groups discovered from GET /dashboard:",
    "",
    ...Object.entries(widgetsByOrgRole).map(
      ([k, w]) =>
        `- ${k}: live [${w.live.join(", ")}], slow [${w.slow.join(", ")}]`,
    ),
    "",
    "## Expected request mix (share of all requests)",
    "",
    "| Endpoint | Category | Share |",
    "|---|---|---:|",
    ...Object.entries(mix).map(
      ([id, s]) =>
        `| ${id} | ${endpoints[id].category} | ${(100 * s).toFixed(1)}% |`,
    ),
    "",
    "## Results",
    "",
    "| Org | Role | Endpoint | Path | Status | ms | Bytes | Message |",
    "|---|---|---|---|---:|---:|---:|---|",
    ...rows.map(
      (r) =>
        `| ${r.org} | ${r.role} | ${r.id} | \`${r.path}\` | ${r.status} | ${r.ms ?? ""} | ${r.bytes ?? ""} | ${r.message ?? ""} |`,
    ),
    "",
  ].join("\n");
  const out = resolve(REPORTS_DIR, `smoke-${ts}.md`);
  writeFileSync(out, md);
  console.log(
    `${rows.length} requests; ${dropped.length} pairs dropped; integrity ${diffs.length ? "CHANGED" : "unchanged"}; plan ${plan.users.length} users.`,
  );
  console.log(out);
  if (diffs.length) process.exitCode = 1;
} finally {
  await atlas.close();
}
