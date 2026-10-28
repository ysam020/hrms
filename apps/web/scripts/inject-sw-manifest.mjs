// Writes the precache manifest into the built service worker
// (dist/firebase-messaging-sw.js), replacing `self.__WB_MANIFEST`.
//
// Precached: the app shell and every hashed JS/CSS chunk, the offline page,
// and the small static files the shell needs. Not precached: the landing
// page's product screenshots (large; cached on first view instead), source
// maps, and the worker itself.
import { injectManifest } from "workbox-build";
import path from "path";
import { fileURLToPath } from "url";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const sw = path.join(dist, "firebase-messaging-sw.js");

const { count, size, warnings } = await injectManifest({
  swSrc: sw,
  swDest: sw,
  globDirectory: dist,
  globPatterns: [
    "index.html",
    "offline.html",
    "assets/**/*.{js,css,woff2,woff,svg,png,wasm}",
    "*.{js,ico,png,json,wasm}",
  ],
  globIgnores: [
    "firebase-messaging-sw.js",
    "**/*.map",
    "images/product-showcase/**",
    "og-image.png", // for link previews, never shown in the app
  ],
  // Hashed filenames are their own version; don't add a revision query.
  dontCacheBustURLsMatching: /\/assets\/.+-[A-Za-z0-9_-]{8,}\./,
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
});
for (const w of warnings) console.warn(`[sw] ${w}`);
console.log(
  `[sw] precached ${count} files, ${(size / 1024 / 1024).toFixed(1)} MB`,
);
