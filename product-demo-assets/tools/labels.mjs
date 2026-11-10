import { chromium, demoContext, settle, BASE } from "./harness.mjs";
import { EXTRA } from "./extras.mjs";
const browser = await chromium.launch();
for (const p of process.argv.slice(2)) {
  const ctx = await demoContext(browser, EXTRA);
  const page = await ctx.newPage();
  await page.goto(BASE + p);
  await settle(page, 800);
  const out = await page.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const els = main.querySelectorAll("button,a,[role=tab],[role=radio],input,select,textarea,[role=row]");
    return [...els].slice(0, 70).map((e) => `${e.getAttribute("role") || e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.getAttribute("type") || "").trim().replace(/\s+/g, " ").slice(0, 60)}`);
  });
  console.log("==", p, "\n" + out.join(" | "));
  await ctx.close();
}
await browser.close();
