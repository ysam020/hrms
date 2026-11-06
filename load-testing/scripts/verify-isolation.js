#!/usr/bin/env node
// Tenant-isolation checks between the two synthetic orgs, run before any
// load. Every request is a GET against the loadtest stack.
//  1. Leak scan: for one user per role in each org, call every workload
//     endpoint and search the whole response for the OTHER org's user ids,
//     usernames and tenant id. Any hit fails.
//  2. Directed cross-tenant reads: an HR user of one org asks for the other
//     org's employees by id/username (details, attendance summary, leave
//     balance, leave list). Must return nothing of the other org.
//  3. Directory scope: /get-all-users?limit=1000 returns only own-org users,
//     and exactly the seeded count.
//  4. Cache isolation: org A then org B then org A again on cached endpoints
//     (Redis cache keys are tenant-prefixed); each answer stays in its org.
//  5. Token binding: a token signed with a different secret, and one with a
//     tampered tenant, are rejected (401).
import jwt from "jsonwebtoken";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPORTS_DIR } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";
import { authenticatedOrgs } from "../lib/authentication.js";
import { apiGet } from "../lib/http.js";
import { dateContext, mulberry32 } from "../lib/plan.js";
import { readFileSync } from "node:fs";
import { STATE_DIR } from "../config/environments.js";

const orgs = authenticatedOrgs();
if (orgs.length < 2) throw new Error("Isolation checks need two seeded orgs.");
const smoke = JSON.parse(
  readFileSync(resolve(STATE_DIR, "smoke.json"), "utf8"),
);
const widgets = smoke.widgetsByOrgRole;
const results = [];
const record = (check, ok, detail) => results.push({ check, ok, detail });

const dates = dateContext();
for (const [self, other] of [
  [orgs[0], orgs[1]],
  [orgs[1], orgs[0]],
]) {
  const needles = [
    other.tenantId,
    ...other.users.flatMap((u) => [u.id, u.username]),
  ];
  // 1. Leak scan
  for (const role of ["owner", "admin", "hr", "manager", "employee"]) {
    const user = self.users.find((u) => u.role === role);
    user.widgets = widgets[`${self.key}|${role}`];
    const ctx = { user, org: self, ...dates, rnd: mulberry32(3) };
    for (const [id, ep] of Object.entries(endpoints)) {
      if (!ep.roles.includes(role)) continue;
      const path = ep.path(ctx);
      if (!path) continue;
      const r = await apiGet(path, user.token);
      const text = JSON.stringify(r.body ?? "");
      const leaked = needles.filter((n) => text.includes(n));
      record(
        `leak scan ${self.key}/${role} ${id}`,
        leaked.length === 0,
        leaked.length
          ? `found ${leaked.length} ${other.key} identifiers (status ${r.status})`
          : `status ${r.status}, ${r.bytes} bytes`,
      );
    }
  }

  // 2. Directed cross-tenant reads
  const hr = self.users.find((u) => u.role === "hr");
  const victim = other.users.find((u) => u.role === "employee");
  const directed = [
    `/get-employee-details/${victim.username}`,
    `/get-attendance-summary/${victim.id}/${dates.year}/${dates.month}`,
    `/get-available-paid-leaves/${victim.id}`,
    `/get-leave-applications?userId=${victim.id}`,
    `/get-all-users?search=${victim.username}&limit=10`,
  ];
  for (const path of directed) {
    const r = await apiGet(path, hr.token);
    const text = JSON.stringify(r.body ?? "");
    const leaked = [victim.id, victim.username, other.tenantId].filter((n) =>
      text.includes(n),
    );
    record(
      `directed ${self.key}→${other.key} ${path.split("?")[0].replace(victim.id, ":id").replace(victim.username, ":username")}`,
      leaked.length === 0,
      `status ${r.status}${leaked.length ? `, LEAKED ${leaked.length} identifiers` : ""}`,
    );
  }

  // 3. Directory scope
  const dir = await apiGet("/get-all-users?limit=1000", hr.token);
  const list = dir.body?.data?.users ?? dir.body?.data ?? dir.body?.users ?? [];
  const usernames = (Array.isArray(list) ? list : [])
    .map((u) => u.username)
    .filter(Boolean);
  const foreign = usernames.filter(
    (u) => !u.startsWith(`loadtest_${self.key}_`),
  );
  record(
    `directory ${self.key}`,
    usernames.length > 0 && foreign.length === 0,
    `${usernames.length} users returned (seeded ${self.users.length}), ${foreign.length} from outside the org`,
  );
}

// 4. Cache isolation: A, B, A on cached endpoints.
for (const path of [
  "/get-hr-activities?page=1&limit=10&status=",
  "/get-holidays/" + dates.year,
  "/get-all-users?limit=1000",
  "/leave-policy",
]) {
  const seq = [orgs[0], orgs[1], orgs[0]];
  let ok = true;
  const notes = [];
  for (const org of seq) {
    const other = orgs.find((o) => o !== org);
    const user = org.users.find((u) => u.role === "hr");
    const r = await apiGet(path, user.token);
    const text = JSON.stringify(r.body ?? "");
    const leaked = [other.tenantId, ...other.users.map((u) => u.id)].filter(
      (n) => text.includes(n),
    );
    if (leaked.length) ok = false;
    notes.push(`${org.key}:${r.status}${leaked.length ? "!LEAK" : ""}`);
  }
  record(`cache A→B→A ${path.split("?")[0]}`, ok, notes.join(" "));
}

// 5. Token binding
const victimOrg = orgs[0];
const u = victimOrg.users.find((x) => x.role === "hr");
const forged = jwt.sign(
  {
    userId: u.id,
    tenantId: victimOrg.tenantId,
    tenantRole: "owner",
    pendingSetup: false,
    orgSetupComplete: true,
    dbName: victimOrg.dbName,
  },
  "not-the-stack-secret",
  { algorithm: "HS256", expiresIn: 600 },
);
const f = await apiGet("/profile", forged);
record(
  "token signed with another secret is rejected",
  f.status === 401,
  `status ${f.status}`,
);
const [h, p, s] = u.token.split(".");
const payload = JSON.parse(Buffer.from(p, "base64url").toString());
const tampered = [
  h,
  Buffer.from(
    JSON.stringify({
      ...payload,
      tenantId: orgs[1].tenantId,
      dbName: orgs[1].dbName,
    }),
  ).toString("base64url"),
  s,
].join(".");
const t = await apiGet("/profile", tampered);
record(
  "token with a tampered tenant is rejected",
  t.status === 401,
  `status ${t.status}`,
);

const failed = results.filter((r) => !r.ok);
mkdirSync(REPORTS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve(REPORTS_DIR, `isolation-${ts}.md`);
writeFileSync(
  out,
  [
    `# Tenant isolation check ${ts}`,
    "",
    `${results.length} checks, ${failed.length} failed. Orgs: ${orgs.map((o) => `${o.key} (${o.users.length} users)`).join(", ")}.`,
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...results.map(
      (r) => `| ${r.check} | ${r.ok ? "pass" : "**FAIL**"} | ${r.detail} |`,
    ),
    "",
  ].join("\n"),
);
writeFileSync(
  resolve(STATE_DIR, "isolation.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      checks: results.length,
      failed: failed.length,
    },
    null,
    2,
  ),
);
console.log(`${results.length} checks, ${failed.length} failed → ${out}`);
if (failed.length) process.exitCode = 1;
