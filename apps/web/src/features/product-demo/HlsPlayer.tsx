import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import type Hls from "hls.js";
import type { ErrorData, Level } from "hls.js";
import { Spinner } from "@next/ui";
import { cdn, clock, type DemoVideo } from "./catalogue";
import s from "./productDemo.module.css";

// The /product-demo video player: HLS adaptive streaming with custom
// controls in Praesto's style.
//
// - Nothing is fetched until the visitor presses play (the poster is the
//   video's thumbnail). After that, switching videos loads the new stream
//   straight away.
// - Safari (macOS and iOS) plays HLS natively. Everywhere else hls.js runs
//   it over Media Source Extensions; it's imported on first play, so it isn't
//   in the page's initial JavaScript.
// - Quality: "Auto" lets hls.js pick by bandwidth and player size; picking a
//   height pins that level. The list comes from the stream's master
//   playlist, never from a fixed table. Safari's native player chooses for
//   itself, so there the menu offers Auto only.
// - Subtitles are WebVTT sidecar files read through <track> elements in
//   "hidden" mode and drawn by the player, so they look the same in every
//   browser and in fullscreen, and Hindi renders in a Devanagari-capable
//   font.

export type PlayerHandle = {
  /** Seek to `t` seconds, starting the stream (and playback) if needed. */
  seek: (t: number) => void;
};

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
type Lang = "en" | "hi" | "off";
const LANGS: { id: Lang; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी (Hindi)" },
];

/** Spoken languages (HLS alternate audio renditions). */
type Voice = "en" | "hi";
const VOICES: { id: Voice; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "hi", label: "हिन्दी (Hindi)", short: "हिं" },
];
/** Hindi narration for visitors whose browser prefers Hindi. */
const defaultVoice = (): Voice =>
  typeof navigator !== "undefined" && /^hi\b/i.test(navigator.language)
    ? "hi"
    : "en";

/** Enable the native (Safari) audio track in `lang`, if there is one. */
function pickNativeAudio(el: HTMLVideoElement, lang: Voice) {
  const tracks = (el as any).audioTracks as
    | { length: number; [i: number]: { language: string; enabled: boolean } }
    | undefined;
  if (!tracks?.length) return;
  let found = false;
  for (let i = 0; i < tracks.length; i++)
    if (tracks[i].language === lang) found = true;
  if (!found) return;
  for (let i = 0; i < tracks.length; i++)
    tracks[i].enabled = tracks[i].language === lang;
}

type QualityLevel = { index: number; height: number; bitrate: number };
type Status = "idle" | "loading" | "ready" | "error";

/** Safari (desktop or iOS) plays HLS itself; other browsers use hls.js. */
function prefersNativeHls(video: HTMLVideoElement) {
  if (!video.canPlayType("application/vnd.apple.mpegurl")) return false;
  const ua = navigator.userAgent;
  return (
    /Safari/.test(ua) && !/Chrome|Chromium|Android|Edg|OPR|Firefox/.test(ua)
  );
}

const MAX_NETWORK_RETRIES = 3;

