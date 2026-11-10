// Uploads the validated HLS output to S3 under product-demo/.
//
//   node product-demo-assets/tools/validate-hls.mjs && \
//   node product-demo-assets/tools/upload.mjs [--dry-run]
//
// Layout (keys mirror manifest.json paths):
//   product-demo/<module>/<id>/<rev>/master.m3u8, <height>p/…, subtitles/…,
//                                    thumbnail.jpg
//   product-demo/manifests/catalogue.json
// <rev> is a content hash of the recording, so every object under it is
// immutable and cached for a year; playlists, subtitles and the catalogue
// get 5 minutes so a fix reaches viewers quickly. source.mp4 (mezzanine) and
// timeline.json stay local.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");
const acct = execFileSync("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text"], { encoding: "utf8" }).trim();
const BUCKET = process.env.PRODUCT_DEMO_BUCKET || `praesto-product-demo-${acct}`;
const PREFIX = "product-demo";

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=300, stale-while-revalidate=60";
const TYPES = [
  // [glob, content type, cache control]
  ["*.m4s", "video/iso.segment", IMMUTABLE],
  ["*.mp4", "video/mp4", IMMUTABLE], // init.mp4 (source.mp4 is excluded)
  ["*.ts", "video/mp2t", IMMUTABLE],
  ["*.jpg", "image/jpeg", IMMUTABLE],
  ["*.m3u8", "application/vnd.apple.mpegurl", SHORT],
  ["*.vtt", "text/vtt; charset=utf-8", SHORT],
];

const manifest = JSON.parse(readFileSync(`${ROOT}manifest.json`, "utf8"));
const aws = (args) => {
  console.log(`aws ${args.join(" ").replace(acct, "<acct>")}`);
  if (!DRY) execFileSync("aws", args, { stdio: ["ignore", "ignore", "inherit"] });
};

let n = 0;
for (const m of manifest.modules) {
  for (const v of m.videos) {
    const key = path.dirname(v.hls); // <module>/<id>/<rev>
    const localDir = path.join(ROOT, m.id, v.id);
    for (const [glob, type, cache] of TYPES) {
      aws([
        "s3", "cp", localDir, `s3://${BUCKET}/${PREFIX}/${key}`, "--recursive", "--only-show-errors",
        "--exclude", "*", "--include", glob, "--exclude", "source.mp4", "--exclude", "timeline.json",
        "--content-type", type, "--cache-control", cache, "--metadata-directive", "REPLACE",
      ]);
    }
    n++;
  }
}
aws([
  "s3", "cp", `${ROOT}manifest.json`, `s3://${BUCKET}/${PREFIX}/manifests/catalogue.json`, "--only-show-errors",
  "--content-type", "application/json", "--cache-control", SHORT,
]);
console.log(`${DRY ? "[dry run] " : ""}uploaded ${n} videos to s3://praesto-product-demo-<acct>/${PREFIX}/`);
