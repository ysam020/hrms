// The player's picture-in-picture window, where the browser supports
// Document Picture-in-Picture (Chrome, Edge, Brave). The <video> element is
// moved into the window and this compact set of controls is drawn over it;
// the window has its own React root, rendered by HlsPlayer on every update.
import type { PointerEvent as ReactPointerEvent } from "react";
import { clock } from "./catalogue";
import s from "./productDemo.module.css";

/** Window.documentPictureInPicture, where supported. */
export interface DocumentPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}
export function documentPip(): DocumentPip | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { documentPictureInPicture?: DocumentPip })
        .documentPictureInPicture;
}

/** Bring the page's styles and the player's design tokens into `w`. */
export function prepareWindow(w: Window, from: HTMLElement, title: string) {
  const doc = w.document;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      doc.head.append(style);
    } catch {
      // A cross-origin sheet (web fonts) can't be read; link it instead.
      if (sheet.href) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        doc.head.append(link);
      }
    }
  }
  const tokens = getComputedStyle(from);
  for (const name of ["--l-accent", "--px-font", "--landing-focus"]) {
    const v = tokens.getPropertyValue(name);
    if (v) doc.body.style.setProperty(name, v);
  }
  doc.title = title;
  doc.body.className = s.pipBody;
}

export interface PipControlsProps {
  title: string;
  playing: boolean;
  ended: boolean;
  buffering: boolean;
  time: number;
  total: number;
  cue: string | null;
  lang: string;
  muted: boolean;
  subtitlesOn: boolean;
  prevTitle?: string;
  nextTitle?: string;
  onTogglePlay(): void;
  onSeek(t: number): void;
  onPrev(): void;
  onNext(): void;
  onToggleMute(): void;
  onToggleSubtitles(): void;
  onBack(): void;
}

export function PipControls(p: PipControlsProps) {
  const frac = p.total ? Math.min(1, p.time / p.total) : 0;
  const seekFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    p.onSeek(((e.clientX - r.left) / r.width) * p.total);
  };
  return (
    <div
      className={s.pipUi}
      data-paused={!p.playing || undefined}
      data-ended={p.ended || undefined}
    >
      {p.subtitlesOn && p.cue && (
        <div className={s.pipCue} lang={p.lang}>
          <span>{p.cue}</span>
        </div>
      )}

      <div className={s.pipTop}>
        <span className={s.pipTitle}>{p.title}</span>
        <button
          type="button"
          className={s.pipBtn}
          onClick={p.onBack}
          aria-label="Back to the page (i)"
          title="Back to the page (i)"
        >
          <BackGlyph />
        </button>
      </div>

      {/* A click anywhere on the picture plays or pauses, as in the page. */}
      <button
        type="button"
        className={s.pipHit}
        onClick={p.onTogglePlay}
        aria-hidden
        tabIndex={-1}
      />

      <div className={s.pipCentre}>
        <button
          type="button"
          className={s.pipBtn}
          onClick={p.onPrev}
          disabled={!p.prevTitle}
          aria-label={
            p.prevTitle ? `Previous: ${p.prevTitle}` : "No previous demo"
          }
        >
          <Skip dir="prev" />
        </button>
        <button
          type="button"
          className={s.pipPlay}
          onClick={p.onTogglePlay}
          aria-label={p.playing ? "Pause (space)" : "Play (space)"}
        >
          {p.playing ? <Pause /> : <Play />}
        </button>
        <button
          type="button"
          className={s.pipBtn}
          onClick={p.onNext}
          disabled={!p.nextTitle}
          aria-label={p.nextTitle ? `Next: ${p.nextTitle}` : "No next demo"}
        >
          <Skip dir="next" />
        </button>
      </div>

      {p.ended && p.nextTitle && (
        <p className={s.pipNext}>
          Up next · <strong>{p.nextTitle}</strong>
        </p>
      )}

      <div className={s.pipBottom}>
        <div
          className={s.pipProgress}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(p.total)}
          aria-valuenow={Math.round(p.time)}
          aria-valuetext={`${clock(p.time)} of ${clock(p.total)}`}
          onPointerDown={seekFrom}
        >
          <span style={{ width: `${frac * 100}%` }} />
        </div>
        <div className={s.pipRow}>
          <span className={s.pipTime}>
            {clock(p.time)} / {clock(p.total)}
          </span>
          <span className={s.spacer} />
          <button
            type="button"
            className={s.pipBtn}
            onClick={p.onToggleSubtitles}
            aria-pressed={p.subtitlesOn}
            aria-label="Subtitles (c)"
            title="Subtitles (c)"
          >
            <span className={s.pipCc} data-on={p.subtitlesOn || undefined}>
              CC
            </span>
          </button>
          <button
            type="button"
            className={s.pipBtn}
            onClick={p.onToggleMute}
            aria-label={p.muted ? "Unmute (m)" : "Mute (m)"}
          >
            <Speaker muted={p.muted} />
          </button>
        </div>
      </div>
    </div>
  );
}

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function Play() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}
function Pause() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}
function Skip({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>
      <g transform={dir === "prev" ? "matrix(-1 0 0 1 24 0)" : undefined}>
        <path d="M6 5.5v13l9.5-6.5z" fill="currentColor" />
        <rect
          x="16"
          y="5.5"
          width="2.4"
          height="13"
          rx="1"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
function Speaker({ muted }: { muted: boolean }) {
  return (
    <svg width={20} height={20} {...svg}>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
      {muted ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
      )}
    </svg>
  );
}
/** A window with an arrow into it: return the video to the page. */
function BackGlyph() {
  return (
    <svg width={20} height={20} {...svg}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M15.5 9.5l-5 5M10.5 10v4.5H15" />
    </svg>
  );
}
