// Renders "Praesto: The Complete Tour" (film/script.mjs): one film of the
// whole product, for YouTube and for /product-demo.
//
//   node product-demo-assets/tools/film.mjs [--preview]
//
//   --preview   stills of every card (film/preview/), nothing encoded
//
// Steps:
//  1. Narration for the cards' lines (Polly, cached like the demos').
//  2. A plan: each scene's length, where it starts, its cues. Clips are cut
//     on the recordings' chapter boundaries, so no sentence is clipped; each
//     holds its first frame through the transition in and its last frame
//     until its narration has finished.
//  3. Cards are rendered in Chromium with every CSS animation paused and
//     stepped frame by frame (exact 30 fps); clips are laid into a window
//     frame over the same background.
//  4. Scenes are joined with crossfades (a slide between clips of the same
//     part) into film/praesto-tour/source.mp4, with timeline.json.
//  5. build-hls.mjs's build(): the HLS ladder, English and Hindi narration
//     tracks, subtitles. Then the YouTube files in film/youtube/:
//     praesto-tour-en.mp4 / -hi.mp4, subtitles (.vtt), thumbnail.jpg, and
//     description.txt with the chapter list.
// Then: node tools/build-hls.mjs --manifest-only && node tools/upload.mjs
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { chromium } from "./harness.mjs";
import { FILM, SCENES } from "./film/script.mjs";
import * as cards from "./film/cards.mjs";
import { MODULES } from "./modules.mjs";
import { pool, spokenEnglish, spokenHindi, synth } from "./narrate.mjs";
import { build, FILM_DIR } from "./build-hls.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const WORK = `${ROOT}film/.work/`;
const YT = `${ROOT}film/youtube/`;
const FPS = 30;
const T = 0.7; // transition, s
const BREATH = 0.45; // between a card's lines, s
const PREVIEW = process.argv.includes("--preview");
mkdirSync(WORK, { recursive: true });

const frames = (s) => Math.round(s * FPS);
const snap = (s) => frames(s) / FPS;
const manifest = JSON.parse(readFileSync(`${ROOT}manifest.json`, "utf8"));
const videoTitle = (id) =>
  manifest.modules.flatMap((m) => m.videos).find((v) => v.id === id).title;
const moduleOf = (id) => MODULES.find((m) => m.id === id);
const timeline = (module, id) =>
  JSON.parse(readFileSync(`${ROOT}${module}/${id}/timeline.json`, "utf8"));

// ── 1. Narration for the cards ────────────────────────────────────────────
const lines = SCENES.flatMap((s) => s.lines ?? []);
const voiced = await pool(
  lines.flatMap((l) => [
    async () => synth("en", l[2] ?? spokenEnglish(l[0])),
    async () => synth("hi", l[3] ?? spokenHindi(l[1])),
  ]),
  3,
);
const voiceOf = new Map(
  lines.map((l, i) => [l, { en: voiced[2 * i], hi: voiced[2 * i + 1] }]),
);

// ── 2. The plan ───────────────────────────────────────────────────────────
const plan = [];
for (const [i, s] of SCENES.entries()) {
  if (s.kind === "card") {
    const lead = s.lead ?? T + 0.35;
    let at = lead;
    const marks = [];
    const cues = [];
    for (const l of s.lines) {
      const voice = voiceOf.get(l);
      const len = Math.max(voice.en.duration, voice.hi.duration);
      marks.push(at);
      cues.push({ start: at, end: at + len, en: l[0], hi: l[1], voice });
      at += len + BREATH;
    }
    const length = snap(s.lines.length ? at - BREATH + 1.4 + T : (s.hold ?? 4));
    plan.push({ ...s, i, length, marks, cues });
  } else {
    const t = timeline(s.module, s.video);
    const chapter = (title) => {
      const c = t.chapters.find((c) => c.title === title);
      if (!c) throw new Error(`${s.video}: no chapter "${title}"`);
      return c.startTime;
    };
    // Cut just before the chapter's first line, and just before the next
    // chapter's (or at the end).
    const firstCue = (at) => t.cues.find((c) => c.start >= at - 0.25);
    const from = Math.max(0, (firstCue(chapter(s.from))?.start ?? 0) - 0.3);
    const to = s.to
      ? (firstCue(chapter(s.to))?.start ?? t.duration) - 0.15
      : t.duration;
    const inside = t.cues.filter((c) => c.start >= from - 0.01 && c.start < to);
    if (!inside.length) throw new Error(`${s.video}: no narration in the cut`);
    const lead = T + 0.25;
    const spoken = Math.max(
      ...inside.map(
        (c) =>
          c.start -
          from +
          Math.max(c.voice.en.duration, c.voice.hi.duration, c.end - c.start),
      ),
    );
    const tail = Math.max(0.4, spoken + 0.6 + T - (to - from));
    const length = snap(lead + (to - from) + tail);
    const cues = inside.map((c) => ({
      ...c,
      start: lead + (c.start - from),
      end: lead + (c.end - from),
    }));
    plan.push({
      ...s,
      i,
      from,
      to,
      lead,
      tail,
      length,
      cues,
      title: videoTitle(s.video),
    });
  }
}
let at = 0;
for (const p of plan) {
  p.start = snap(at);
  at = p.start + p.length - T;
}
const total = snap(plan.at(-1).start + plan.at(-1).length);
const minutes = Math.round(total / 60);
console.log(
  `plan: ${plan.length} scenes, ${(total / 60).toFixed(1)} min (${plan.filter((p) => p.kind === "clip").length} clips)`,
);

