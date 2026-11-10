// A local stand-in for the CloudFront distribution, for testing the player
// before the real CDN exists. Serves the same keys as S3
// (/product-demo/<module>/<id>/<rev>/…) from product-demo-assets/, with the
// headers upload.mjs sets and the SimpleCORS policy adds.
//
//   node product-demo-assets/tools/cdn-local.mjs [port=5299]
//   VITE_PRODUCT_DEMO_CDN_URL=http://localhost:5299/product-demo
//
// GET /__log returns (and clears) the requests served, for tests.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = Number(process.argv[2] || 5299);
const TYPES = {
  ".m3u8": ["application/vnd.apple.mpegurl", "public, max-age=300"],
  ".m4s": ["video/iso.segment", "public, max-age=31536000, immutable"],
  ".mp4": ["video/mp4", "public, max-age=31536000, immutable"],
  ".vtt": ["text/vtt; charset=utf-8", "public, max-age=300"],
  ".jpg": ["image/jpeg", "public, max-age=31536000, immutable"],
  ".json": ["application/json", "public, max-age=300"],
};
let log = [];

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (url.pathname === "/__log") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(log));
    log = [];
    return;
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
    res.writeHead(204).end();
    return;
  }
  let rel = decodeURIComponent(url.pathname).replace(/^\/product-demo\//, "");
  if (rel === "manifests/catalogue.json") rel = "manifest.json";
  rel = rel.replace(/^([^/]+\/[^/]+)\/[0-9a-f]{10}\//, "$1/");
  const file = path.join(ROOT, rel);
  const blocked =
    !file.startsWith(ROOT) || /source\.mp4$|timeline\.json$/.test(file);
  if (blocked || !existsSync(file) || !statSync(file).isFile()) {
    log.push({ path: url.pathname, status: 404 });
    res.writeHead(blocked ? 403 : 404).end();
    return;
  }
  const [type, cache] = TYPES[path.extname(file)] ?? [
    "application/octet-stream",
    "no-store",
  ];
  const size = statSync(file).size;
  log.push({ path: url.pathname, status: 200, bytes: size });
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Length": size,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(PORT, () =>
  console.log(`local CDN on http://localhost:${PORT}/product-demo`),
);
