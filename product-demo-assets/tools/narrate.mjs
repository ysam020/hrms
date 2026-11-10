// Synthesises the narration for every subtitle cue in flows.mjs, in English
// and Hindi, with Amazon Polly's generative engine (voice Kiara, Indian
// English and Hindi).
//
//   node product-demo-assets/tools/narrate.mjs [--check]
//
// Output: product-demo-assets/.narration/<lang>/<hash>.mp3 (cached by voice,
// language and spoken text, so only changed lines are synthesised) and
// narration.json, which maps each cue's subtitle text to its clip and
// duration. record.mjs reads the durations to pace each video to its speech;
// build-hls.mjs mixes the clips into the audio tracks.
//
// What's spoken differs from the subtitles in one way: English words inside
// the Hindi are spelled for the narrator (glossary.mjs), and "Praesto" is
// respelled so both languages say PRAY-stoh. An English word missing from
// the glossary stops the run.
import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { ENGLISH_SPOKEN, HINDI_SPOKEN } from "./glossary.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = `${ROOT}.narration/`;
export const VOICE = { id: "Kiara", engine: "generative", region: "us-east-1" };
const LANG_CODE = { en: "en-IN", hi: "hi-IN" };

/** Every r.say("english", "hindi") in flows.mjs, in order. */
export function flowCues() {
  const dir = new URL("./flows/", import.meta.url);
  const src = readdirSync(dir)
    .filter((f) => f.endsWith(".mjs"))
    .sort()
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
  const str = String.raw`"((?:[^"\\]|\\.)*)"`;
  const re = new RegExp(String.raw`r\.say\(\s*${str}\s*,\s*${str}`, "g");
  return [...src.matchAll(re)].map((m) => ({
    en: JSON.parse(`"${m[1]}"`),
    hi: JSON.parse(`"${m[2]}"`),
  }));
}

export function spokenEnglish(text) {
  let s = text;
  for (const [from, to] of Object.entries(ENGLISH_SPOKEN))
    s = s.replaceAll(from, to);
  return s;
}

export function spokenHindi(text) {
  const missing = new Set();
  const out = text.replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]*/g, (w) => {
    const hit = HINDI_SPOKEN[w.toLowerCase()];
    if (!hit) missing.add(w);
    return hit ?? w;
  });
  if (missing.size)
    throw new Error(
      `glossary.mjs has no Hindi spelling for: ${[...missing].join(", ")}`,
    );
  return out;
}

const duration = (file) =>
  Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ],
      { encoding: "utf8" },
    ),
  );

const run = promisify(execFile);

export async function synth(lang, spoken) {
  const key = createHash("sha1")
    .update(`${VOICE.id}|${VOICE.engine}|${lang}|${spoken}`)
    .digest("hex")
    .slice(0, 16);
  const file = `${OUT}${lang}/${key}.mp3`;
  if (!existsSync(file)) {
    mkdirSync(`${OUT}${lang}`, { recursive: true });
    const tmp = `${file}.part`;
    for (let attempt = 1; ; attempt++) {
      try {
        await run("aws", [
          "polly",
          "synthesize-speech",
          "--region",
          VOICE.region,
          "--engine",
          VOICE.engine,
          "--voice-id",
          VOICE.id,
          "--language-code",
          LANG_CODE[lang],
          "--output-format",
          "mp3",
          "--sample-rate",
          "24000",
          "--text",
          spoken,
          tmp,
        ]);
        duration(tmp); // throws if the clip isn't valid audio
        renameSync(tmp, file);
        break;
      } catch (e) {
        rmSync(tmp, { force: true });
        if (attempt >= 6)
          throw new Error(
            `Polly failed for "${spoken.slice(0, 40)}…": ${String(e.stderr || e.message).slice(0, 200)}`,
          );
        await new Promise((ok) => setTimeout(ok, 1500 * attempt));
      }
    }
  }
  return {
    file: file.slice(ROOT.length),
    duration: Math.round(duration(file) * 1000) / 1000,
    spoken,
  };
}

/** Run `jobs` (async functions) with at most `n` at a time. */
export async function pool(jobs, n) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const cues = flowCues();
  const index = {};
  if (check) {
    const missing = new Set();
    for (const c of cues)
      try {
        spokenHindi(c.hi);
      } catch (e) {
        e.message
          .split(": ")[1]
          .split(", ")
          .forEach((w) => missing.add(w));
      }
    if (missing.size) {
      console.log(
        `missing from glossary.mjs (${missing.size}):\n${[...missing].sort().join(" ")}`,
      );
      process.exit(1);
    }
  }
  if (!check) {
    const jobs = cues.flatMap((c) => [
      async () => ["en", c.en, await synth("en", spokenEnglish(c.en))],
      async () => ["hi", c.en, await synth("hi", spokenHindi(c.hi))],
    ]);
    for (const [lang, en, clip] of await pool(jobs, 3))
      (index[en] ??= {})[lang] = clip;
  }
  if (check) {
    console.log(
      `✓ ${cues.length} cues; every English word in the Hindi has a spoken form`,
    );
  } else {
    writeFileSync(
      `${ROOT}narration.json`,
      JSON.stringify({ voice: VOICE, cues: index }, null, 1) + "\n",
    );
    const total = Object.values(index).reduce(
      (n, c) => n + c.en.duration + c.hi.duration,
      0,
    );
    const longer = Object.values(index).filter(
      (c) => c.hi.duration > c.en.duration,
    ).length;
    console.log(
      `✓ ${cues.length} cues narrated (${total.toFixed(0)} s of speech); Hindi longer than English in ${longer}`,
    );
  }
}