export function HlsPlayer({
  video,
  ref,
  onTime,
  onEnded,
  chaptersSlot,
}: {
  video: DemoVideo;
  ref?: Ref<PlayerHandle>;
  /** Called a few times a second while playing, and after a seek. */
  onTime?: (t: number) => void;
  onEnded?: () => void;
  /** Rendered under the controls in fullscreen (chapter list). */
  chaptersSlot?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const retries = useRef(0);
  // Once the visitor has pressed play, later videos load immediately.
  const engaged = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(video.duration);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [lang, setLang] = useState<Lang>("en");
  const [voice, setVoice] = useState<Voice>(defaultVoice);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const [cue, setCue] = useState<string | null>(null);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [native, setNative] = useState(false);
  /** -1 = Auto. */
  const [quality, setQuality] = useState(-1);
  const [playingLevel, setPlayingLevel] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [menu, setMenu] = useState<null | "speed" | "quality" | "cc" | "audio">(
    null,
  );
  const [idle, setIdle] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [started, setStarted] = useState(false);

  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  // ── Stream lifecycle ─────────────────────────────────────────────────────
  // One stream per (video, attempt). The effect owns the hls.js instance and
  // every listener it adds, and tears all of it down before the next one.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !started) return;
    let disposed = false;
    const src = cdn(video.hls);
    setStatus("loading");
    setError(null);
    setLevels([]);
    setPlayingLevel(null);
    setBuffered(0);

    const fail = (message: string) => {
      if (disposed) return;
      setStatus("error");
      setError(message);
      setBuffering(false);
    };

    const ac = new AbortController();
    const on = <K extends keyof HTMLMediaElementEventMap>(
      type: K,
      fn: (e: HTMLMediaElementEventMap[K]) => void,
    ) => el.addEventListener(type, fn, { signal: ac.signal });

    on("loadedmetadata", () => {
      el.playbackRate = speedRef.current;
      if (!hlsRef.current) pickNativeAudio(el, voiceRef.current);
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      if (pendingSeek.current !== null) {
        el.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      setStatus("ready");
      el.play().catch(() => {
        /* autoplay refused: the big play button stays */
      });
    });
    on("error", () => {
      // hls.js reports its own errors; this covers native playback.
      if (!hlsRef.current)
        fail(
          "This video couldn’t be played. Check your connection and try again.",
        );
    });

    if (prefersNativeHls(el)) {
      setNative(true);
      el.src = src;
      el.load();
    } else {
      setNative(false);
      import("hls.js")
        .then(({ default: HlsCtor }) => {
          if (disposed) return;
          if (!HlsCtor.isSupported()) {
            fail(
              "This browser can’t play these videos. Try a recent version of Chrome, Edge, Firefox or Safari.",
            );
            return;
          }
          const hls = new HlsCtor({
            // Pick a start level from the first measurements, then adapt.
            startLevel: -1,
            capLevelToPlayerSize: true,
            // Buffer ahead ~10–15 s, not the whole video. (hls.js grows
            // the goal for low bitrates, up to maxMaxBufferLength.)
            maxBufferLength: 10,
            maxMaxBufferLength: 15,
            backBufferLength: 30,
          });
          hlsRef.current = hls;
          hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
            const list = data.levels
              .map((l: Level, index: number) => ({
                index,
                height: l.height,
                bitrate: l.bitrate,
              }))
              .sort((a, b) => b.height - a.height);
            setLevels(list);
            // Keep a pinned quality across videos when the new one has it.
            const want = qualityRef.current;
            if (want !== -1) {
              const same = list.find((l) => l.height === want);
              hls.currentLevel = same ? same.index : -1;
              if (!same) setQuality(-1);
            }
          });
          // Narration language: keep the visitor's choice across videos.
          hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
            const i = data.audioTracks.findIndex(
              (t) => t.lang === voiceRef.current,
            );
            if (i >= 0 && hls.audioTrack !== i) hls.audioTrack = i;
          });
          hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_e, data) => {
            setPlayingLevel(hls.levels[data.level]?.height ?? null);
          });
          hls.on(HlsCtor.Events.FRAG_LOADED, () => {
            retries.current = 0;
          });
          hls.on(HlsCtor.Events.ERROR, (_e, data: ErrorData) => {
            if (!data.fatal) return;
            // hls.js has already retried by its own policy. A playlist that
            // still can't be loaded won't come back from startLoad(); a
            // segment might (a dropped connection), so resume a few times.
            const playlist = /^(manifest|level)/i.test(String(data.details));
            if (
              data.type === HlsCtor.ErrorTypes.NETWORK_ERROR &&
              !playlist &&
              retries.current < MAX_NETWORK_RETRIES
            ) {
              retries.current++;
              setBuffering(true);
              window.setTimeout(() => {
                if (!disposed) hls.startLoad();
              }, 1000 * retries.current);
            } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              fail(
                data.type === HlsCtor.ErrorTypes.NETWORK_ERROR
                  ? "The video couldn’t be loaded. Check your connection and try again."
                  : "This video couldn’t be played. Try again.",
              );
            }
          });
          hls.loadSource(src);
          hls.attachMedia(el);
        })
        .catch(() =>
          fail(
            "The video player couldn’t be loaded. Check your connection and try again.",
          ),
        );
    }

    return () => {
      disposed = true;
      ac.abort();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [video.hls, started, loadKey]);

  // A new video: back to the start, keeping speed, volume and subtitles.
  // If the visitor has been watching, the new one starts straight away.
  const lastVideo = useRef(video.id);
  if (lastVideo.current !== video.id) {
    lastVideo.current = video.id;
    setTime(0);
    setCue(null);
    setDuration(video.duration);
    retries.current = 0;
    if (!engaged.current) setStarted(false);
  }

  // Media state the controls mirror. Attached once; the element outlives
  // the streams loaded into it.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const ac = new AbortController();
    const opt = { signal: ac.signal };
    // Play state comes from the element itself on every media event, not
    // from play/pause alone: browsers that block or interrupt autoplay
    // (Brave, Safari) can leave a single event missing or out of order, and
    // then the big Play button would sit over a moving video.
    let lastT = el.currentTime;
    const syncPlaying = () => setPlaying(!el.paused && !el.ended);
    const sync = () => {
      syncPlaying();
      // Time moving forward means the stall is over.
      if (!el.paused && el.currentTime > lastT) setBuffering(false);
      lastT = el.currentTime;
      setTime(el.currentTime);
      onTimeRef.current?.(el.currentTime);
      const b = el.buffered;
      for (let i = b.length - 1; i >= 0; i--)
        if (b.start(i) <= el.currentTime + 0.5) {
          setBuffered(b.end(i));
          break;
        }
    };
    el.addEventListener("timeupdate", sync, opt);
    el.addEventListener("seeked", sync, opt);
    el.addEventListener("progress", sync, opt);
    for (const t of [
      "play",
      "playing",
      "pause",
      "ended",
      "emptied",
      "loadeddata",
    ] as const)
      el.addEventListener(t, syncPlaying, opt);
    el.addEventListener("waiting", () => setBuffering(true), opt);
    el.addEventListener("seeking", () => setBuffering(true), opt);
    for (const t of ["playing", "canplay", "seeked", "pause"] as const)
      el.addEventListener(t, () => setBuffering(false), opt);
    el.addEventListener("ended", () => onEndedRef.current?.(), opt);
    el.addEventListener(
      "volumechange",
      () => {
        setVolume(el.volume);
        setMuted(el.muted);
      },
      opt,
    );
    el.addEventListener(
      "durationchange",
      () => {
        if (Number.isFinite(el.duration)) setDuration(el.duration);
      },
      opt,
    );
    return () => ac.abort();
  }, []);

  // ── Subtitles ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const tracks = [...el.textTracks];
    const ac = new AbortController();
    for (const t of tracks) {
      // Nothing is fetched before the visitor presses play.
      const active = started && t.language === lang;
      t.mode = active ? "hidden" : "disabled";
      if (active) {
        const show = () => {
          const c = t.activeCues?.[0] as VTTCue | undefined;
          setCue(c ? c.text : null);
        };
        t.addEventListener("cuechange", show, { signal: ac.signal });
        show();
      }
    }
    if (lang === "off") setCue(null);
    return () => ac.abort();
  }, [lang, video.id, status, started]);

  // ── Fullscreen ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sync = () =>
      setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Controls fade while playing and the pointer is still.
  const idleTimer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    engaged.current = true;
    setStarted(true);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!started) return start();
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
  }, [started, start]);

  const seekTo = useCallback(
    (t: number) => {
      const el = videoRef.current;
      if (!el) return;
      const target = Math.max(
        0,
        Math.min(t, (duration || video.duration) - 0.1),
      );
      if (!started || status !== "ready") {
        pendingSeek.current = target;
        setTime(target);
        onTimeRef.current?.(target);
        if (!started) start();
        return;
      }
      el.currentTime = target;
      if (el.paused) void el.play().catch(() => {});
    },
    [duration, video.duration, started, status, start],
  );

  useImperativeHandle(ref, () => ({ seek: seekTo }), [seekTo]);

  const changeSpeed = (v: number) => {
    setSpeed(v);
    if (videoRef.current) videoRef.current.playbackRate = v;
    setMenu(null);
  };
  const changeQuality = (height: number) => {
    setQuality(height);
    const hls = hlsRef.current;
    if (hls) {
      // Auto hands the choice back to hls.js's bandwidth estimator; a fixed
      // level switches now (the buffer ahead is replaced at that quality).
      hls.currentLevel =
        height === -1
          ? -1
          : (levels.find((l) => l.height === height)?.index ?? -1);
    }
    setMenu(null);
  };
  const changeVoice = (v: Voice) => {
    setVoice(v);
    const hls = hlsRef.current;
    if (hls) {
      const i = hls.audioTracks.findIndex((t) => t.lang === v);
      if (i >= 0) hls.audioTrack = i;
    } else if (videoRef.current) {
      pickNativeAudio(videoRef.current, v);
    }
    setMenu(null);
  };
  const changeLang = (l: Lang) => {
    setLang(l);
    setMenu(null);
  };
  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.volume === 0) el.volume = 0.6;
  };
  const changeVolume = (v: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = v;
    el.muted = v === 0;
  };
  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    const el = videoRef.current as any;
    if (!wrap) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (wrap.requestFullscreen)
      void wrap.requestFullscreen().catch(() => {});
    // iPhone Safari has no element fullscreen; its video fullscreen shows
    // the native controls (and the selected subtitle track).
    else el?.webkitEnterFullscreen?.();
  };
  const retry = () => {
    retries.current = 0;
    pendingSeek.current = time > 0 ? time : null;
    setLoadKey((k) => k + 1);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input,[role=menu]")) return;
    const k = e.key.toLowerCase();
    const map: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      arrowleft: () => seekTo(time - 5),
      arrowright: () => seekTo(time + 5),
      j: () => seekTo(time - 10),
      l: () => seekTo(time + 10),
      m: toggleMute,
      f: toggleFullscreen,
      c: () => setLang((x) => (x === "off" ? "en" : "off")),
    };
    if (
      map[k] &&
      !(k === " " && (e.target as HTMLElement).tagName === "BUTTON")
    ) {
      e.preventDefault();
      map[k]();
      wake();
    }
  };

  // Close a menu on Escape or a click elsewhere.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(`.${s.menuWrap}`)) setMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  const total = duration || video.duration;
  const qualityLabel =
    quality === -1
      ? playingLevel
        ? `Auto · ${playingLevel}p`
        : "Auto"
      : `${quality}p`;
  const showSpinner =
    started && status !== "error" && (status === "loading" || buffering);
  const chromeHidden = playing && idle && !menu;

  return (
    <div
      ref={wrapRef}
      className={s.player}
      data-fullscreen={fullscreen || undefined}
      data-idle={chromeHidden || undefined}
      onPointerMove={wake}
      onKeyDown={onKey}
      tabIndex={-1}
      role="region"
      aria-label={`Video: ${video.title}`}
    >
      <div className={s.stage}>
        <video
          ref={videoRef}
          className={s.video}
          poster={cdn(video.thumbnail)}
          playsInline
          preload="none"
          crossOrigin="anonymous"
          onClick={() => {
            // Keyboard shortcuts work once the player has focus.
            wrapRef.current?.focus({ preventScroll: true });
            togglePlay();
          }}
          aria-label={video.title}
        >
          <track
            kind="subtitles"
            srcLang="en"
            label="English"
            src={cdn(video.subtitles.en)}
          />
          <track
            kind="subtitles"
            srcLang="hi"
            label="हिन्दी"
            src={cdn(video.subtitles.hi)}
          />
        </video>

        {lang !== "off" && cue && (
          <div className={s.cue} lang={lang} aria-live="off">
            <span>{cue}</span>
          </div>
        )}

        {!started && (
          <button
            type="button"
            className={s.bigPlay}
            onClick={start}
            aria-label={`Play ${video.title}`}
          >
            <PlayGlyph size={30} />
          </button>
        )}
        {started && status === "ready" && !playing && !buffering && (
          <button
            type="button"
            className={s.bigPlay}
            onClick={togglePlay}
            aria-label="Play"
          >
            <PlayGlyph size={30} />
          </button>
        )}
        {showSpinner && (
          <div className={s.spinner}>
            <Spinner
              label={status === "loading" ? "Loading video" : "Buffering"}
            />
          </div>
        )}
        {status === "error" && (
          <div className={s.errorPanel} role="alert">
            <p>{error}</p>
            <button type="button" className={s.retry} onClick={retry}>
              Try Again
            </button>
          </div>
        )}
      </div>

      <div className={s.controls}>
        <ProgressBar
          time={time}
          duration={total}
          buffered={buffered}
          chapters={video.chapters}
          onSeek={seekTo}
        />
        <div className={s.controlRow}>
          <button
            type="button"
            className={s.ctrl}
            onClick={togglePlay}
            aria-label={playing ? "Pause (k)" : "Play (k)"}
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <div className={s.volume}>
            <button
              type="button"
              className={s.ctrl}
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? "Unmute (m)" : "Mute (m)"}
            >
              <VolumeGlyph level={muted ? 0 : volume} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className={s.volumeSlider}
            />
          </div>
          <span className={s.time}>
            <span className="px-num">{clock(time)}</span>
            <span className={s.timeTotal}>
              <span aria-hidden> / </span>
              <span className="px-num">{clock(total)}</span>
            </span>
          </span>
          <span className={s.spacer} />

          <MenuButton
            id="audio"
            open={menu === "audio"}
            onToggle={() => setMenu(menu === "audio" ? null : "audio")}
            label={`Narration: ${VOICES.find((v) => v.id === voice)!.label}`}
            title="Narration language"
            button={
              <span className={s.ctrlVoice}>
                <VoiceGlyph />
                <span className={s.ctrlText}>
                  {VOICES.find((v) => v.id === voice)!.short}
                </span>
              </span>
            }
            heading="Narration"
            items={VOICES.map((v) => ({
              key: v.id,
              label: v.label,
              checked: voice === v.id,
              onSelect: () => changeVoice(v.id),
            }))}
          />
          <MenuButton
            id="cc"
            open={menu === "cc"}
            onToggle={() => setMenu(menu === "cc" ? null : "cc")}
            label={`Subtitles: ${LANGS.find((l) => l.id === lang)!.label}`}
            title="Subtitles (c)"
            button={<CcGlyph on={lang !== "off"} />}
            heading="Subtitles"
            items={LANGS.map((l) => ({
              key: l.id,
              label: l.label,
              checked: lang === l.id,
              onSelect: () => changeLang(l.id),
            }))}
          />
          <MenuButton
            id="speed"
            open={menu === "speed"}
            onToggle={() => setMenu(menu === "speed" ? null : "speed")}
            label={`Playback speed: ${speed}×`}
            title="Playback speed"
            button={<span className={s.ctrlText}>{speed}×</span>}
            heading="Playback Speed"
            items={SPEEDS.map((v) => ({
              key: String(v),
              label: v === 1 ? "Normal" : `${v}×`,
              checked: speed === v,
              onSelect: () => changeSpeed(v),
            }))}
          />
          <MenuButton
            id="quality"
            open={menu === "quality"}
            onToggle={() => setMenu(menu === "quality" ? null : "quality")}
            label={`Quality: ${qualityLabel}`}
            title="Quality"
            button={
              <span className={s.ctrlText}>
                {native ? "Auto" : qualityLabel.replace("Auto · ", "")}
                {quality === -1 && !native ? <sup>A</sup> : null}
              </span>
            }
            heading="Quality"
            note={
              native
                ? "Safari chooses the quality for your connection."
                : !started
                  ? "Available once the video starts."
                  : undefined
            }
            items={[
              {
                key: "auto",
                label:
                  playingLevel && quality === -1
                    ? `Auto (${playingLevel}p)`
                    : "Auto",
                checked: quality === -1,
                onSelect: () => changeQuality(-1),
              },
              ...(native
                ? []
                : levels.map((l) => ({
                    key: String(l.height),
                    label: `${l.height}p`,
                    hint: l.height >= 720 ? "HD" : undefined,
                    checked: quality === l.height,
                    onSelect: () => changeQuality(l.height),
                  }))),
            ]}
          />
          <button
            type="button"
            className={s.ctrl}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"}
          >
            <FullscreenGlyph exit={fullscreen} />
          </button>
        </div>
      </div>
      {fullscreen && chaptersSlot}
    </div>
  );
}

