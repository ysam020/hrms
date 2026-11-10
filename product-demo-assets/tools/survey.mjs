import { mkdirSync } from "node:fs";
import { chromium, demoContext, settle, BASE } from "./harness.mjs";
const OUT = new URL("../survey/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const paths = process.argv.slice(2);
const browser = await chromium.launch();
for (const p of paths) {
  const { EXTRA } = await import("./extras.mjs");
  const ctx = await demoContext(browser, EXTRA);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + p);
  await settle(page, 1200);
  const name = p.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({
    path: `${OUT}${name}.jpg`,
    type: "jpeg",
    quality: 70,
  });
  console.log(p, "->", name, errs.length ? "ERR " + errs[0].slice(0, 120) : "");
  await ctx.close();
}
await browser.close();
