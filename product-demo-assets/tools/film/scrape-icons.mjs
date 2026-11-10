// One-off: the module icons as SVG markup, from the running /product-demo
// page (the web app's Icon set), so the film's cards use the same icons.
//   node tools/film/scrape-icons.mjs   (dev server on https://localhost:5199)
import { writeFileSync } from "node:fs";
import { chromium } from "../harness.mjs";
import { MODULES } from "../modules.mjs";
const b = await chromium.launch();
const p = await (await b.newContext({ ignoreHTTPSErrors: true })).newPage();
await p.goto("https://localhost:5199/product-demo"); await p.waitForTimeout(2000);
const icons = {};
for (const m of MODULES) {
  const svg = await p.locator("li button, li a").filter({ hasText: m.title }).first().locator("svg").first().evaluate((e) => e.outerHTML);
  icons[m.id] = svg.replace(/ class="[^"]*"/g, "");
}
writeFileSync(new URL("./icons.json", import.meta.url), JSON.stringify(icons, null, 1) + "\n");
console.log(Object.keys(icons).length, "icons");
await b.close();
