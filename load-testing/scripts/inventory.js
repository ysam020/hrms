#!/usr/bin/env node
// Lists every GET route the gateway registers, classifies it, and records
// whether the workload uses it or why it is excluded. Writes
// reports/endpoint-inventory.md. Static analysis of apps/api-gateway/src/routes.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT, REPORTS_DIR } from "../config/environments.js";
import { endpoints } from "../config/endpoints.js";

const ROUTES_DIR = resolve(REPO_ROOT, "apps/api-gateway/src/routes");
// Mount prefixes from routes/index.ts.
const PREFIX = {
  payroll: "/payroll",
  performanceReview: "/performance-reviews",
  assets: "/assets",
  wfh: "/wfh",
  helpdesk: "/helpdesk",
  reports: "/reports",
  taxDeclaration: "/tax-declarations",
  analytics: "/analytics",
  walkthrough: "/walkthrough",
  presence: "/presence",
  platformAdmin: "/platform/admin",
};

// Why a route is not in the workload. Checked in order; first match wins.
const EXCLUDE = [
  [
    /^\/(logout|auth\/google|auth\/google-calendar\/connect|webauthn-register)$/,
    "auth flow with side effects (session, OAuth state or a WebAuthn challenge written to Redis)",
  ],
  [
    /^\/helpdesk\/tickets$/,
    "marks SLA breaches on read (ticket.updateMany in listTickets)",
  ],
  [
    /^\/(generate-|policies\/:id\/pdf|bulk-onboarding\/template)/,
    "file/PDF generation, not page data",
  ],
  [
    /^\/(og-preview|upload\/|chat\/messages\/:messageId\/view-url|support\/attachments)/,
    "external fetch / presigned upload or download URL",
  ],
  [
    /^\/check-face-descriptor/,
    "biometric check during punch-in (part of a write flow)",
  ],
  [/^\/public\//, "anonymous careers page (no tenant user context)"],
  [/^\/platform\//, "Praesto platform console (platform tenant only)"],
  [/^\/support\//, "tickets to the Praesto team (rare; no synthetic tickets)"],
  [
    /^\/(payment|tenants\/(available|domain-suggestion)|tenants\/join-requests)/,
    "signup/billing flow",
  ],
  [
    /^\/analytics\//,
    'returns HTTP 500 "client[method] is not a function" for every role (bug found by the smoke check, 2026-11-05)',
  ],
  [/^\/ai-|^\/ai-connections/, "AI integrations (external calls)"],
];

const CATEGORY = [
  [
    /dashboard|birthdays|calendar-events|hr-activit|approvals|holidays/,
    "Dashboard",
  ],
  [/attendance|overtime|comp-off|wfh/, "Attendance"],
  [/leave/, "Leave"],
  [
    /insight|headcount|distribution|breakdown|growth|joining|funnel|analytics|salary-band|hiring|reports|patterns|approval-rate/,
    "Reports",
  ],
  [/audit/, "Audit"],
  [/notification|unread/, "Notifications"],
  [
    /user|employee|kyc|org-chart|presence|teams|profile|resignation/,
    "Employees",
  ],
  [
    /department|designation|role|permission|tenant|settings|polic|pipeline|template|chain|slab|pay-cycle|component|walkthrough/,
    "Organisation/Settings",
  ],
  [/payroll|salary|payslip|tax|tds|form16/, "Payroll"],
  [/job|application|interview|recruit|offer|career/, "Recruitment"],
  [/asset|helpdesk|chat|support/, "Other modules"],
];

const used = new Map();
for (const [id, ep] of Object.entries(endpoints)) {
  const sample = ep.path({
    user: {
      id: ":userId",
      username: ":username",
      role: "hr",
      widgets: { live: ["x"], slow: ["x"] },
    },
    org: { users: [{ username: ":username" }] },
    year: ":year",
    month: ":month",
    prevYear: ":year",
    prevMonth: ":month",
    rnd: () => 0,
  });
  if (sample) used.set(decodeURIComponent(sample.split("?")[0]), id);
}

const rows = [];
for (const f of readdirSync(ROUTES_DIR).filter(
  (x) => x.endsWith(".ts") && x !== "index.ts",
)) {
  const src = readFileSync(resolve(ROUTES_DIR, f), "utf8");
  const key = f.replace(".ts", "");
  for (const m of src.matchAll(/\.get\(\s*["'`]([^"'`]+)["'`]/g)) {
    const path = ((PREFIX[key] ?? "") + m[1]).replace(/\/$/, "") || "/";
    // An optional trailing param ("/:userId?") also matches the bare path.
    const bare = path.replace(/\/:\w+\?$/, "");
    const norm = path.replace(/:(\w+)\??/g, (_, p) =>
      /year/i.test(p)
        ? ":year"
        : /month/i.test(p)
          ? ":month"
          : /user(name)?/i.test(p)
            ? /name/i.test(p)
              ? ":username"
              : ":userId"
            : `:${p}`,
    );
    const usedBy = [...used.entries()].find(
      ([u]) =>
        u
          .replace(/\d{4}/g, ":year")
          .replace(/\/\d{1,2}(\/|$)/g, "/:month$1") === norm ||
        u === norm ||
        u === bare,
    )?.[1];
    const excluded = EXCLUDE.find(([re]) => re.test(path))?.[1];
    const category = CATEGORY.find(([re]) => re.test(path))?.[1] ?? "Other";
    rows.push({
      path,
      file: f,
      category,
      status: excluded
        ? `excluded: ${excluded}`
        : usedBy
          ? `workload: \`${usedBy}\``
          : "not in workload (low usage or needs data not seeded)",
    });
  }
}
rows.sort(
  (a, b) =>
    a.category.localeCompare(b.category) || a.path.localeCompare(b.path),
);
const counts = rows.reduce(
  (acc, r) => (
    (acc[r.status.split(":")[0]] = (acc[r.status.split(":")[0]] ?? 0) + 1),
    acc
  ),
  {},
);
writeFileSync(
  resolve(REPORTS_DIR, "endpoint-inventory.md"),
  [
    "# Gateway GET endpoint inventory",
    "",
    `Generated by \`scripts/inventory.js\` from apps/api-gateway/src/routes on ${new Date().toISOString().slice(0, 10)}. ${rows.length} GET routes: ${Object.entries(
      counts,
    )
      .map(([k, v]) => `${v} ${k}`)
      .join(", ")}.`,
    "",
    "Only GET routes are listed; every POST/PUT/PATCH/DELETE route is excluded from load testing by construction (the request picker only emits GET).",
    "",
    "| Category | Path | Router file | Status |",
    "|---|---|---|---|",
    ...rows.map(
      (r) => `| ${r.category} | \`${r.path}\` | ${r.file} | ${r.status} |`,
    ),
    "",
  ].join("\n"),
);
console.log(
  `${rows.length} GET routes → reports/endpoint-inventory.md`,
  counts,
);
