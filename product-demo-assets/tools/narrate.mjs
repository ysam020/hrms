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
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ENGLISH_SPOKEN, HINDI_SPOKEN } from "./glossary.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = `${ROOT}.narration/`;
export const VOICE = { id: "Kiara", engine: "generative", region: "us-east-1" };
const LANG_CODE = { en: "en-IN", hi: "hi-IN" };

/** Every r.say("english", "hindi") in flows.mjs, in order. */
export function flowCues() {
  const src = readFileSync(new URL("./flows.mjs", import.meta.url), "utf8");
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
  const out = text.replace(/[A-Za-z][A-Za-z'\-]*/g, (w) => {
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

function synth(lang, spoken) {
  const key = createHash("sha1")
    .update(`${VOICE.id}|${VOICE.engine}|${lang}|${spoken}`)
    .digest("hex")
    .slice(0, 16);
  const file = `${OUT}${lang}/${key}.mp3`;
  if (!existsSync(file)) {
    mkdirSync(`${OUT}${lang}`, { recursive: true });
    execFileSync(
      "aws",
      [
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
        file,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }
  return {
    file: file.slice(ROOT.length),
    duration: Math.round(duration(file) * 1000) / 1000,
    spoken,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const cues = flowCues();
  const index = {};
  for (const c of cues) {
    const enSpoken = spokenEnglish(c.en);
    const hiSpoken = spokenHindi(c.hi);
    if (check) continue;
    index[c.en] = { en: synth("en", enSpoken), hi: synth("hi", hiSpoken) };
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
