import type { CSSProperties } from "react";
import { MARK_STROKES } from "@next/ui/Spinner";

/**
 * The Praesto mark — the same three strokes as Classic's logo
 * (apps/web/src/assets/data/LogoDark.tsx), drawn static: Classic's version
 * animates in over ~2s and ignores Reduce Motion, which a sign-in page
 * shouldn't make people wait through. The animated mark is the app's
 * loader (ui/Spinner).
 */
export function BrandMark({
  size = 32,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="58 22 50 66"
      width={(size * 50) / 66}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={style}
      fill="none"
      strokeWidth={5.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MARK_STROKES.map((p) => (
        <path key={p.d} d={p.d} stroke={p.color} />
      ))}
    </svg>
  );
}

/**
 * Mark + wordmark. The wordmark is set the way Apple sets product names: the
 * app's own display face, title case, semibold, tracked slightly tight, and
 * sized from the mark so the pair keeps its proportions at every size. It
 * takes the surrounding text colour, so it reads on whatever surface holds
 * it; `inverse` forces white on dark brand surfaces.
 */
export function BrandLockup({
  size = 30,
  inverse = false,
}: {
  size?: number;
  /** On dark brand surfaces. */
  inverse?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.32),
      }}
    >
      <BrandMark size={size} />
      <span
        style={{
          font: `600 ${Math.round(size * 0.82)}px/1 var(--px-font-display)`,
          letterSpacing: "-0.02em",
          color: inverse ? "#fff" : "currentColor",
        }}
      >
        Praesto
      </span>
    </span>
  );
}
