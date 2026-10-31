import { useState, type CSSProperties } from "react";
import s from "./Spinner.module.css";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/**
 * The Praesto mark's three strokes (features/auth/BrandMark draws them
 * static). Listed in drawing order: the stem and the base both start at the
 * bottom-left corner, and the green stroke picks up where the base ends.
 */
export const MARK_STROKES = [
  { d: "M 63.5,81.4 L 64.5,34.7 L 72.1,44.3", color: "#fd7624" },
  { d: "M 63.3,82.2 L 91.3,57.2", color: "#f03933" },
  { d: "M 75.5,57.0 L 102.7,27.5 L 102.7,72.0 L 95.7,65.0", color: "#25b37b" },
] as const;

/** One loop, ms. Keep in step with Spinner.module.css and index.html. */
const PERIOD = 2400;

const SIZES = { small: 16, regular: 24, large: 40 } as const;
export type SpinnerSize = keyof typeof SIZES | number;

/**
 * The animated mark on its own, hidden from assistive tech: the caller owns
 * the busy state (Spinner's role="status", a button's aria-busy).
 *
 * Every mark joins the loop at the document clock's current phase, so marks
 * on screen together move together, and the app's boot loader picks up where
 * index.html's pre-JS one left off instead of restarting.
 */
export function SpinnerMark({
  size = SIZES.regular,
  tone = "brand",
}: {
  size?: number | string;
  /** "mono" draws in currentColor, for buttons and other tinted surfaces. */
  tone?: "brand" | "mono";
}) {
  const [sync] = useState(() => `${-Math.round(performance.now() % PERIOD)}ms`);
  // Optical sizing: the logo's hairline weight disappears below ~20px.
  const heavy = tone === "mono" || (typeof size === "number" && size <= 20);
  return (
    <svg
      viewBox="50 22 66 66"
      width={size}
      height={size}
      className={s.mark}
      style={{ "--_sync": sync } as CSSProperties}
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeWidth={heavy ? 7 : 5.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* A faint copy of the whole mark under the moving strokes, so the
          mark never blinks out between loops — at button size an empty
          moment reads as "done". */}
      {["track", "ink"].map((layer) => (
        <g key={layer} className={s[layer]}>
          {MARK_STROKES.map((p) => (
            <path
              key={p.d}
              d={p.d}
              pathLength={1}
              stroke={tone === "mono" ? "currentColor" : p.color}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/**
 * Praesto's loading indicator: the mark drawing itself, holding, and
 * clearing. For content with a known shape prefer the skeletons; for
 * measurable work use a progress bar.
 */
export function Spinner({
  label = "Loading",
  size = "regular",
  showLabel = false,
}: {
  /** Accessible name; also the caption when `showLabel` is set. */
  label?: string;
  size?: SpinnerSize;
  /** Show `label` beside the mark (below it from 40px up). */
  showLabel?: boolean;
}) {
  const px = typeof size === "number" ? size : SIZES[size];
  return (
    <span
      role="status"
      aria-label={showLabel ? undefined : label}
      className={cx(s.spinner, showLabel && px >= 40 && s.stacked)}
    >
      <SpinnerMark size={px} />
      {showLabel && <span className={s.caption}>{label}</span>}
    </span>
  );
}

/**
 * Whole-viewport loading (app start, session restore). The caption fades in
 * only if the wait runs long, so a quick boot shows just the mark — matching
 * index.html's loader, which this replaces without a jump.
 */
export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className={s.screen}>
      <span role="status" className={cx(s.spinner, s.stacked)}>
        <SpinnerMark size={56} />
        <span className={cx(s.caption, s.lateCaption)}>{label}</span>
      </span>
    </div>
  );
}