// ── Progress bar with chapter markers ──────────────────────────────────────

function ProgressBar({
  time,
  duration,
  buffered,
  chapters,
  onSeek,
}: {
  time: number;
  duration: number;
  buffered: number;
  chapters: DemoVideo["chapters"];
  onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(at(e.clientX));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = at(e.clientX);
    setHover(t);
    if (drag !== null) setDrag(t);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    onSeek(at(e.clientX));
    setDrag(null);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -5,
      ArrowRight: 5,
      PageDown: -10,
      PageUp: 10,
    };
    if (e.key in step) {
      e.preventDefault();
      e.stopPropagation();
      onSeek(time + step[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onSeek(duration - 0.5);
    }
  };
  const shown = drag ?? time;
  const pct = (t: number) => `${duration ? (t / duration) * 100 : 0}%`;
  const hoverChapter =
    hover === null
      ? null
      : [...chapters].reverse().find((c) => c.startTime <= hover)?.title;
  return (
    <div
      ref={ref}
      className={s.progress}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKey}
    >
      <div className={s.track}>
        <div className={s.buffered} style={{ width: pct(buffered) }} />
        <div className={s.played} style={{ width: pct(shown) }} />
        {chapters.slice(1).map((c) => (
          <span
            key={c.startTime}
            className={s.marker}
            style={{ left: pct(c.startTime) }}
          />
        ))}
      </div>
      <div className={s.thumb} style={{ left: pct(shown) }} />
      {hover !== null && (
        <div className={s.hoverTip} style={{ left: pct(hover) }} aria-hidden>
          {hoverChapter && <span>{hoverChapter}</span>}
          <span className="px-num">{clock(hover)}</span>
        </div>
      )}
    </div>
  );
}

