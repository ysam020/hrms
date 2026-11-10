// Validates every built HLS stream before upload. Exits non-zero on any
// failure, so a broken stream can't be uploaded by accident.
//
//   node product-demo-assets/tools/validate-hls.mjs
//
// Checks, per video: master syntax and its renditions; each variant playlist
// (VOD, ENDLIST, init segment, every segment file present); total duration
// matches the source; segment durations identical across renditions;
// keyframe timestamps identical across renditions and one at every segment
// start; decoded resolution matches the playlist; both VTT files parse, are
// ordered, in range, and have the same cue timings; the thumbnail exists.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${ROOT}manifest.json`, "utf8"));
const report = [];
/** Manifest paths are <module>/<id>/<rev>/…; locally there's no <rev> level. */
const local = (p) =>
  path.join(ROOT, p.replace(/^([^/]+\/[^/]+)\/[0-9a-f]{10}\//, "$1/"));
let failures = 0;

const probe = (args) =>
  execFileSync("ffprobe", ["-v", "error", ...args], {
    encoding: "utf8",
  }).trim();

function parseVariant(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const segs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#EXTINF:([\d.]+),/);
    if (m) segs.push({ dur: Number(m[1]), uri: lines[i + 1].trim() });
  }
  return {
    text,
    segs,
    init: text.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1],
    target: Number(text.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1]),
  };
}

function parseVtt(file) {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith("WEBVTT"))
    throw new Error(`${file}: missing WEBVTT header`);
  const cues = [
    ...text.matchAll(
      /(\d\d):(\d\d):(\d\d)\.(\d{3}) --> (\d\d):(\d\d):(\d\d)\.(\d{3})[^\n]*\n([^\n]+)/g,
    ),
  ].map((m) => ({
    start: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000,
    end: +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000,
    text: m[9],
  }));
  return cues;
}