// Section numbering for frames and cards.
const sections = plan.filter((p) => p.card === "section");
const sectionOf = (module) => sections.find((p) => p.module === module);

function cardHtml(p) {
  switch (p.card) {
    case "open":
      return cards.open();
    case "pitch":
      return cards.pitch({ marks: p.marks });
    case "agenda":
      return cards.agenda({ modules: MODULES, minutes });
    case "section":
      return cards.section({
        module: moduleOf(p.module),
        index: p.index,
        of: p.of,
        highlights: p.highlights.map(videoTitle),
      });
    case "outro":
      return cards.outro({ marks: p.marks });
    case "end":
      return cards.end();
  }
  throw new Error(`unknown card ${p.card}`);
}

// ── 3. Render ─────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

async function show(html) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}
const seek = (ms) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);

const hash = (...parts) =>
  createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);

function ffmpeg(args, input) {
  return new Promise((ok, fail) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], {
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    p.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)),
    );
    if (input) input(p.stdin);
  });
}
const X264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-r", String(FPS)];

async function renderCard(p, out) {
  await show(cardHtml(p));
  const n = frames(p.length);
  await ffmpeg(
    ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", ...X264, "-frames:v", String(n), out],
    async (stdin) => {
      for (let f = 0; f < n; f++) {
        await seek((f / FPS) * 1000);
        const jpg = await page.screenshot({ type: "jpeg", quality: 94 });
        if (!stdin.write(jpg))
          await new Promise((ok) => stdin.once("drain", ok));
      }
      stdin.end();
    },
  );
}

async function still(html, out, size) {
  if (size) await page.setViewportSize(size);
  await show(html);
  await seek(60_000);
  await page.screenshot({ path: out, type: "png" });
  if (size) await page.setViewportSize({ width: 1920, height: 1080 });
}

async function renderClip(p, out) {
  const sec = sectionOf(p.module);
  const bg = `${WORK}frame-${p.video}.png`;
  const mask = `${WORK}frame-mask.png`;
  await still(
    cards.frame({ module: moduleOf(p.module), title: p.title, index: sec.index, of: sec.of }),
    bg,
  );
  if (!existsSync(mask))
    await still(cards.frameMask(), mask, { width: cards.FRAME.w, height: cards.FRAME.h });
  const { x, y, w, h } = cards.FRAME;
  const len = p.length.toFixed(3);
  await ffmpeg([
    "-loop", "1", "-t", len, "-i", bg,
    "-ss", p.from.toFixed(3), "-t", (p.to - p.from).toFixed(3), "-i", `${ROOT}${p.module}/${p.video}/source.mp4`,
    "-loop", "1", "-t", len, "-i", mask,
    "-filter_complex",
    `[1:v]fps=${FPS},scale=${w}:${h}:flags=lanczos,tpad=start_duration=${p.lead.toFixed(3)}:start_mode=clone:stop_duration=${(p.tail + 1).toFixed(3)}:stop_mode=clone,format=yuva420p[v];` +
      `[2:v]fps=${FPS},format=gray[m];[v][m]alphamerge[vm];` +
      `[0:v]fps=${FPS},format=yuv420p[bg];[bg][vm]overlay=${x}:${y}:shortest=1,format=yuv420p[o]`,
    "-map", "[o]", ...X264, "-frames:v", String(frames(p.length)), out,
  ]);
}

if (PREVIEW) {
  const dir = `${ROOT}film/preview/`;
  mkdirSync(dir, { recursive: true });
  for (const p of plan.filter((p) => p.kind === "card")) {
    await show(cardHtml(p));
    for (const t of [0.6, 1.6, ...p.marks.map((m) => m + 1.6), p.length - T - 0.1]) {
      await seek(t * 1000);
      await page.screenshot({ path: `${dir}${String(p.i).padStart(2, "0")}-${p.card}-${t.toFixed(1)}.jpg`, type: "jpeg", quality: 80 });
    }
  }
  const c = plan.find((p) => p.kind === "clip");
  const sec = sectionOf(c.module);
  await still(cards.frame({ module: moduleOf(c.module), title: c.title, index: sec.index, of: sec.of }), `${dir}frame.png`);
  console.log(`preview stills in ${dir}`);
  await browser.close();
  process.exit(0);
}

