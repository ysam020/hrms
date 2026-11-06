// Compiles config/endpoints.js + config/workload.js + the seeded users into
// a plain-JSON plan the autocannon workers can load (worker threads require
// CommonJS files, so they can't call the ESM path builders). Each builder
// is sampled per user ahead of time; the worker only picks among the
// precomputed URL variants, which also keeps load-generator CPU low.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATE_DIR } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";
import { pages, prngSeed, roleActivity } from "../config/workload.js";

export const PLAN_PATH = resolve(STATE_DIR, "plan.json");
const SAMPLES = 12;

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateContext(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    year,
    month,
    prevYear: month === 1 ? year - 1 : year,
    prevMonth: month === 1 ? 12 : month - 1,
  };
}

/**
 * @param orgs authenticatedOrgs() output, users optionally carrying
 *   `widgets` ({live, slow}) discovered by smoke.js
 * @param allowed Map "role|endpointId" → boolean from smoke.js (pairs that
 *   didn't answer 2xx are left out)
 */
export function compilePlan(orgs, allowed) {
  const rnd = mulberry32(prngSeed);
  const dates = dateContext();
  const users = [];
  for (const org of orgs) {
    for (const user of org.users) {
      const ctx = { user, org, ...dates, rnd };
      const urls = {};
      for (const [id, ep] of Object.entries(endpoints)) {
        if (!ep.roles.includes(user.role)) continue;
        if (allowed && allowed.get(`${user.role}|${id}`) !== true) continue;
        const variants = new Set();
        for (let i = 0; i < SAMPLES; i++) {
          const p = ep.path(ctx);
          if (p) variants.add(p);
        }
        if (variants.size) urls[id] = [...variants];
      }
      const rolePages = [];
      for (const [name, page] of Object.entries(pages)) {
        const reqs = page.requests.filter((id) => urls[id]);
        if (reqs.length)
          rolePages.push({ name, weight: page.weight, requests: reqs });
      }
      users.push({
        key: `${org.key}:${user.username}`,
        org: org.key,
        role: user.role,
        token: user.token,
        activity: roleActivity[user.role] ?? 1,
        urls,
        pages: rolePages,
      });
    }
  }
  const plan = {
    generatedAt: new Date().toISOString(),
    apiPrefix: "/api/v1",
    seed: prngSeed,
    categories: Object.fromEntries(
      Object.entries(endpoints).map(([id, e]) => [id, e.category]),
    ),
    users,
  };
  writeFileSync(PLAN_PATH, JSON.stringify(plan), { mode: 0o600 });
  return plan;
}

/** Expected share of requests per endpoint for this plan (for the report). */
export function expectedMix(plan) {
  const totals = {};
  let sum = 0;
  const totalActivity = plan.users.reduce((s, u) => s + u.activity, 0);
  for (const u of plan.users) {
    const pageWeight = u.pages.reduce((s, p) => s + p.weight, 0);
    const reqPerPage = u.pages.reduce(
      (s, p) => s + (p.weight / pageWeight) * p.requests.length,
      0,
    );
    for (const p of u.pages) {
      for (const id of p.requests) {
        const share =
          ((u.activity / totalActivity) * (p.weight / pageWeight)) / reqPerPage;
        totals[id] = (totals[id] ?? 0) + share;
        sum += share;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(totals)
      .map(([k, v]) => [k, v / sum])
      .sort((a, b) => b[1] - a[1]),
  );
}
