import { LayoutGroup, motion } from "framer-motion";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { duration, ease } from "@next/motion";
import { useIsCompact } from "@next/lib/hooks";
import { Select } from "./fields";
import s from "./controls.module.css";

// Lives apart from controls.tsx: its narrow-screen fallback is a Select
// (fields.tsx), and fields -> pickers -> overlays already depend on the
// buttons in controls.tsx. Keeping it there made those four modules a cycle.

// ── Segmented control ───────────────────────────────────────────────────────
// Used for sibling sub-views of a page (tabs) and for small filters. The
// selection thumb glides between segments with a shared layout animation.

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  role = "tablist",
  idPrefix,
  tour,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** "tablist" when it switches panels, "radiogroup" when it filters. */
  role?: "tablist" | "radiogroup";
  /** For tablists: panel ids are `${idPrefix}-panel-${value}`. */
  idPrefix?: string;
  /** Walkthrough target id (`data-tour`). */
  tour?: string;
}) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isTabs = role === "tablist";
  const compact = useIsCompact();

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? segments.length - 1
          : (index + dir + segments.length) % segments.length;
    refs.current[next]?.focus();
    onChange(segments[next].value);
  };

  // A filter with more choices than fit on a phone becomes a pop-up picker
  // there instead of a strip whose later segments sit off-screen. The HIG
  // suggests at most about five segments on iPhone; with this app's labels,
  // five already overflow a 375pt screen, so the cut is above four. Tab
  // sets keep their segments.
  if (!isTabs && compact && segments.length > 4)
    return (
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={s.segmentedPicker}
        data-tour={tour}
      >
        {segments.map((seg) => (
          <option key={seg.value} value={seg.value}>
            {typeof seg.label === "string" ? seg.label : seg.value}
            {seg.count != null ? ` (${seg.count})` : ""}
          </option>
        ))}
      </Select>
    );

  return (
    <LayoutGroup id={group}>
      <div
        className={s.segmented}
        role={role}
        aria-label={label}
        data-tour={tour}
      >
        {segments.map((seg, i) => {
          const selected = seg.value === value;
          return (
            <button
              key={seg.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role={isTabs ? "tab" : "radio"}
              id={idPrefix ? `${idPrefix}-tab-${seg.value}` : undefined}
              aria-controls={
                isTabs && idPrefix
                  ? `${idPrefix}-panel-${seg.value}`
                  : undefined
              }
              aria-selected={isTabs ? selected : undefined}
              aria-checked={!isTabs ? selected : undefined}
              tabIndex={selected ? 0 : -1}
              className={s.segment}
              onClick={() => onChange(seg.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {selected && (
                <motion.span
                  layoutId="thumb"
                  className={s.segmentThumb}
                  transition={{ duration: duration.base, ease: ease.standard }}
                />
              )}
              {seg.label}
              {seg.count != null && (
                <span className={s.segmentCount}>{seg.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