// ── Menus ──────────────────────────────────────────────────────────────────

type Item = {
  key: string;
  label: string;
  hint?: string;
  checked: boolean;
  onSelect: () => void;
};

function MenuButton({
  id,
  open,
  onToggle,
  label,
  title,
  button,
  heading,
  note,
  items,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  label: string;
  title: string;
  button: ReactNode;
  heading: string;
  note?: string;
  items: Item[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el =
      listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      listRef.current?.querySelector<HTMLElement>("[role=menuitemradio]");
    el?.focus();
  }, [open]);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const all = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(
        "[role=menuitemradio]",
      ) ?? []),
    ];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = all.length;
      all[(i + (e.key === "ArrowDown" ? 1 : n - 1)) % n]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      onToggle();
      document.getElementById(`pd-${id}-btn`)?.focus();
    }
  };
  return (
    <div className={s.menuWrap}>
      <button
        id={`pd-${id}-btn`}
        type="button"
        className={s.ctrl}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `pd-${id}-menu` : undefined}
        aria-label={label}
        title={title}
        onClick={onToggle}
      >
        {button}
      </button>
      {open && (
        <div
          id={`pd-${id}-menu`}
          ref={listRef}
          role="menu"
          aria-label={heading}
          className={s.menu}
          onKeyDown={onKey}
        >
          <p className={s.menuHead}>{heading}</p>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitemradio"
              aria-checked={it.checked}
              className={s.menuItem}
              onClick={() => {
                it.onSelect();
                // Back to the trigger, so keyboard users (and the player's
                // shortcuts) carry on from where they were.
                requestAnimationFrame(() =>
                  document.getElementById(`pd-${id}-btn`)?.focus(),
                );
              }}
            >
              <span className={s.menuCheck} aria-hidden>
                {it.checked ? "✓" : ""}
              </span>
              <span>{it.label}</span>
              {it.hint && <span className={s.menuHint}>{it.hint}</span>}
            </button>
          ))}
          {note && <p className={s.menuNote}>{note}</p>}
        </div>
      )}
    </div>
  );
}

