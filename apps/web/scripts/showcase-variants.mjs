// Writes the smaller copies of the landing page's product screenshots that
// its <img srcset>s offer (src/features/landing/MacBookShowcase.tsx,
// showcaseSrcSet): for each 2880 × 1800 capture in
// public/images/product-showcase, <name>-1440.webp and <name>-720.webp,
// lossless like the originals. Phones pick the 720 px copy instead of the
// full capture (about a quarter of the bytes). Re-run after replacing a
// screenshot; existing copies are overwritten.
//
//   node apps/web/scripts/showcase-variants.mjs
//
// Needs `sharp`, which apps/web doesn't depend on (it's only needed when
// screenshots change): run it where sharp resolves, or point SHARP_PATH at
// an installed copy's entry file, e.g.
// node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/lib/index.js.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/images/product-showcase",
);
const sharp = (await import(process.env.SHARP_PATH ?? "sharp")).default;

const WIDTHS = [720, 1440];

for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith(".webp") || /-\d+\.webp$/.test(file)) continue;
  const src = path.join(dir, file);
  const { width } = await sharp(src).metadata();
  // Only the 16:10 desktop captures; the phone screens are already small.
  if (width !== 2880) continue;
  for (const w of WIDTHS) {
    const out = src.replace(/\.webp$/, `-${w}.webp`);
    await sharp(src).resize(w).webp({ lossless: true, effort: 6 }).toFile(out);
    console.log(
      `${path.basename(out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`,
    );
  }
}
