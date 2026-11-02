// Lighthouse runner for the Docker stack at https://localhost.
//
//   node run-lighthouse.mjs <outDir> [runs=3] [routeFilter]
//
// Must be run with Lighthouse resolvable, e.g. from the tool directory:
//   cd ~/Downloads/hrms-lighthouse-tool && node <repo>/artifacts/lighthouse/run-lighthouse.mjs …
// (lighthouse@13.5.0, which brings puppeteer-core and chrome-launcher.)
//
// Public routes are audited exactly as served: real nginx, real gateway
// (signed out, so the gateway only answers /refresh-token with 401).
// Signed-in routes use the React 19 harness's fictional "Halcyon Labs"
// fixtures: static files still come from the running nginx, but /api/* and
// /socket.io/* are answered inside the browser, so no session is created and
// the shared database is never touched. Fixture responses add 40 ms latency.
//
// Lighthouse defaults: mobile = Moto G Power emulation, simulated throttling
// (150 ms RTT, 1.6 Mbps, 4× CPU); desktop = --preset=desktop (40 ms RTT,
// 10 Mbps, 1× CPU). Each run gets a fresh Chrome profile.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const lighthouse = (await import(require.resolve("lighthouse"))).default;
const desktopConfig = (await import(require.resolve("lighthouse/core/config/desktop-config.js"))).default;
const chromeLauncher = await import(require.resolve("chrome-launcher"));
const puppeteer = (await import(require.resolve("puppeteer-core"))).default;
const { respond } = await import(
  path.join(process.env.HOME, "Downloads/hrms-react19-artifacts/harness/fixtures.mjs")
);

const BASE = process.env.LH_BASE ?? "https://localhost";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [outDir, runsArg = "3", filter] = process.argv.slice(2);
if (!outDir) throw new Error("usage: run-lighthouse.mjs <outDir> [runs] [routeFilter]");
const RUNS = Number(runsArg);

export const ROUTES = [
  { id: "landing", path: "/", auth: false },
  { id: "login", path: "/login", auth: false },
  { id: "privacy", path: "/privacy-policy", auth: false },
  { id: "dashboard", path: "/dashboard", auth: true },
  { id: "employees", path: "/employee-management/employee-list", auth: true },
  { id: "attendance", path: "/attendance", auth: true },
  { id: "leave", path: "/attendance/view-leave-applications", auth: true },
  { id: "recruitment", path: "/job-openings/view-job-openings", auth: true },
  { id: "analytics", path: "/analytics/workforce", auth: true },
  { id: "settings", path: "/settings/company", auth: true },
  { id: "helpdesk", path: "/helpdesk", auth: true },
];
const MODES = (process.env.LH_MODES ?? "mobile,desktop").split(",");

fs.mkdirSync(outDir, { recursive: true });
const summaryFile = path.join(outDir, "summary.csv");
if (!fs.existsSync(summaryFile))
  fs.writeFileSync(
    summaryFile,
    "route,mode,run,performance,accessibility,best_practices,seo,fcp_ms,lcp_ms,tbt_ms,cls,si_ms,tti_ms,total_bytes,script_bytes,requests,failing\n",
  );

async function auditOnce(route, mode, run) {
  const chrome = await chromeLauncher.launch({
    chromePath: CHROME,
    chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
  });
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
  const page = await browser.newPage();
  if (route.auth) {
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const u = new URL(req.url());
      if (u.origin === BASE && u.pathname.startsWith("/socket.io/")) {
        // No realtime server in fixture mode; answer like a gateway that
        // refuses the polling handshake, without touching the real one.
        return req.respond({ status: 503, contentType: "text/plain", body: "" });
      }
      if (u.origin === BASE && u.pathname.startsWith("/api/")) {
        const p = u.pathname.replace(/^\/api\/v1/, "");
        const res = respond(req.method(), p, u);
        await new Promise((r) => setTimeout(r, 40));
        return req.respond({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
      }
      return req.continue();
    });
  }
  const flags = { output: ["html", "json"], logLevel: "error", port: chrome.port };
  const result = await lighthouse(BASE + route.path, flags, mode === "desktop" ? desktopConfig : undefined, page);
  await browser.disconnect();
  await chrome.kill();

  const [html, json] = result.report;
  const stem = path.join(outDir, `${route.id}.${mode}.run${run}`);
  fs.writeFileSync(`${stem}.report.html`, html);
  fs.writeFileSync(`${stem}.report.json`, json);

  const lhr = result.lhr;
  const a = lhr.audits;
  const c = lhr.categories;
  const n = (id) => Math.round(a[id]?.numericValue ?? NaN);
  const items = a["resource-summary"]?.details?.items ?? [];
  const rs = (t) => items.find((i) => i.resourceType === t) ?? {};
  const failing = Object.values(lhr.categories)
    .flatMap((cat) => cat.auditRefs.filter((r) => r.weight > 0).map((r) => a[r.id]))
    .filter((au) => au && au.score !== null && au.score < 0.9 && au.scoreDisplayMode !== "informative")
    .map((au) => au.id);
  const row = [
    route.id, mode, run,
    ...["performance", "accessibility", "best-practices", "seo"].map((k) => Math.round((c[k]?.score ?? NaN) * 100)),
    n("first-contentful-paint"), n("largest-contentful-paint"), n("total-blocking-time"),
    (a["cumulative-layout-shift"]?.numericValue ?? NaN).toFixed(3),
    n("speed-index"), n("interactive"),
    rs("total").transferSize, rs("script").transferSize, rs("total").requestCount,
    `"${[...new Set(failing)].join(" ")}"`,
  ];
  fs.appendFileSync(summaryFile, row.join(",") + "\n");
  console.log(row.slice(0, 14).join("\t"));
}

for (const route of ROUTES.filter((r) => !filter || new RegExp(filter).test(r.id)))
  for (const mode of MODES)
    for (let run = 1; run <= RUNS; run++) await auditOnce(route, mode, run);