// The demos, then the complete tour (film.mjs).
const groups = [
  ...manifest.modules,
  ...(manifest.film ? [{ id: "film", videos: [manifest.film] }] : []),
];
for (const mod of groups) {
  for (const v of mod.videos) {
    const dir = path.dirname(local(v.hls));
    const errs = [];
    const fail = (m) => errs.push(m);
    const row = {
      video: `${mod.id}/${v.id}`,
      renditions: [],
      duration: null,
      segments: null,
      sizeMB: 0,
    };
    try {
      const master = readFileSync(path.join(dir, "master.m3u8"), "utf8");
      if (!master.startsWith("#EXTM3U")) fail("master: no #EXTM3U");
      if (!master.includes("#EXT-X-INDEPENDENT-SEGMENTS"))
        fail("master: no INDEPENDENT-SEGMENTS");
      const variants = [
        ...master.matchAll(/#EXT-X-STREAM-INF:([^\n]+)\n([^\n]+)/g),
      ].map((m) => ({
        attrs: m[1],
        uri: m[2].trim(),
        height: Number(m[1].match(/RESOLUTION=\d+x(\d+)/)?.[1]),
        width: Number(m[1].match(/RESOLUTION=(\d+)x/)?.[1]),
        bw: Number(m[1].match(/BANDWIDTH=(\d+)/)?.[1]),
        codecs: m[1].match(/CODECS="([^"]+)"/)?.[1],
      }));
      if (!variants.length) fail("master: no variants");
      const srcDur = Number(
        probe([
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          path.join(dir, "source.mp4"),
        ]),
      );
      let refDurs = null;
      let refKeys = null;
      for (const vr of variants) {
        if (!vr.bw || !vr.codecs) fail(`${vr.uri}: BANDWIDTH/CODECS missing`);
        const file = path.join(dir, vr.uri);
        const pl = parseVariant(file);
        if (!pl.text.includes("#EXT-X-PLAYLIST-TYPE:VOD"))
          fail(`${vr.uri}: not VOD`);
        if (!pl.text.includes("#EXT-X-ENDLIST")) fail(`${vr.uri}: no ENDLIST`);
        if (!pl.init || !existsSync(path.join(path.dirname(file), pl.init)))
          fail(`${vr.uri}: init segment missing`);
        for (const s of pl.segs) {
          const f = path.join(path.dirname(file), s.uri);
          if (!existsSync(f)) fail(`${vr.uri}: missing ${s.uri}`);
          else row.sizeMB += statSync(f).size / 1e6;
          if (s.dur > pl.target + 0.001)
            fail(`${vr.uri}: ${s.uri} longer than TARGETDURATION`);
        }
        const total = pl.segs.reduce((a, s) => a + s.dur, 0);
        if (Math.abs(total - srcDur) > 0.2)
          fail(
            `${vr.uri}: duration ${total.toFixed(2)} ≠ source ${srcDur.toFixed(2)}`,
          );
        const durs = pl.segs.map((s) => s.dur.toFixed(3)).join(",");
        if (refDurs === null) refDurs = durs;
        else if (durs !== refDurs)
          fail(`${vr.uri}: segment boundaries differ from first rendition`);
        // Decoded size and keyframe times, straight from the stream.
        const [w, h] = probe([
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height",
          "-of",
          "csv=p=0",
          file,
        ])
          .split("\n")[0]
          .split(",")
          .map(Number);
        if (w !== vr.width || h !== vr.height)
          fail(
            `${vr.uri}: decodes ${w}x${h}, master says ${vr.width}x${vr.height}`,
          );
        // Keyframe times relative to the first frame (fMP4 keeps the encoder's
        // B-frame delay as a constant presentation offset).
        const raw = probe([
          "-select_streams",
          "v:0",
          "-skip_frame",
          "nokey",
          "-show_entries",
          "frame=pts_time",
          "-of",
          "csv=p=0",
          file,
        ])
          .split("\n")
          .map((x) => parseFloat(x.replace(/,+$/, "")))
          .filter(Number.isFinite);
        const keys = raw.map((x) => (x - raw[0]).toFixed(2)).join(",");
        if (refKeys === null) refKeys = keys;
        else if (keys !== refKeys)
          fail(`${vr.uri}: keyframes not aligned with first rendition`);
        let t = 0;
        const keySet = new Set(keys.split(","));
        for (const s of pl.segs) {
          if (!keySet.has(t.toFixed(2)))
            fail(
              `${vr.uri}: segment at ${t.toFixed(2)} s doesn't start on a keyframe`,
            );
          t += s.dur;
        }
        row.renditions.push(`${vr.height}p`);
        row.segments = pl.segs.length;
        row.duration = Math.round(total * 10) / 10;
      }
      // Narration: an audio rendition per language, referenced by every
      // variant, complete, as long as the video, at speech loudness, and
      // speaking at each cue.
      const audios = [...master.matchAll(/#EXT-X-MEDIA:([^\n]+)/g)]
        .map((m) => m[1])
        .filter((x) => x.includes("TYPE=AUDIO"));
      const langs = audios.map((x) => x.match(/LANGUAGE="([a-z]+)"/)?.[1]);
      if (langs.join(",") !== "en,hi")
        fail(`audio renditions: ${langs.join(",") || "none"} (want en,hi)`);
      const group = audios[0]?.match(/GROUP-ID="([^"]+)"/)?.[1];
      for (const vr of variants) {
        if (!vr.attrs.includes(`AUDIO="${group}"`))
          fail(`${vr.uri}: not linked to audio group ${group}`);
        if (!/mp4a\.40\.2/.test(vr.codecs ?? ""))
          fail(`${vr.uri}: CODECS lacks mp4a.40.2`);
      }
      if (
        !audios.some((x) => /DEFAULT=YES/.test(x) && /AUTOSELECT=YES/.test(x))
      )
        fail("no DEFAULT+AUTOSELECT audio rendition");
      const tl = JSON.parse(
        readFileSync(path.join(dir, "timeline.json"), "utf8"),
      );
      for (const x of audios) {
        const lang = x.match(/LANGUAGE="([a-z]+)"/)[1];
        const uri = x.match(/URI="([^"]+)"/)[1];
        const file = path.join(dir, uri);
        const pl = parseVariant(file);
        if (!pl.text.includes("#EXT-X-ENDLIST")) fail(`${uri}: no ENDLIST`);
        if (!pl.init || !existsSync(path.join(path.dirname(file), pl.init)))
          fail(`${uri}: init segment missing`);
        for (const sg of pl.segs) {
          const f = path.join(path.dirname(file), sg.uri);
          if (!existsSync(f)) fail(`${uri}: missing ${sg.uri}`);
          else row.sizeMB += statSync(f).size / 1e6;
        }
        const total = pl.segs.reduce((a, sg) => a + sg.dur, 0);
        if (Math.abs(total - srcDur) > 0.25)
          fail(
            `${uri}: duration ${total.toFixed(2)} ≠ video ${srcDur.toFixed(2)}`,
          );
        const fmt = probe([
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=codec_name,sample_rate,channels",
          "-of",
          "csv=p=0",
          file,
        ]).split("\n")[0];
        if (fmt.replace(/,+$/, "") !== "aac,48000,1")
          fail(`${uri}: audio is ${fmt}, want aac,48000,1`);
        // Loudness and speech onsets, measured on the mixed track.
        const mixed = path.join(dir, `audio-${lang}.m4a`);
        const lufs = Number(
          (execFileSync(
            "sh",
            [
              "-c",
              `ffmpeg -hide_banner -nostats -i "${mixed}" -af ebur128 -f null - 2>&1 | grep -E '^ +I:' | tail -1`,
            ],
            { encoding: "utf8" },
          ).match(/(-?[\d.]+) LUFS/) ?? [])[1],
        );
        if (!(Math.abs(lufs + 16) <= 1.5))
          fail(`${lang} loudness ${lufs} LUFS (want -16 ±1.5)`);
        const sil = execFileSync(
          "sh",
          [
            "-c",
            `ffmpeg -hide_banner -nostats -i "${mixed}" -af silencedetect=n=-40dB:d=0.3 -f null - 2>&1`,
          ],
          { encoding: "utf8" },
        );
        const onsets = [
          0,
          ...[...sil.matchAll(/silence_end: ([\d.]+)/g)].map((m) =>
            Number(m[1]),
          ),
        ];
        // The full tour's sound effects can run into a line's first words,
        // so there's no silence before it to find: a cue just after an
        // effect counts as placed.
        const effects = (tl.sfx ?? []).map((e) => e.start);
        for (const c of tl.cues) {
          const near = Math.min(...onsets.map((o) => Math.abs(o - c.start)));
          const afterEffect = effects.some(
            (e) => e <= c.start && c.start - e < 2.5,
          );
          if (near > 0.5 && !afterEffect)
            fail(
              `${lang}: no speech starts near the cue at ${c.start.toFixed(2)} s`,
            );
        }
        row[`${lang}LUFS`] = lufs;
      }
      row.audio = langs.join("+");
      const en = parseVtt(local(v.subtitles.en));
      const hi = parseVtt(local(v.subtitles.hi));
      if (!en.length || en.length !== hi.length)
        fail(`subtitles: ${en.length} en vs ${hi.length} hi cues`);
      en.forEach((c, i) => {
        if (c.end <= c.start) fail(`en cue ${i + 1}: ends before it starts`);
        if (i && c.start < en[i - 1].end)
          fail(`en cue ${i + 1}: overlaps previous`);
        if (c.end > srcDur + 0.01) fail(`en cue ${i + 1}: past the end`);
        if (hi[i] && (hi[i].start !== c.start || hi[i].end !== c.end))
          fail(`hi cue ${i + 1}: timing differs from en`);
        if (hi[i] && !/[ऀ-ॿ]/.test(hi[i].text))
          fail(`hi cue ${i + 1}: no Devanagari`);
      });
      if (!existsSync(local(v.thumbnail))) fail("thumbnail missing");
      for (const c of v.chapters)
        if (c.startTime < 0 || c.startTime >= srcDur)
          fail(`chapter "${c.title}" out of range`);
      row.cues = en.length;
      row.chapters = v.chapters.length;
    } catch (e) {
      fail(e.message.split("\n")[0]);
    }
    row.sizeMB = Math.round(row.sizeMB * 10) / 10;
    row.ok = errs.length === 0;
    row.errors = errs;
    report.push(row);
    if (errs.length) failures++;
    console.log(
      `${row.ok ? "✓" : "✗"} ${row.video}: ${row.renditions.join("/")} · audio ${row.audio} (${row.enLUFS}/${row.hiLUFS} LUFS) · ${row.duration}s · ${row.segments} seg · ${row.cues} cues · ${row.chapters} chapters · ${row.sizeMB} MB${errs.length ? "\n   " + errs.join("\n   ") : ""}`,
    );
  }
}
writeFileSync(`${ROOT}validation.json`, JSON.stringify(report, null, 2) + "\n");
console.log(
  failures
    ? `\n${failures} video(s) failed validation`
    : `\nAll ${report.length} videos valid`,
);
process.exit(failures ? 1 : 0);
