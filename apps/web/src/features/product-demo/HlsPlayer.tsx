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
import { createRoot, type Root } from "react-dom/client";
import { cdn, clock, type DemoVideo } from "./catalogue";
import { documentPip, PipControls, prepareWindow } from "./PipWindow";
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

/** Seconds before the next demo starts on its own. */
export const AUTOPLAY_SECONDS = 5;
const AUTOPLAY_KEY = "pd-autoplay";

/** A neighbouring demo, for Up Next and the previous/next buttons. */
export type Neighbour = {
  id: string;
  title: string;
  module: string;
  thumbnail: string;
  duration: number;
};

/** Autoplay is on unless this viewer turned it off (remembered per browser). */
function readAutoplay() {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== "off";
  } catch {
    return true;
  }
}

export function HlsPlayer({
  video,
  ref,
  onTime,
  onEnded,
  chaptersSlot,
  next,
  prev,
  onNext,
  onPrev,
}: {
  video: DemoVideo;
  ref?: Ref<PlayerHandle>;
  /** Called a few times a second while playing, and after a seek. */
  onTime?: (t: number) => void;
  onEnded?: () => void;
  /** Rendered under the controls in fullscreen (chapter list). */
  chaptersSlot?: ReactNode;
  /** The demos either side of this one, in catalogue order. */
  next?: Neighbour | null;
  prev?: Neighbour | null;
  onNext?: () => void;
  onPrev?: () => void;
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
  // End of video: the Up Next panel, and the autoplay countdown in it.
  const [ended, setEnded] = useState(false);
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Cancel stops this countdown only; the Autoplay switch stays as set. */
  const [cancelled, setCancelled] = useState(false);

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
    setEnded(false);
    setCountdown(null);
    setCancelled(false);
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
    el.addEventListener(
      "ended",
      () => {
        setEnded(true);
        onEndedRef.current?.();
      },
      opt,
    );
    // Playing again (Replay, a seek back, a chapter) leaves the panel.
    for (const t of ["play", "seeking"] as const)
      el.addEventListener(
        t,
        () => {
          if (!el.ended) {
            setEnded(false);
            setCountdown(null);
          }
        },
        opt,
      );
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

  // Autoplay: when a video ends and there's a next one, count down and
  // start it. Cancel stops the count; the panel stays with Play Now.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const nextId = next?.id;
  useEffect(() => {
    if (!ended || !autoplay || !nextId || cancelled) return;
    const startAt = Date.now();
    setCountdown(AUTOPLAY_SECONDS);
    const id = window.setInterval(() => {
      const left = AUTOPLAY_SECONDS - (Date.now() - startAt) / 1000;
      if (left <= 0) {
        window.clearInterval(id);
        setCountdown(null);
        onNextRef.current?.();
      } else setCountdown(left);
    }, 100);
    return () => window.clearInterval(id);
  }, [ended, autoplay, nextId, cancelled]);

  const toggleAutoplay = () => {
    setAutoplay((on) => {
      try {
        localStorage.setItem(AUTOPLAY_KEY, on ? "off" : "on");
      } catch {
        /* blocked storage: the choice lasts for this page */
      }
      return !on;
    });
  };
  const cancelAutoplay = () => {
    setCancelled(true);
    setCountdown(null);
  };
  const replay = () => {
    setEnded(false);
    seekTo(0);
  };

  // Picture in picture. Where the browser has Document Picture-in-Picture
  // (Chrome, Edge, Brave), the video moves into a window with Praesto's own
  // controls, and shortcuts keep working there (I brings it back). Elsewhere
  // it's the browser's floating video (Safari's presentation mode where the
  // standard API is missing).
  const [pip, setPip] = useState(false);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const pipRoot = useRef<Root | null>(null);
  const pipSupported =
    typeof document !== "undefined" &&
    (Boolean(documentPip()) ||
      Boolean((document as any).pictureInPictureEnabled) ||
      typeof (videoRef.current as any)?.webkitSetPresentationMode ===
        "function");
  const togglePip = async () => {
    const el = videoRef.current as any;
    if (!el) return;
    if (pipWin) return pipWin.close();
    if (!started) start();
    try {
      if (document.pictureInPictureElement)
        return await document.exitPictureInPicture();
      const api = documentPip();
      if (api && wrapRef.current) {
        const w = await api.requestWindow({ width: 512, height: 288 });
        prepareWindow(w, wrapRef.current, video.title);
        setPipWin(w);
      } else if (
        el.requestPictureInPicture &&
        (document as any).pictureInPictureEnabled
      ) {
        if (el.readyState < 1)
          await new Promise((ok) =>
            el.addEventListener("loadedmetadata", ok, { once: true }),
          );
        await el.requestPictureInPicture();
      } else if (typeof el.webkitSetPresentationMode === "function")
        el.webkitSetPresentationMode(
          el.webkitPresentationMode === "picture-in-picture"
            ? "inline"
            : "picture-in-picture",
        );
    } catch {
      /* refused (no user gesture, or not supported) */
    }
  };
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const ac = new AbortController();
    el.addEventListener("enterpictureinpicture", () => setPip(true), {
      signal: ac.signal,
    });
    el.addEventListener("leavepictureinpicture", () => setPip(false), {
      signal: ac.signal,
    });
    return () => ac.abort();
  }, []);
  // Move the video into the window, and back when it closes (its own close
  // button, the I key, or leaving the page).
  useEffect(() => {
    const w = pipWin;
    const el = videoRef.current;
    const stage = el?.parentElement;
    if (!w || !el || !stage) return;
    const resume = () => {
      if (wasPlaying) void el.play().catch(() => {});
    };
    let wasPlaying = !el.paused;
    const frame = w.document.createElement("div");
    frame.className = s.pipFrame;
    frame.append(el);
    const ui = w.document.createElement("div");
    w.document.body.append(frame, ui);
    resume();
    const root = createRoot(ui);
    pipRoot.current = root;
    setPip(true);
    const onKey = (e: KeyboardEvent) => keysRef.current(e);
    const onHide = () => setPipWin(null);
    w.document.addEventListener("keydown", onKey);
    w.addEventListener("pagehide", onHide);
    return () => {
      w.document.removeEventListener("keydown", onKey);
      w.removeEventListener("pagehide", onHide);
      pipRoot.current = null;
      // Unmounting inside React's commit is not allowed; do it right after.
      queueMicrotask(() => root.unmount());
      wasPlaying = !el.paused;
      stage.prepend(el);
      resume();
      setPip(false);
      if (!w.closed) w.close();
    };
  }, [pipWin]);
  // Close the window if the player goes away.
  const pipWinRef = useRef(pipWin);
  pipWinRef.current = pipWin;
  useEffect(() => () => pipWinRef.current?.close(), []);
  // The window's controls follow the player's state.
  useEffect(() => {
    if (pipWin) pipWin.document.title = video.title;
    pipRoot.current?.render(
      <PipControls
        title={video.title}
        playing={playing}
        ended={ended}
        buffering={buffering}
        time={time}
        total={duration || video.duration}
        cue={cue}
        lang={lang}
        muted={muted}
        subtitlesOn={lang !== "off"}
        prevTitle={prev?.title}
        nextTitle={next?.title}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onPrev={() => onPrev?.()}
        onNext={() => onNext?.()}
        onToggleMute={toggleMute}
        onToggleSubtitles={() => setLang((x) => (x === "off" ? "en" : "off"))}
        onBack={() => pipWin?.close()}
      />,
    );
  });
  // In the browser's own window, offer previous and next there too.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({
        title: video.title,
        artist: "Praesto product demo",
        artwork: [{ src: cdn(video.thumbnail), sizes: "640x360" }],
      });
      ms.setActionHandler(
        "nexttrack",
        next ? () => onNextRef.current?.() : null,
      );
      ms.setActionHandler(
        "previoustrack",
        prev ? () => onPrevRef.current?.() : null,
      );
    } catch {
      /* an action this browser doesn't know */
    }
  }, [video.title, video.thumbnail, next, prev]);
  const onPrevRef = useRef(onPrev);
  onPrevRef.current = onPrev;

  // Keyboard shortcuts work anywhere on the page, as on YouTube, except
  // while typing in a field. Space still activates a focused button outside
  // the player, and arrows still move within radios, tabs and sliders.
  const keys = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (!t.closest) return;
    if (
      t.closest(
        "input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]:not([aria-label^='Up next']):not([aria-label='End of demo'])",
      )
    )
      return;
    if (e.shiftKey && (e.key === "N" || e.key === "P")) {
      e.preventDefault();
      if (e.key === "N" && next) onNext?.();
      if (e.key === "P" && prev) onPrev?.();
      return;
    }
    const inPlayer = Boolean(wrapRef.current?.contains(t));
    const onControl = t.closest(
      "button,a,[role=tab],[role=radio],[role=switch],[role=slider],[role=option]",
    );
    const k = e.key.toLowerCase();
    if ((k === " " || k === "enter") && onControl) return;
    if (k.startsWith("arrow") && onControl && !inPlayer) return;
    const map: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      arrowleft: () => seekTo(time - 5),
      arrowright: () => seekTo(time + 5),
      j: () => seekTo(time - 10),
      l: () => seekTo(time + 10),
      m: toggleMute,
      f: () => !pipWin && toggleFullscreen(),
      i: () => void togglePip(),
      c: () => setLang((x) => (x === "off" ? "en" : "off")),
    };
    if (!map[k]) return;
    // Arrow keys seek only once the video has started.
    if (k.startsWith("arrow") && !started) return;
    e.preventDefault();
    map[k]();
    wake();
  };
  const keysRef = useRef(keys);
  keysRef.current = keys;
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysRef.current(e);
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);

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
        {ended && (
          <UpNext
            next={next ?? null}
            countdown={autoplay && !cancelled ? countdown : null}
            onPlay={() => onNext?.()}
            onCancel={cancelAutoplay}
            onReplay={replay}
          />
        )}
        {started && status === "ready" && !playing && !buffering && !ended && (
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
        {pip && (
          <div className={s.pipPlaceholder}>
            <PipGlyph />
            <p>Playing in picture in picture</p>
            <button
              type="button"
              className={s.retry}
              onClick={() => void togglePip()}
            >
              Bring It Back
            </button>
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
            className={`${s.ctrl} ${s.skip}`}
            onClick={onPrev}
            disabled={!prev}
            aria-label={
              prev ? `Previous: ${prev.title} (Shift+P)` : "No previous demo"
            }
            title={prev ? `Previous: ${prev.title}` : undefined}
          >
            <SkipGlyph dir="prev" />
          </button>
          <button
            type="button"
            className={s.ctrl}
            onClick={togglePlay}
            aria-label={playing ? "Pause (k)" : "Play (k)"}
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button
            type="button"
            className={`${s.ctrl} ${s.skip}`}
            onClick={onNext}
            disabled={!next}
            aria-label={next ? `Next: ${next.title} (Shift+N)` : "No next demo"}
            title={next ? `Next: ${next.title}` : undefined}
          >
            <SkipGlyph dir="next" />
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

          <button
            type="button"
            className={`${s.ctrl} ${s.autoplay}`}
            role="switch"
            aria-checked={autoplay}
            onClick={toggleAutoplay}
            aria-label="Autoplay next demo"
            title={autoplay ? "Autoplay is on" : "Autoplay is off"}
          >
            <span className={s.autoplayTrack} aria-hidden>
              <span className={s.autoplayKnob}>
                {autoplay ? <PlayGlyph size={9} /> : <PauseGlyph size={9} />}
              </span>
            </span>
          </button>
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
          {pipSupported && (
            <button
              type="button"
              className={`${s.ctrl} ${s.pip}`}
              onClick={() => void togglePip()}
              aria-pressed={pip}
              aria-label={
                pip ? "Exit picture in picture (i)" : "Picture in picture (i)"
              }
              title="Picture in picture (i)"
            >
              <PipGlyph />
            </button>
          )}
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

// ── Up next ────────────────────────────────────────────────────────────────

/** Shown when a video ends: the next demo, with the autoplay countdown. */
function UpNext({
  next,
  countdown,
  onPlay,
  onCancel,
  onReplay,
}: {
  next: Neighbour | null;
  countdown: number | null;
  onPlay: () => void;
  onCancel: () => void;
  onReplay: () => void;
}) {
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => playRef.current?.focus({ preventScroll: true }), []);
  if (!next)
    return (
      <div className={s.upNext} role="dialog" aria-label="End of demo">
        <p className={s.upNextLabel}>That’s the last demo.</p>
        <button
          ref={playRef}
          type="button"
          className={s.upNextPlay}
          onClick={onReplay}
        >
          Replay
        </button>
      </div>
    );
  const r = 26;
  const frac = countdown === null ? 0 : countdown / AUTOPLAY_SECONDS;
  return (
    <div
      className={s.upNext}
      role="dialog"
      aria-label={`Up next: ${next.title}`}
    >
      <p className={s.upNextLabel} aria-live="polite">
        {countdown !== null ? `Up next in ${Math.ceil(countdown)}` : "Up next"}
      </p>
      <button
        type="button"
        className={s.upNextCard}
        onClick={onPlay}
        tabIndex={-1}
      >
        <span className={s.upNextThumb}>
          <img src={cdn(next.thumbnail)} alt="" width={1280} height={720} />
          <span className={s.upNextRing} aria-hidden>
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle cx="32" cy="32" r={r} fill="rgb(10 18 25 / 0.55)" />
              {countdown !== null && (
                <circle
                  cx="32"
                  cy="32"
                  r={r}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * r}
                  strokeDashoffset={2 * Math.PI * r * (1 - frac)}
                  transform="rotate(-90 32 32)"
                />
              )}
            </svg>
            <PlayGlyph size={22} />
          </span>
        </span>
        <span className={s.upNextText}>
          <strong>{next.title}</strong>
          <small>
            {next.module} ·{" "}
            <span className="px-num">{clock(next.duration)}</span>
          </small>
        </span>
      </button>
      <div className={s.upNextActions}>
        {countdown !== null && (
          <button type="button" className={s.upNextGhost} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className={s.upNextGhost} onClick={onReplay}>
          Replay
        </button>
        <button
          ref={playRef}
          type="button"
          className={s.upNextPlay}
          onClick={onPlay}
        >
          Play Now
        </button>
      </div>
    </div>
  );
}

function PipGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect
        x="12"
        y="11.5"
        width="7"
        height="5.5"
        rx="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function SkipGlyph({ dir }: { dir: "prev" | "next" }) {
  return svg(
    20,
    dir === "next" ? (
      <>
        <path d="M5 5.8v12.4a1 1 0 0 0 1.5.86l9.5-6.2a1 1 0 0 0 0-1.72L6.5 4.94A1 1 0 0 0 5 5.8Z" />
        <rect x="17" y="5" width="2.6" height="14" rx="1" />
      </>
    ) : (
      <>
        <path d="M19 5.8v12.4a1 1 0 0 1-1.5.86L8 12.86a1 1 0 0 1 0-1.72l9.5-6.2A1 1 0 0 1 19 5.8Z" />
        <rect x="4.4" y="5" width="2.6" height="14" rx="1" />
      </>
    ),
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
function PauseGlyph({ size = 20 }: { size?: number } = {}) {
  return svg(
    size,
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
