// Turns each recorded demo (record.mjs) into an HLS adaptive stream,
// subtitles and a thumbnail, then writes the catalogue manifest.
//
//   node product-demo-assets/tools/build-hls.mjs [video-id ...]
//
// Per video, in product-demo-assets/<module>/<id>/:
//   master.m3u8                    one entry per rendition (never upscaled)
//   <1080p|720p|480p|360p>/        playlist.m3u8, init.mp4, segment_NNN.m4s
//   subtitles/en.vtt, hi.vtt       WebVTT from the cues timed during recording
//   thumbnail.jpg                  1280×720 still from the video
//
// Encoding: H.264 High, yuv420p, 30 fps, closed GOPs with a keyframe forced
// every SEGMENT seconds on the same timestamps in every rendition, so all
// segment boundaries line up and the player can switch quality at any
// segment. Segments are fragmented MP4 (CMAF), 4 s. The demos have no audio
// track (they are silent screen recordings; the subtitles carry the words).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { MODULES } from "./modules.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const SEGMENT = 4;
const FPS = 30;

/** Ladder for screen content: crisp text needs bits mostly at 1080p/720p. */
export const LADDER = [
  {
    name: "1080p",
    w: 1920,
    h: 1080,
    bitrate: 3200,
    max: 4500,
    profile: "high",
    level: "4.0",
  },
  {
    name: "720p",
    w: 1280,
    h: 720,
    bitrate: 1800,
    max: 2600,
    profile: "high",
    level: "3.1",
  },
  {
    name: "480p",
    w: 854,
    h: 480,
    bitrate: 900,
    max: 1300,
    profile: "main",
    level: "3.0",
  },
  {
    name: "360p",
    w: 640,
    h: 360,
    bitrate: 550,
    max: 800,
    profile: "main",
    level: "3.0",
  },
];

const probe = (file, args) =>
  execFileSync("ffprobe", ["-v", "error", ...args, file], {
    encoding: "utf8",
  }).trim();

