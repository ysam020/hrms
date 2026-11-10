// Prints a screen's interactive outline (headings, buttons, links, tabs,
// fields, rows) from the accessibility tree, for writing flows.
//
//   node product-demo-assets/tools/aria.mjs <path>[@click text] ...
//
// "path@Some button" clicks the first element with that accessible name
// (button, tab, link or row) after load and prints the result instead.
import { chromium, demoContext, settle, BASE } from "./harness.mjs";
import { EXTRA, CATALOGUE_EXTRA } from "./extras.mjs";

const KEEP =
  /^\s*- (heading|button|link|tab|radio|textbox|combobox|switch|checkbox|spinbutton|row|dialog|menuitem|option)\b/;
const browser = await chromium.launch();
for (const arg of process.argv.slice(2)) {
  const [path, ...clicks] = arg.split("@");
  const ctx = await demoContext(browser, [...EXTRA, ...CATALOGUE_EXTRA]);
  const page = await ctx.newPage();
  await page.goto(BASE + path);
  await settle(page, 800);
  for (const c of clicks) {
    const l = page
      .getByRole("button", { name: c })
      .or(page.getByRole("tab", { name: c }))
      .or(page.getByRole("link", { name: c }))
      .or(page.getByRole("row", { name: c }))
      .or(page.getByText(c, { exact: true }))
      .first();
    await l
      .click({ timeout: 5000 })
      .catch((e) =>
        console.log(`  (click "${c}" failed: ${e.message.split("\n")[0]})`),
      );
    await page.waitForTimeout(900);
  }
  const root = (await page.locator("[role=dialog]").count())
    ? page.locator("[role=dialog]").last()
    : page.locator("main");
  const snap = await root
    .ariaSnapshot()
    .catch(() => page.locator("body").ariaSnapshot());
  const lines = snap
    .split("\n")
    .filter((l) => KEEP.test(l))
    .map((l) => l.replace(/\s+\[ref=[^\]]+\]/g, "").slice(0, 130));
  console.log(
    `== ${arg}\n${lines.slice(0, 60).join("\n")}${lines.length > 60 ? `\n  … ${lines.length - 60} more` : ""}`,
  );
  await ctx.close();
}
await browser.close();
