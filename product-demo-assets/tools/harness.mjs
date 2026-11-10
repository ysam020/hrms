// Shared recording harness for the /product-demo videos.
//
// The real Praesto web app (a local dev build) runs in Chromium; every /api
// call is answered in the browser by the marketing library's fictional
// "Halcyon Labs" fixtures (~/Downloads/marketing/tools/fixtures.mjs). No
// request reaches a backend or a database, so recording can't read or
// change anyone's real data, send a notification or run a payroll.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

export const MARKETING_TOOLS =
  process.env.MARKETING_TOOLS ||
  path.join(homedir(), "Downloads/marketing/tools");
const req = createRequire(path.join(MARKETING_TOOLS, "package.json"));
export const { chromium } = req("playwright");
const { buildFixtures, morningZone } = await import(
  path.join(MARKETING_TOOLS, "fixtures.mjs")
);

export const BASE = process.env.PRAESTO_URL || "https://localhost:5199";

/** 1440×810 CSS px at 4/3 = 1920×1080 frames: 1080p, UI at a readable size. */
export const VIEWPORT = { width: 1440, height: 810 };
export const SCALE = 4 / 3;

export async function demoContext(browser, extra = []) {
  const { zone, offMin } = morningZone();
  process.env.TZ = zone;
  const { fixtures } = buildFixtures(new Date(), offMin);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    serviceWorkers: "block",
    ignoreHTTPSErrors: true, // the local dev server's self-signed certificate
    // As for a visitor who has allowed notifications (headless otherwise
    // reports them as blocked).
    permissions: ["notifications"],
    colorScheme: "light",
    locale: "en-IN",
    timezoneId: zone,
    reducedMotion: "no-preference",
  });
  const posted = [];
  await context.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api\/v1/, "");
    const method = route.request().method();
    if (method !== "GET") posted.push(`${method} ${p}`);
    const hit = [...extra, ...fixtures].find(
      ([re, , m]) => re.test(p) && (!m || m === method),
    );
    let body = hit ? hit[1] : { success: true, data: [] };
    if (typeof body === "function") body = await body(url, route.request());
    const status = body && body.__status ? body.__status : 200;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  // Anything else that would leave the machine (sockets, push, analytics).
  await context.route("**/socket.io/**", (r) => r.abort());
  await context.route(
    (u) =>
      /googletagmanager|google-analytics|firebaseio|googleapis|fcmregistrations/.test(
        u.hostname,
      ),
    (r) => r.abort(),
  );
  await context.addInitScript(() => {
    try {
      localStorage.setItem("px-appearance", "light");
    } catch {}
    // Headless Chromium reports notifications as denied even when allowed.
    try {
      Object.defineProperty(Notification, "permission", {
        get: () => "granted",
      });
    } catch {}
  });
  context.posted = posted;
  return context;
}

/** Wait until the page has settled: no skeletons, fonts loaded. */
export async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => !document.querySelector('[aria-busy="true"], [data-skeleton]'),
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  await page.waitForTimeout(ms);
}