const parts = [];
for (const p of plan) {
  const key =
    p.kind === "card"
      ? hash("card", cardHtml(p), p.length, readFileSync(new URL("./film/cards.mjs", import.meta.url)))
      : hash("clip", p.video, p.from, p.to, p.length, p.lead, p.title, readFileSync(`${ROOT}${p.module}/${p.video}/timeline.json`), readFileSync(new URL("./film/cards.mjs", import.meta.url)));
  const out = `${WORK}${String(p.i).padStart(2, "0")}-${key}.mp4`;
  if (!existsSync(out)) {
    const tmp = `${out}.part.mp4`;
    const t0 = Date.now();
    if (p.kind === "card") await renderCard(p, tmp);
    else await renderClip(p, tmp);
    renameSync(tmp, out);
    console.log(`  ✓ ${String(p.i).padStart(2, "0")} ${p.kind} ${p.card ?? p.video} ${p.length.toFixed(1)}s (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  parts.push(out);
}

// Thumbnail: the film's own, over a frame of the product.
mkdirSync(YT, { recursive: true });
const shot = `data:image/jpeg;base64,${readFileSync(`${ROOT}overview/today-at-a-glance/thumbnail.jpg`).toString("base64")}`;
await still(cards.thumbnail({ shot, minutes }), `${WORK}thumbnail.png`);
await browser.close();

// ── 4. Join ───────────────────────────────────────────────────────────────
mkdirSync(FILM_DIR, { recursive: true });
const sameSection = (a, b) =>
  a.kind === "clip" && b.kind === "clip" && a.module === b.module;
const graph = [];
let last = "[0:v]";
for (let k = 1; k < plan.length; k++) {
  const kind = sameSection(plan[k - 1], plan[k])
    ? "smoothleft"
    : plan[k].card === "end"
      ? "fadeblack"
      : "fade";
  const out = k === plan.length - 1 ? "[film]" : `[x${k}]`;
  graph.push(`${last}[${k}:v]xfade=transition=${kind}:duration=${T}:offset=${plan[k].start.toFixed(4)}${out}`);
  last = out;
}
const source = `${FILM_DIR}source.mp4`;
await ffmpeg([
  ...parts.flatMap((f) => ["-i", f]),
  "-filter_complex", graph.join(";"),
  "-map", "[film]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-frames:v", String(frames(total)),
  "-movflags", "+faststart",
  `${source}.part.mp4`,
]);
renameSync(`${source}.part.mp4`, source);

// Timeline: cues in film time, a chapter per part.
const cues = plan.flatMap((p) =>
  p.cues.map((c) => ({
    ...c,
    start: Math.round((p.start + c.start) * 100) / 100,
    end: Math.round((p.start + c.end) * 100) / 100,
  })),
);
const chapters = plan
  .filter((p) => p.kind === "card" && (p.chapter !== undefined || p.card === "section"))
  .filter((p) => p.chapter !== undefined || p.card === "section")
  .map((p) => ({
    title: p.card === "section" ? moduleOf(p.module).title : p.chapter,
    startTime: Math.round(p.start * 10) / 10,
  }))
  .filter((c) => c.title);
const film = {
  id: FILM.id,
  module: "film",
  title: FILM.title,
  description: FILM.description,
  duration: total,
  captureFps: FPS,
  chapters,
  cues,
  recordedAt: new Date().toISOString(),
  scenes: plan.map((p) => ({ kind: p.kind, card: p.card, video: p.video, start: p.start, length: p.length })),
};
writeFileSync(`${FILM_DIR}timeline.json`, JSON.stringify(film, null, 1) + "\n");

// ── 5. HLS and the YouTube files ──────────────────────────────────────────
build(FILM_DIR, film);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${WORK}thumbnail.png`, "-vf", "scale=1280:720:flags=lanczos", "-q:v", "2", `${FILM_DIR}thumbnail.jpg`]);
copyFileSync(`${FILM_DIR}thumbnail.jpg`, `${YT}thumbnail.jpg`);

for (const lang of ["en", "hi"]) {
  await ffmpeg([
    "-i", source, "-i", `${FILM_DIR}audio-${lang}.m4a`,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000",
    "-metadata", `title=${FILM.title}`, "-metadata:s:a:0", `language=${lang === "en" ? "eng" : "hin"}`,
    "-movflags", "+faststart", "-shortest",
    `${YT}praesto-tour-${lang}.mp4`,
  ]);
  copyFileSync(`${FILM_DIR}subtitles/${lang}.vtt`, `${YT}praesto-tour-${lang}.vtt`);
}
const stamp = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
writeFileSync(
  `${YT}description.txt`,
  `${FILM.title}\n\n${FILM.description} Recorded in the real product; the organisation, people and figures are fictional.\n\n` +
    `Try Praesto free for 14 days: https://praesto.in\nWatch any part on its own: https://praesto.in/product-demo\n\n` +
    `Chapters\n${chapters.map((c) => `${stamp(c.startTime)} ${c.title}`).join("\n")}\n`,
);
rmSync(`${ROOT}film/preview`, { recursive: true, force: true });
console.log(
  `✓ ${FILM.title}: ${(total / 60).toFixed(1)} min, ${chapters.length} chapters, ${cues.length} cues\n  ${FILM_DIR}\n  ${YT}`,
);
