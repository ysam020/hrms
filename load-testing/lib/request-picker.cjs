// Autocannon `setupClient` module, loaded inside every worker thread.
// Each connection becomes one seeded person (chosen by role activity
// weight, deterministically from the connection's index) who visits pages
// from the plan: it issues the page's GETs in order, then picks the next
// page by weight. Only GET requests are ever produced.
//
// Per-route client-side latency and status counts are kept per worker and
// flushed every second to $LT_STATS_DIR/<pid>-<thread>.json for the runner
// to merge (autocannon itself only reports totals).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { threadId } = require("node:worker_threads");

const plan = JSON.parse(fs.readFileSync(process.env.LT_PLAN_FILE, "utf8"));
const statsDir = process.env.LT_STATS_DIR;
const workerIndex = Number(process.env.LT_WORKER_SALT || 0) + threadId;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cumulative activity table → pick a user for a connection.
const cumulative = [];
let acc = 0;
for (const u of plan.users) {
  acc += u.activity;
  cumulative.push(acc);
}
function userFor(r) {
  const x = r * acc;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return plan.users[lo];
}

// Log-spaced latency buckets: 0.5 ms × 1.1^i, enough resolution for p99.
const BASE = 0.5;
const RATIO = 1.1;
const LOG_RATIO = Math.log(RATIO);
const bucketOf = (ms) => (ms <= BASE ? 0 : Math.ceil(Math.log(ms / BASE) / LOG_RATIO));

const stats = {}; // route → { n, lost, status: {}, buckets: {}, bytes }
function routeStats(id) {
  return (stats[id] ??= { n: 0, lost: 0, status: {}, buckets: {}, bytes: 0 });
}

let connectionCounter = 0;
let dirty = false;
function flush() {
  if (!statsDir || !dirty) return;
  dirty = false;
  const file = path.join(statsDir, `${process.pid}-${threadId}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(stats));
  fs.renameSync(file + ".tmp", file);
}
if (statsDir) {
  fs.mkdirSync(statsDir, { recursive: true });
  setInterval(flush, 1000).unref();
  process.on("exit", flush);
}

module.exports = function setupClient(client) {
  const connIndex = connectionCounter++;
  const rnd = mulberry32(plan.seed * 7919 + workerIndex * 104729 + connIndex);
  const user = userFor(rnd());
  const pageTotal = user.pages.reduce((s, p) => s + p.weight, 0);
  const headers = { authorization: `Bearer ${user.token}`, accept: "application/json" };
  let queue = [];
  let inflight = null; // { id, t0 }

  function nextRoute() {
    if (queue.length === 0) {
      let x = rnd() * pageTotal;
      let page = user.pages[user.pages.length - 1];
      for (const p of user.pages) {
        x -= p.weight;
        if (x <= 0) {
          page = p;
          break;
        }
      }
      queue = page.requests.slice();
    }
    return queue.shift();
  }

  client.setRequests([
    {
      method: "GET",
      setupRequest(req) {
        // A request built while the previous one never answered was lost
        // to a timeout or a reset connection.
        if (inflight) routeStats(inflight.id).lost++;
        const id = nextRoute();
        const variants = user.urls[id];
        inflight = { id, t0: performance.now() };
        return {
          ...req,
          method: "GET",
          path: plan.apiPrefix + variants[Math.floor(rnd() * variants.length)],
          headers,
          body: undefined,
        };
      },
      onResponse(status, body) {
        if (!inflight) return;
        const s = routeStats(inflight.id);
        const ms = performance.now() - inflight.t0;
        s.n++;
        s.status[status] = (s.status[status] ?? 0) + 1;
        const b = bucketOf(ms);
        s.buckets[b] = (s.buckets[b] ?? 0) + 1;
        s.bytes += body ? body.length : 0;
        inflight = null;
        dirty = true;
      },
    },
  ]);
};

module.exports.BUCKET = { BASE, RATIO };
