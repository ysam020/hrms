// Targeted latency benchmark for refresh-token, get-notifications,
// dashboard/data (combined + org-today) and get-attendance-summary.
//
//   node targeted-bench.cjs <tag> [profileDir]
//
// Uses an already signed-in, isolated Chrome profile (never the user's own
// browser). The access token is captured from the app's own requests and
// kept in memory only; nothing written to disk contains tokens, cookies or
// response bodies — only timings, statuses, byte counts and request ids.
//
// Refresh-token is NOT called directly: rotating a real session in a loop is
// avoided. It is measured from the app's own single refresh on each cold page
// load (phase "cold"), i.e. exactly what a user reload does.
//
// Every request sends x-request-id "tb-<tag>-<phase>-<n>-<endpoint>" so the
// gateway's "request timing" log line can be joined to it.
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const TAG = process.argv[2] || "run";
const PROFILE = process.argv[3] || path.join(__dirname, "profile");
const ORIGIN = process.env.BENCH_ORIGIN || "https://localhost";
const COLD_LOADS = Number(process.env.COLD_LOADS || 8);
const WARMUP = 3;
const N_ISOLATED = Number(process.env.N_ISOLATED || 30);
const N_BURST = Number(process.env.N_BURST || 20);
const N_CONDITIONAL = 20;
const COMBINED_IDS = [
  "attendance-trend", "headcount-trend", "hiring", "hr-queue",
  "joiners-leavers", "leave-balance", "my-requests", "my-reviews",
  "org-admin", "payroll", "payslip", "review-cycle", "workforce",
].join(",");

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome", headless: true, ignoreHTTPSErrors: true,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  let token = null;
  ctx.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a && r.url().includes("/api/v1/")) token = a;
  });

  // Phase "cold": full page loads; record the app's own refresh-token call.
  const cold = [];
  for (let i = 0; i < COLD_LOADS; i++) {
    const seen = [];
    const onFinish = async (r) => {
      if (!r.url().includes("/api/v1/refresh-token")) return;
      const t = r.timing();
      let status = null; try { status = (await r.response())?.status() ?? null; } catch {}
      seen.push({ ms: t.responseEnd >= 0 ? t.responseEnd : null, status });
    };
    ctx.on("requestfinished", onFinish);
    await page.goto(ORIGIN + "/dashboard", { waitUntil: "load" });
    await page.waitForTimeout(4000);
    ctx.off("requestfinished", onFinish);
    cold.push(...seen.map((s) => ({ ...s, load: i })));
  }
  if (!token) throw new Error("no access token observed — sign the profile in first");
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  const userId = payload.userId; // used only to build the URL below
  const now = new Date(Date.now() + 330 * 60 * 1000); // IST calendar month
  const summaryPath = `/get-attendance-summary/${userId}/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`;

  const endpoints = {
    notifications: "/get-notifications",
    "dashboard-combined": `/dashboard/data?ids=${COMBINED_IDS}`,
    "org-today": "/dashboard/data?ids=org-today",
    "attendance-summary": summaryPath,
    dashboard: "/dashboard",
  };
  const rows = [];
  const call = async (phase, n, name, extraHeaders = {}) => {
    const rid = `tb-${TAG}-${phase}-${n}-${name}`;
    const t0 = performance.now();
    let status = 0, bytes = 0, etag = null;
    try {
      const res = await ctx.request.get(ORIGIN + "/api/v1" + endpoints[name], {
        headers: { authorization: token, "x-request-id": rid, ...extraHeaders },
        timeout: 30000,
      });
      status = res.status();
      bytes = (await res.body()).length;
      etag = res.headers()["etag"] || null;
    } catch { status = -1; }
    const ms = performance.now() - t0;
    rows.push({ phase, n, name, rid, ms, status, bytes });
    return { etag, status };
  };

  // Phase "isolated": one endpoint at a time, sequential, after warm-up.
  for (const name of ["notifications", "org-today", "attendance-summary", "dashboard-combined"]) {
    for (let i = 0; i < WARMUP; i++) await call("warmup", i, name);
    for (let i = 0; i < N_ISOLATED; i++) await call("isolated", i, name);
  }

  // Phase "burst": what the dashboard page fires at once.
  for (let i = 0; i < N_BURST; i++) {
    await Promise.all(["dashboard", "dashboard-combined", "org-today", "notifications", "attendance-summary"]
      .map((name) => call("burst", i, name)));
  }

  // Phase "widget" (WIDGETS_EACH=n): each combined widget requested alone.
  const each = Number(process.env.WIDGETS_EACH || 0);
  for (const id of COMBINED_IDS.split(",")) {
    endpoints[`w:${id}`] = `/dashboard/data?ids=${id}`;
    for (let i = 0; i < each; i++) await call("widget", i, `w:${id}`);
  }

  // Phase "conditional": revalidate notifications with its last ETag.
  const first = await call("conditional-seed", 0, "notifications");
  for (let i = 0; i < N_CONDITIONAL; i++)
    await call("conditional", i, "notifications", first.etag ? { "if-none-match": first.etag } : {});

  await ctx.close();
  const out = path.join(process.env.BENCH_OUT || __dirname, `targeted-${TAG}.json`);
  fs.writeFileSync(out, JSON.stringify({ tag: TAG, at: new Date().toISOString(), cold, rows }, null, 0));
  console.log("DONE", TAG, "cold", cold.length, "rows", rows.length);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
