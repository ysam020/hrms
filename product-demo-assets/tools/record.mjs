// Records the /product-demo videos from the real Praesto web app.
//
//   1. cd apps/web && npx vite --port 5199
//   2. node product-demo-assets/tools/record.mjs [video-id ...]
//
// Each flow (flows.mjs) drives the app like a person would. While it runs it
// marks chapters (rec.chapter) and subtitle cues (rec.say), so chapter
// timestamps and subtitle timings come from the recording itself, never
// from estimates. Output per video, in product-demo-assets/<module>/<id>/:
//   source.mp4      1920×1080, 30 fps, H.264 mezzanine (input to build-hls)
//   timeline.json   chapters, cues (English + Hindi), duration, API writes
//
// Frames are full-resolution screenshots taken in a loop (Chromium's
// screencast only delivers CSS-pixel frames), then laid on a constant 30 fps
// timeline. Loading happens before the first frame, so it is never on camera.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, demoContext, settle, BASE, VIEWPORT } from "./harness.mjs";
import { EXTRA, CATALOGUE_EXTRA } from "./extras.mjs";
import { FLOWS } from "./flows.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const FPS = 30;
/** Dwell multiplier for rec.wait. The narration sets the pace (below). */
const PACE = Number(process.env.PACE || 1);
/** Silence between one narrated line and the next. */
const BREATH = 0.45;

// Narration clips and their durations (narrate.mjs). A cue's next line can't
// start until the longer of its English and Hindi narration has finished.
const NARRATION = existsSync(`${ROOT}narration.json`)
  ? JSON.parse(readFileSync(`${ROOT}narration.json`, "utf8")).cues
  : null;
function voiceFor(en) {
  const v = NARRATION?.[en];
  if (!v)
    throw new Error(`no narration for "${en}": run tools/narrate.mjs first`);
  return v;
}

