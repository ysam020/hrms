#!/usr/bin/env node
// Low-overhead latency sampling (NOT a load test): sequential GETs against
// the loadtest stack for one real or synthetic tenant, one user per role,
// each request tagged with its own x-request-id. The gateway (with
// REQUEST_TIMING_LOG=true and REQUEST_TIMING_OPS=true) logs a breakdown line
// per request to Loki; this script joins those lines to the client-side
// timings by request id and writes them to reports/latency-sample-<ts>.json.
// Response bodies are never stored, only status, size and timings.
//
// usage: node scripts/latency-sample.js --tenant acme-corp [--passes 3] [--burst 5]
//          [--out <file.json>] [--redact]
// --burst 0 keeps every request sequential. --redact drops request paths
// (they can contain usernames and user ids) and request ids from the saved
// file, keeping the endpoint name and all timings.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ObjectId } from "mongodb";
import { environment, REPORTS_DIR } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";
import { mintToken } from "../lib/authentication.js";
import "../lib/http.js"; // self-signed dev certificate on localhost only
import { openAtlas } from "../lib/monitoring-client.js";
import { dateContext, mulberry32 } from "../lib/plan.js";

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const slug = arg("tenant");
const passes = Number(arg("passes", 3));
const burst = Number(arg("burst", 5));
if (!slug) throw new Error("--tenant <slug> is required");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve the tenant and one user per role (ids only; read-only).
const atlas = await openAtlas();
const master = atlas.db("hrms-dev");
const tenant = await master
  .collection("tenants")
  .findOne(
    { slug },
    { projection: { _id: 1, dbName: 1, subscriptionStatus: 1 } },
  );
if (!tenant) throw new Error(`No tenant ${slug}`);
const org = {
  key: slug,
  tenantId: tenant._id.toString(),
  dbName: tenant.dbName,
  users: [],
};
for (const role of ["owner", "admin", "hr", "manager", "employee"]) {
  const m = await master
    .collection("tenant_memberships")
    .findOne(
      { tenantId: new ObjectId(org.tenantId), role },
      { projection: { userId: 1 } },
    );
  if (!m) continue;
  const u = await master
    .collection("users")
    .findOne({ _id: m.userId }, { projection: { username: 1 } });
  org.users.push({
    id: m.userId.toString(),
    username: u?.username ?? "",
    role,
  });
}
await atlas.close();
console.log(
  `tenant ${slug} (${tenant.subscriptionStatus}); roles: ${org.users.map((u) => u.role).join(", ")}`,
);

async function get(path, token) {
  const id = `lat-${randomUUID()}`;
  const t0 = performance.now();
  const res = await fetch(
    `${environment.baseUrl}${environment.apiPrefix}${path}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "x-request-id": id,
      },
    },
  );
  const ttfb = performance.now() - t0;
  const body = await res.arrayBuffer();
  return {
    id,
    path,
    status: res.status,
    bytes: body.byteLength,
    ttfbMs: ttfb,
    clientMs: performance.now() - t0,
  };
}

const samples = [];
const startedAt = Date.now();
const dates = dateContext();
for (const user of org.users) {
  const token = mintToken(user, org, { ttlSeconds: 1800 });
  const ctx = {
    user: {
      ...user,
      widgets: {
        live: ["team-today", "org-today"],
        slow: ["workforce", "hr-queue", "my-requests", "leave-balance"],
      },
    },
    org,
    ...dates,
    rnd: mulberry32(11),
  };
  // The dashboard's real widget ids for this user come from GET /dashboard.
  const dash = await get("/dashboard", token);
  samples.push({
    phase: "cold",
    role: user.role,
    endpoint: "dashboard",
    ...dash,
  });
  for (let pass = 0; pass <= passes; pass++) {
    for (const [id, ep] of Object.entries(endpoints)) {
      if (!ep.roles.includes(user.role) || id.startsWith("analytics")) continue;
      const path = ep.path(ctx);
      if (!path) continue;
      const r = await get(path, token);
      samples.push({
        phase: pass === 0 ? "cold" : "warm",
        role: user.role,
        endpoint: id,
        ...r,
      });
      await sleep(150);
    }
  }
  // One small concurrent burst of the heaviest page (like a few tabs opening).
  if (burst > 1) {
    const paths = [
      endpoints.dashboardSlow.path(ctx),
      endpoints.dashboardLive.path(ctx),
    ].filter(Boolean);
    const rs = await Promise.all(
      Array.from({ length: burst }, (_, i) =>
        get(paths[i % paths.length], token),
      ),
    );
    rs.forEach((r) =>
      samples.push({
        phase: `burst${burst}`,
        role: user.role,
        endpoint: "dashboardData",
        ...r,
      }),
    );
  }
}
const endedAt = Date.now();

// Join with the gateway's breakdown lines in Loki (allow for ingestion lag).
await sleep(8000);
const url = new URL("/loki/api/v1/query_range", environment.lokiUrl);
url.searchParams.set(
  "query",
  `{service="${environment.serviceLabelPrefix}api-gateway"} |~ "request timing|db-heavy request"`,
);
url.searchParams.set("start", String((startedAt - 5000) * 1e6));
url.searchParams.set("end", String((endedAt + 30000) * 1e6));
url.searchParams.set("limit", "5000");
const json = await (await fetch(url)).json();
const lines = new Map();
for (const s of json.data?.result ?? []) {
  for (const [, line] of s.values) {
    const i = line.indexOf("{");
    try {
      const o = JSON.parse(line.slice(i));
      if (o.requestId) lines.set(o.requestId, o);
    } catch {}
  }
}
let joined = 0;
for (const s of samples) {
  const server = lines.get(s.id);
  if (server) {
    joined++;
    s.server = server;
  }
}
mkdirSync(REPORTS_DIR, { recursive: true });
const out = arg("out")
  ? resolve(arg("out"))
  : resolve(
      REPORTS_DIR,
      `latency-sample-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.json`,
    );
const redact = process.argv.includes("--redact");
const saved = redact
  ? samples.map(({ id, path, server, ...rest }) => ({
      ...rest,
      path: path
        .split("?")[0]
        .replace(/\/[0-9a-f]{24}(?=\/|$)/g, "/:userId")
        .replace(
          /^\/get-employee-details\/.*/,
          "/get-employee-details/:username",
        ),
      server: server && { ...server, requestId: undefined },
    }))
  : samples;
writeFileSync(
  out,
  JSON.stringify(
    {
      tenant: slug,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      passes,
      burst,
      redacted: redact,
      samples: saved,
    },
    null,
    1,
  ),
);
console.log(
  `${samples.length} requests, ${joined} joined to server breakdowns → ${out}`,
);