// ── Glyphs (the app's Icon set has no media controls) ──────────────────────

const svg = (size: number, children: ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    focusable="false"
  >
    {children}
  </svg>
);
export function PlayGlyph({ size = 20 }: { size?: number }) {
  return svg(
    size,
    <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.9-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z" />,
  );
}
function PauseGlyph() {
  return svg(
    20,
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </>,
  );
}
function VolumeGlyph({ level }: { level: number }) {
  return svg(
    20,
    <>
      <path d="M4 9.2v5.6c0 .4.3.7.7.7H8l4.3 3.6c.5.4 1.2 0 1.2-.6V5.5c0-.6-.7-1-1.2-.6L8 8.5H4.7c-.4 0-.7.3-.7.7Z" />
      {level === 0 ? (
        <path
          d="m16.5 9.5 5 5m0-5-5 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <>
          <path
            d="M16.3 9a4 4 0 0 1 0 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          {level > 0.5 && (
            <path
              d="M18.8 6.5a7.5 7.5 0 0 1 0 11"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </>
      )}
    </>,
  );
}
function VoiceGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
    </svg>
  );
}
function CcGlyph({ on }: { on: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="3"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M10.4 10.3a2.3 2.3 0 1 0 0 3.4M17.2 10.3a2.3 2.3 0 1 0 0 3.4"
        fill="none"
        stroke={on ? "var(--pd-stage, #0a1219)" : "currentColor"}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function FullscreenGlyph({ exit }: { exit: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {exit ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
}
