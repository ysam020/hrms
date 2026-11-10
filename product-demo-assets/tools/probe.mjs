// Lists the API calls a screen makes that the fixtures don't answer.
import { chromium, demoContext, settle, BASE, MARKETING_TOOLS } from "./harness.mjs";
import { EXTRA } from "./extras.mjs";
const { buildFixtures } = await import(MARKETING_TOOLS + "/fixtures.mjs");
const { fixtures } = buildFixtures(new Date(), 330);
const browser = await chromium.launch();
for (const p of process.argv.slice(2)) {
  const ctx = await demoContext(browser, EXTRA);
  const page = await ctx.newPage();
  const miss = new Set();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/v1")) return;
    const path = u.pathname.slice(7);
    if (![...EXTRA, ...fixtures].some(([re]) => re.test(path))) miss.add(r.method() + " " + path + u.search);
  });
  await page.goto(BASE + p);
  await settle(page, 1000);
  console.log(p, [...miss]);
  await ctx.close();
}
await browser.close();
