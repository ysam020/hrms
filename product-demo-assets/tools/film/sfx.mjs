// The film's sound effects, synthesised with FFmpeg (no samples, so nothing
// to license). Mono, 48 kHz WAV, cached in `dir`. Each is quiet and short,
// and sits under the narration: build-hls.mjs mixes them in at `gain`.
//
//   rise    a soft swell, as the opening mark draws
//   chime   two notes a fifth apart (E5, B5) with a little room: a new part
//   whoosh  filtered air rising and falling: a new part, the pitch, the outro
//   swipe   a short, lighter whoosh: the move to the next topic
//   tick    a single soft pluck (A5): the next topic's screen
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";

const SOUNDS = {
  rise: {
    gain: 0.35,
    src: "anoisesrc=d=1.6:c=pink:a=0.6:r=48000",
    filter:
      "highpass=f=250,lowpass=f=2600,volume='pow(t/1.6,2.2)*exp(-pow(max(t-1.35,0)*9,2))':eval=frame,aecho=0.8:0.6:70|140:0.25|0.15",
  },
  chime: {
    gain: 0.4,
    src:
      "aevalsrc='(0.5*sin(2*PI*659.25*t)+0.16*sin(2*PI*1318.5*t)+0.06*sin(2*PI*1977.8*t))*exp(-3.2*t)*min(t/0.006,1)" +
      "+if(gte(t,0.11),(0.42*sin(2*PI*987.77*(t-0.11))+0.12*sin(2*PI*1975.5*(t-0.11)))*exp(-3.0*(t-0.11))*min((t-0.11)/0.006,1),0)':d=1.9:s=48000",
    filter: "aecho=0.8:0.5:90|180:0.22|0.12,lowpass=f=7000",
  },
  whoosh: {
    gain: 0.35,
    src: "anoisesrc=d=1.1:c=pink:a=0.7:r=48000",
    filter:
      "bandpass=f=1400:width_type=o:w=2.2,volume='if(lt(t,0.42),pow(t/0.42,2.5),exp(-(t-0.42)*7))':eval=frame,aecho=0.7:0.5:50:0.2",
  },
  swipe: {
    gain: 0.28,
    src: "anoisesrc=d=0.6:c=pink:a=0.7:r=48000",
    filter:
      "bandpass=f=2200:width_type=o:w=1.8,volume='if(lt(t,0.2),pow(t/0.2,2),exp(-(t-0.2)*12))':eval=frame",
  },
  tick: {
    gain: 0.35,
    src:
      "aevalsrc='(0.5*sin(2*PI*880*t)+0.14*sin(2*PI*1760*t)+0.05*sin(2*PI*2640*t))*exp(-9*t)*min(t/0.004,1)':d=0.7:s=48000",
    filter: "aecho=0.8:0.4:60:0.18,lowpass=f=6500",
  },
};

/** Build any missing sounds; returns { name: { file, gain } }. */
export async function soundEffects(dir) {
  mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, s] of Object.entries(SOUNDS)) {
    const file = `${dir}${name}.wav`;
    if (!existsSync(file)) {
      // Render, then bring every sound to the same peak (-3 dBFS), so the
      // gains above compare like with like.
      const raw = `${file}.raw.wav`;
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", s.src,
        "-af", `${s.filter},aformat=channel_layouts=mono,aresample=48000`,
        "-c:a", "pcm_s16le", raw,
      ]);
      // volumedetect reports on stderr.
      const report = spawnSync(
        "ffmpeg",
        ["-i", raw, "-af", "volumedetect", "-f", "null", "-"],
        { encoding: "utf8" },
      ).stderr;
      const peak = Number(report.match(/max_volume: (-?[\d.]+) dB/)[1]);
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-i", raw,
        "-af", `volume=${(-3 - peak).toFixed(2)}dB`,
        "-c:a", "pcm_s16le", file,
      ]);
      rmSync(raw);
    }
    out[name] = { file, gain: s.gain };
  }
  return out;
}
