// Prerenders the public pages into static HTML, so search engines, social
// previews and first paint get real content instead of an empty shell.
//
// Runs after `vite build` (client, with manifest) and
// `vite build --ssr src/prerender/entry.tsx` (renderer). For each page in
// PUBLIC_PAGES marked `prerender` it writes the client's index.html with the
// page's markup in #root and its metadata, CSS and chunk preloads in <head>:
//
//   /                -> dist/index.html
//   /privacy-policy  -> dist/privacy-policy.html  (and so on)
//
// The app still mounts as before and replaces the markup. dist/index.html is
// also the hosting's SPA fallback for every in-app route, so a guard in
// <head> hides the prerendered page whenever the URL is a different route,
// showing the usual loader instead. The service worker serves in-app routes
// dist/app.html (the unprerendered page) instead. Also writes
// dist/sitemap.xml.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// React's production build: no dev-only warnings in the output, and faster.
process.env.NODE_ENV ??= "production";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const ssrDir = path.join(root, "dist-prerender");
const manifestPath = path.join(dist, ".vite/manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const {
  render,
  structuredData,
  watchPages,
  PUBLIC_PAGES,
  SITE_URL,
  SITE_NAME,
  OG_IMAGE,
} = await import(pathToFileURL(path.join(ssrDir, "entry.js")).href);

// The lazily loaded route module each page needs (see src/app/router.tsx).
const ROUTE_MODULE = {
  "/": "src/features/landing/Landing.tsx",
  "/privacy-policy": "src/features/public/Public.tsx",
  "/terms-of-use": "src/features/public/Public.tsx",
  "/refund-policy": "src/features/public/Public.tsx",
  "/product-demo": "src/features/product-demo/ProductDemo.tsx",
  "/watch/*": "src/features/product-demo/Watch.tsx",
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** A chunk's own file and CSS, and those of everything it imports. */
function chunkAssets(key, seen = new Set()) {
  const out = { js: [], css: [] };
  if (seen.has(key) || !manifest[key]) return out;
  seen.add(key);
  const c = manifest[key];
  out.js.push(c.file);
  out.css.push(...(c.css ?? []));
  for (const dep of c.imports ?? []) {
    const d = chunkAssets(dep, seen);
    out.js.push(...d.js);
    out.css.push(...d.css);
  }
  return out;
}

/**
 * The page's route chunk, its imports and their CSS, minus what index.html
 * already loads. Placed after index.html's own stylesheets so the cascade
 * matches the running app, where route CSS arrives after the app's.
 */
function pageAssets(pagePath) {
  const module =
    ROUTE_MODULE[pagePath.startsWith("/watch/") ? "/watch/*" : pagePath];
  if (!manifest[module])
    throw new Error(`prerender: ${module} isn't in the build manifest`);
  const { js, css } = chunkAssets(module);
  const fresh = (f) => !template.includes(`/${f}"`);
  return [
    ...[...new Set(css)]
      .filter(fresh)
      .map((f) => `<link rel="stylesheet" crossorigin href="/${f}" />`),
    ...[...new Set(js)]
      .filter(fresh)
      .map((f) => `<link rel="modulepreload" crossorigin href="/${f}" />`),
  ].join("\n    ");
}

const SITE_IMAGE = {
  url: OG_IMAGE,
  width: 1200,
  height: 630,
  alt: "Praesto’s Today screen: hours worked, a month of attendance and requests awaiting a decision.",
};

function head(pagePath, meta) {
  const url = `${SITE_URL}${pagePath}`;
  const image = meta.image ?? SITE_IMAGE;
  const jsonLd = structuredData(pagePath).map(
    (d) =>
      `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`,
  );
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${pagePath.startsWith("/watch/") ? "video.other" : "website"}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${esc(image.url)}" />`,
    `<meta property="og:image:width" content="${image.width}" />`,
    `<meta property="og:image:height" content="${image.height}" />`,
    `<meta property="og:image:alt" content="${esc(image.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image.url)}" />`,
    // Another route served this file (SPA fallback, service worker shell):
    // hide the prerendered page and show the loader until the app mounts.
    // public/theme-init.js sets data-spa: the CSP allows no inline scripts.
    `<style>[data-prerender]{display:contents}html:not([data-spa]) #initial-loader{display:none}html[data-spa] [data-prerender]{display:none}</style>`,
    `<meta name="prerender-path" content="${esc(pagePath)}" />`,
    ...jsonLd,
  ].join("\n    ");
}

function page(pagePath, meta) {
  const html = render(pagePath);
  const replace = (from, to) => {
    if (!from.test(out))
      throw new Error(`prerender: ${from} not in index.html`);
    out = out.replace(from, to);
  };
  let out = template;
  replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(meta.description)}" />`,
  );
  replace(/<!--seo-head-->/, () => head(pagePath, meta));
  replace(/<\/head>/, () => `  ${pageAssets(pagePath)}\n  </head>`);
  replace(
    /<!--prerender-->/,
    () => `<div data-prerender="${pagePath}">${html}</div>`,
  );
  return out;
}

// The service worker's shell for in-app routes: index.html as Vite built
// it, without the landing page's markup, preloads and stylesheet.
fs.writeFileSync(path.join(dist, "app.html"), template);
console.log("[prerender] app shell -> dist/app.html");

const pages = Object.entries(PUBLIC_PAGES).filter(([, m]) => m.prerender);
for (const [pagePath, meta] of pages) {
  const file = pagePath === "/" ? "index.html" : `${pagePath.slice(1)}.html`;
  fs.writeFileSync(path.join(dist, file), page(pagePath, meta));
  console.log(`[prerender] ${pagePath} -> dist/${file}`);
}

// A page per product video (/watch/<id> -> dist/watch/<id>.html).
const watch = watchPages();
fs.mkdirSync(path.join(dist, "watch"), { recursive: true });
for (const w of watch) {
  fs.writeFileSync(path.join(dist, `${w.path.slice(1)}.html`), page(w.path, w));
}
console.log(`[prerender] ${watch.length} video pages -> dist/watch/<id>.html`);

const urls = [...pages.map(([p]) => p), ...watch.map((w) => w.path)];
fs.writeFileSync(
  path.join(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n")}
</urlset>
`,
);
console.log(`[prerender] dist/sitemap.xml (${urls.length} URLs)`);

// Build-only artefacts: don't deploy the manifest or the renderer.
fs.rmSync(path.dirname(manifestPath), { recursive: true, force: true });
fs.rmSync(ssrDir, { recursive: true, force: true });