function vttTime(s) {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function writeVtt(file, cues, lang) {
  const body = cues
    .map(
      (c, i) =>
        `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)} line:85%\n${c[lang]}`,
    )
    .join("\n\n");
  writeFileSync(file, `WEBVTT\n\n${body}\n`);
}

/** Spoken languages, in menu order; the first is the default track. */
export const AUDIO = [
  { lang: "en", name: "English" },
  { lang: "hi", name: "Hindi" },
];

/**
 * One narration track: every cue's clip placed at the cue's start, padded to
 * the video's length, loudness-normalised for speech (-16 LUFS, -1.5 dBTP),
 * AAC-LC mono 96 kb/s at 48 kHz.
 */
function mixTrack(dir, t, lang) {
  const out = `${dir}audio-${lang}.m4a`;
  const clips = t.cues.filter((c) => c.voice?.[lang]);
  if (clips.length !== t.cues.length)
    throw new Error(`${t.id}: cues without ${lang} narration; re-record`);
  // Sound effects (the full tour's, film/sfx.mjs): absolute files, placed
  // and scaled like the narration, the same in every language.
  const sfx = t.sfx ?? [];
  const args = ["-y", "-loglevel", "error"];
  for (const c of clips) args.push("-i", `${ROOT}${c.voice[lang].file}`);
  for (const e of sfx) args.push("-i", e.file);
  const parts = [
    ...clips.map(
      (c, i) =>
        `[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`,
    ),
    ...sfx.map(
      (e, j) =>
        `[${clips.length + j}:a]aresample=48000,aformat=channel_layouts=mono,volume=${e.gain},adelay=${Math.round(e.start * 1000)}:all=1[a${clips.length + j}]`,
    ),
  ];
  const n = clips.length + sfx.length;
  const mix = `${Array.from({ length: n }, (_, i) => `[a${i}]`).join("")}amix=inputs=${n}:normalize=0:dropout_transition=0,apad,atrim=0:${t.duration.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=mono[out]`;
  args.push(
    "-filter_complex",
    [...parts, mix].join(";"),
    "-map",
    "[out]",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ar",
    "48000",
    "-ac",
    "1",
    out,
  );
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return out;
}

export function build(dir, t) {
  const src = `${dir}source.mp4`;
  const [sw, sh] = probe(src, [
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
  ])
    .split(",")
    .map(Number);
  // Never upscale: only rungs at or below the source size.
  const ladder = LADDER.filter((r) => r.w <= sw && r.h <= sh);

  for (const r of LADDER)
    rmSync(`${dir}${r.name}`, { recursive: true, force: true });
  for (const a of AUDIO)
    rmSync(`${dir}audio_${a.lang}`, { recursive: true, force: true });
  rmSync(`${dir}master.m3u8`, { force: true });
  const tracks = AUDIO.map((a) => mixTrack(dir, t, a.lang));

  const split = `[0:v]split=${ladder.length}${ladder.map((_, i) => `[s${i}]`).join("")}`;
  const scales = ladder.map(
    (r, i) => `[s${i}]scale=${r.w}:${r.h}:flags=lanczos,format=yuv420p[v${i}]`,
  );
  const args = ["-y", "-loglevel", "error", "-i", src];
  for (const f of tracks) args.push("-i", f);
  args.push("-filter_complex", [split, ...scales].join(";"));
  ladder.forEach((r, i) => {
    args.push(
      "-map",
      `[v${i}]`,
      `-c:v:${i}`,
      "libx264",
      `-profile:v:${i}`,
      r.profile,
      `-level:v:${i}`,
      r.level,
      `-b:v:${i}`,
      `${r.bitrate}k`,
      `-maxrate:v:${i}`,
      `${r.max}k`,
      `-bufsize:v:${i}`,
      `${r.max * 2}k`,
    );
  });
  // Narration tracks, already AAC: copied into their own renditions.
  AUDIO.forEach((_, i) => args.push("-map", `${i + 1}:a`));
  args.push("-c:a", "copy");
  args.push(
    "-preset",
    "slow",
    "-tune",
    "animation",
    "-r",
    String(FPS),
    "-g",
    String(FPS * SEGMENT),
    "-keyint_min",
    String(FPS * SEGMENT),
    "-sc_threshold",
    "0",
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT})`,
    "-flags",
    "+cgop",
    "-f",
    "hls",
    "-hls_time",
    String(SEGMENT),
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_type",
    "fmp4",
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    `${dir}%v/segment_%03d.m4s`,
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    [
      ...ladder.map((r, i) => `v:${i},agroup:narration,name:${r.name}`),
      ...AUDIO.map(
        (a, i) =>
          `a:${i},agroup:narration,language:${a.lang},name:audio_${a.lang}${i === 0 ? ",default:yes" : ""}`,
      ),
    ].join(" "),
    `${dir}%v/playlist.m3u8`,
  );
  execFileSync("ffmpeg", args, { stdio: "inherit" });

  // ffmpeg's master lacks FRAME-RATE; add it.
  let master = readFileSync(`${dir}master.m3u8`, "utf8").replace(
    /(#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x\d+)(?![^\n]*FRAME-RATE)/g,
    `$1,FRAME-RATE=${FPS.toFixed(3)}`,
  );
  // Audio renditions: readable names for the player's Audio menu (ffmpeg
  // writes "audio_N"), and AUTOSELECT, which the spec requires with DEFAULT.
  master = master.replace(/^#EXT-X-MEDIA:TYPE=AUDIO[^\n]*$/gm, (line) => {
    const lang = line.match(/LANGUAGE="([a-z]+)"/)?.[1];
    const name = AUDIO.find((a) => a.lang === lang)?.name ?? lang;
    let out = line.replace(/NAME="[^"]*"/, `NAME="${name}"`);
    if (!/AUTOSELECT=/.test(out))
      out = out.replace(/(DEFAULT=(?:YES|NO))/, "$1,AUTOSELECT=YES");
    return out;
  });
  // Every segment starts on a keyframe (forced above): say so in the master
  // too, so players may switch renditions at any segment.
  if (!master.includes("#EXT-X-INDEPENDENT-SEGMENTS"))
    master = master.replace(
      "#EXT-X-VERSION:7\n",
      "#EXT-X-VERSION:7\n#EXT-X-INDEPENDENT-SEGMENTS\n",
    );
  writeFileSync(`${dir}master.m3u8`, master);

  mkdirSync(`${dir}subtitles`, { recursive: true });
  writeVtt(`${dir}subtitles/en.vtt`, t.cues, "en");
  writeVtt(`${dir}subtitles/hi.vtt`, t.cues, "hi");

  // Thumbnail: a moment into the second chapter, where the feature is on screen.
  const at = Math.min((t.chapters[1]?.startTime ?? 2) + 1.5, t.duration - 0.5);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    String(at),
    "-i",
    src,
    "-frames:v",
    "1",
    "-vf",
    "scale=1280:720:flags=lanczos",
    "-q:v",
    "3",
    `${dir}thumbnail.jpg`,
  ]);
  return ladder;
}


/** A built video's catalogue entry; `base` is its CDN path without revision. */
function entry(base, dir, t) {
  // A content revision in every path: segment names repeat between builds,
  // so this is what makes a year of immutable caching safe.
  const rev = createHash("sha256")
    .update(readFileSync(`${dir}source.mp4`))
    .digest("hex")
    .slice(0, 10);
  const path = `${base}/${rev}`;
  const master = readFileSync(`${dir}master.m3u8`, "utf8");
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    duration: Math.round(t.duration * 10) / 10,
    recorded: t.recordedAt.slice(0, 10),
    thumbnail: `${path}/thumbnail.jpg`,
    hls: `${path}/master.m3u8`,
    subtitles: { en: `${path}/subtitles/en.vtt`, hi: `${path}/subtitles/hi.vtt` },
    chapters: t.chapters,
    qualities: [...master.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((x) => Number(x[1])),
    audio: [...master.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*LANGUAGE="([a-z]+)"/g)].map((x) => x[1]),
  };
}

export const FILM_DIR = `${ROOT}film/praesto-tour/`;
function filmEntry() {
  if (!existsSync(`${FILM_DIR}master.m3u8`)) return undefined;
  const t = JSON.parse(readFileSync(`${FILM_DIR}timeline.json`, "utf8"));
  return entry("film/praesto-tour", FILM_DIR, t);
}

if (import.meta.url === `file://${process.argv[1]}`) {
const args = process.argv.slice(2);
const manifestOnly = args.includes("--manifest-only");
const only = args.filter((a) => !a.startsWith("--"));
const videos = [];
for (const m of MODULES) {
  const mdir = `${ROOT}${m.id}/`;
  if (!existsSync(mdir)) continue;
  for (const id of readdirSync(mdir)) {
    const dir = `${mdir}${id}/`;
    if (!existsSync(`${dir}timeline.json`) || !existsSync(`${dir}source.mp4`))
      continue;
    const t = JSON.parse(readFileSync(`${dir}timeline.json`, "utf8"));
    if (!manifestOnly && (!only.length || only.includes(id))) {
      const ladder = build(dir, t);
      console.log(`✓ ${m.id}/${id}: ${ladder.map((r) => r.name).join(", ")}`);
    }
    videos.push({ module: m.id, id, t, dir });
  }
}

// The catalogue the web page reads. Paths are relative to the CDN base
// (VITE_PRODUCT_DEMO_CDN_URL); renditions come from each master playlist.
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  modules: MODULES.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    icon: m.icon,
    videos: videos
      .filter((v) => v.module === m.id)
      .sort(
        (a, b) => (m.order ?? []).indexOf(a.id) - (m.order ?? []).indexOf(b.id),
      )
      .map(({ id, t, dir }) => entry(`${m.id}/${id}`, dir, { ...t, id })),
  })).filter((m) => m.videos.length),
  // The full tour (film.mjs): one long video, outside the module catalogue.
  film: filmEntry(),
};
writeFileSync(`${ROOT}manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
// The web app bundles the same catalogue (no request before the page shows).
writeFileSync(
  new URL(
    "../../apps/web/src/features/product-demo/manifest.ts",
    import.meta.url,
  ),
  `// Generated by product-demo-assets/tools/build-hls.mjs. Don't edit by hand:\n` +
    `// re-record or re-build, and this file is rewritten.\n` +
    `export default ${JSON.stringify({ modules: manifest.modules, film: manifest.film }, null, 2)};\n`,
);
console.log(
  `manifest.json: ${manifest.modules.length} modules, ${videos.length} videos`,
);
}