/** A visible pointer and click ripple; headless screenshots have no cursor. */
function cursorOverlay() {
  const install = () => {
    if (document.getElementById("__demo-cursor")) return;
    const c = document.createElement("div");
    c.id = "__demo-cursor";
    c.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.9-1.3-2.9-6.5h6.4z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      transform: "translate(-200px,-200px)",
      filter: "drop-shadow(0 2px 3px rgb(0 0 0 / .3))",
    });
    document.documentElement.appendChild(c);
    addEventListener(
      "mousemove",
      (e) => {
        c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`;
      },
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        Object.assign(r.style, {
          position: "fixed",
          left: `${e.clientX - 18}px`,
          top: `${e.clientY - 18}px`,
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "rgb(38 110 198 / .28)",
          border: "2px solid rgb(38 110 198 / .6)",
          zIndex: "2147483646",
          pointerEvents: "none",
          transition: "transform 420ms ease-out, opacity 420ms ease-out",
        });
        document.documentElement.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transform = "scale(1.6)";
          r.style.opacity = "0";
        });
        setTimeout(() => r.remove(), 500);
      },
      true,
    );
  };
  if (document.readyState === "loading")
    addEventListener("DOMContentLoaded", install);
  else install();
}

async function record(browser, id, flow) {
  const dir = `${ROOT}${flow.module}/${id}/`;
  const tmp = `${ROOT}.frames/${id}/`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(dir, { recursive: true });

  const context = await demoContext(browser, [
    ...(flow.extra || []),
    ...EXTRA,
    ...CATALOGUE_EXTRA,
  ]);
  await context.addInitScript(cursorOverlay);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + flow.path);
  await settle(page, 1200);
  let pos = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.55 };
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(150);
  if (flow.prepare) await flow.prepare(page);

  const frames = [];
  const chapters = [];
  const cues = [];
  const skipped = [];
  /** Wait until the last narrated line (both languages) has been spoken. */
  const pace = async () => {
    const last = cues.at(-1);
    if (!last) return;
    const need =
      Math.max(last.voice.en.duration, last.voice.hi.duration) + BREATH;
    const left = last.start + need - now();
    if (left > 0) await page.waitForTimeout(left * 1000);
  };
  const start = Date.now();
  const now = () => (Date.now() - start) / 1000;
  let recording = true;
  const capture = (async () => {
    while (recording) {
      const t = now();
      // During a page load a screenshot can stall; skip the frame (the
      // timeline holds the previous one) and try again.
      let jpg;
      try {
        jpg = await page.screenshot({
          type: "jpeg",
          quality: 90,
          animations: "allow",
          caret: "initial",
          scale: "device",
          timeout: 3000,
        });
      } catch {
        await new Promise((ok) => setTimeout(ok, 100));
        continue;
      }
      const file = `${String(frames.length).padStart(5, "0")}.jpg`;
      writeFileSync(tmp + file, jpg);
      frames.push({ t, file });
    }
  })();

  const rec = {
    page,
    async chapter(title) {
      await pace();
      chapters.push({ title, startTime: Math.round(now() * 10) / 10 });
    },
    /** A subtitle cue: shows from now until the next cue (or `hold` s). */
    async say(en, hi, hold) {
      const voice = voiceFor(en);
      await pace();
      cues.push({ start: now(), en, hi, hold, voice });
    },
    async wait(ms) {
      await page.waitForTimeout(ms * PACE);
    },
    /** Glide the pointer to a point, easing in and out. */
    async glide(x, y, ms = 650) {
      const from = { ...pos };
      const steps = Math.max(8, Math.round(ms / 22));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        await page.mouse.move(
          from.x + (x - from.x) * e,
          from.y + (y - from.y) * e,
        );
        await page.waitForTimeout(ms / steps);
      }
      pos = { x, y };
    },
    async point(locator, ms) {
      const l = locator.first();
      await l.waitFor({ state: "visible", timeout: 5000 });
      await l.scrollIntoViewIfNeeded();
      const b = await l.boundingBox();
      await rec.glide(b.x + Math.min(b.width / 2, 60), b.y + b.height / 2, ms);
      return l;
    },
    async click(locator, ms) {
      const l = await rec.point(locator, ms);
      await page.waitForTimeout(120);
      await page.mouse.down();
      await page.waitForTimeout(70);
      await page.mouse.up();
      return l;
    },
    async type(locator, text, delay = 55) {
      const l = await rec.click(locator);
      await l.pressSequentially(text, { delay });
    },
    /** Move to another screen in the app without a page load. */
    async navigate(to) {
      await page.evaluate((p) => {
        history.pushState({}, "", p);
        dispatchEvent(new PopStateEvent("popstate"));
      }, to);
      await page.waitForTimeout(1300);
    },
    /** A nice-to-have step: if its element isn't there, note it and go on. */
    async optional(label, fn) {
      try {
        await fn();
      } catch (e) {
        skipped.push(`${label}: ${e.message.split("\n")[0]}`);
      }
    },
    /** Smooth wheel scroll by `dy` CSS px. */
    async scroll(dy, ms = 900) {
      const steps = Math.max(10, Math.round(ms / 30));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(ms / steps);
      }
    },
  };

  let failure = null;
  try {
    await flow.run(rec);
    await pace();
    await page.waitForTimeout(flow.tail ?? 1200);
  } catch (e) {
    failure = e;
  }
  recording = false;
  await capture;
  const posted = context.posted;
  await context.close();
  if (failure) throw failure;

  // Constant frame rate: at each tick, the latest frame painted so far.
  const end = frames.at(-1).t;
  const seq = [];
  for (let i = 0, k = 0; i / FPS <= end; i++) {
    while (k + 1 < frames.length && frames[k + 1].t <= i / FPS) k++;
    seq.push(frames[k].file);
  }
  const duration = seq.length / FPS;
  writeFileSync(
    `${tmp}concat.txt`,
    seq.map((f) => `file '${tmp}${f}'\nduration ${1 / FPS}`).join("\n"),
  );
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    `${tmp}concat.txt`,
    "-vf",
    "scale=1920:1080:flags=lanczos:in_range=full:out_range=tv,format=yuv420p",
    "-color_range",
    "tv",
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "14",
    "-tune",
    "animation",
    `${dir}source.mp4`,
  ]);

  // Cues run until the next one starts (minus a short gap), or for `hold`.
  const timedCues = cues.map((c, i) => {
    const next = cues[i + 1]?.start ?? duration;
    const endAt = c.hold
      ? Math.min(c.start + c.hold, next - 0.15)
      : next - 0.15;
    return {
      start: Math.round(c.start * 100) / 100,
      end: Math.round(Math.min(endAt, duration - 0.05) * 100) / 100,
      en: c.en,
      hi: c.hi,
      voice: { en: c.voice.en, hi: c.voice.hi },
    };
  });
  if (chapters[0]) chapters[0].startTime = 0;
  writeFileSync(
    `${dir}timeline.json`,
    JSON.stringify(
      {
        id,
        module: flow.module,
        title: flow.title,
        description: flow.description,
        duration: Math.round(duration * 10) / 10,
        captureFps: Math.round((frames.length / end) * 10) / 10,
        chapters,
        cues: timedCues,
        // Writes the flow made; all were answered by fixtures in the browser.
        fixtureWrites: posted.filter((p) => !/refresh-token|csrf/.test(p)),
        pageErrors: errors,
        skippedSteps: skipped,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  rmSync(tmp, { recursive: true, force: true });
  if (skipped.length) console.log(`  ${id} skipped: ${skipped.join(" | ")}`);
  console.log(
    `✓ ${id}: ${duration.toFixed(1)} s, ${(frames.length / end).toFixed(1)} fps captured, ${chapters.length} chapters, ${cues.length} cues${errors.length ? `, ${errors.length} page errors` : ""}`,
  );
}

const only = process.argv.slice(2);
const browser = await chromium.launch();
let failed = 0;
for (const [id, flow] of Object.entries(FLOWS)) {
  if (only.length && !only.includes(id)) continue;
  try {
    await record(browser, id, flow);
  } catch (e) {
    failed++;
    console.error(`✗ ${id}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
