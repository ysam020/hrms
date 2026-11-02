import type { CSSProperties } from "react";
import { Avatar, Icon } from "@next/ui";
import { fromNow } from "@next/lib/format";
import {
  STATUS,
  WORK_MODE,
  describe,
  untilLabel,
  type DisplayStatus,
  type PresenceView,
} from "./model";
import { usePresenceOf } from "./PresenceProvider";
import s from "./presence.module.css";

/**
 * The status dot. Colour plus a glyph (check, minus, clock, hollow ring), and
 * an accessible name — `label` when the dot stands in for a whole sentence.
 */
export function PresenceDot({
  status,
  size = 10,
  label,
  decorative,
}: {
  status: DisplayStatus;
  size?: number;
  label?: string;
  /** The status is already written next to the dot. */
  decorative?: boolean;
}) {
  const meta = STATUS[status];
  return (
    <span
      className={s.dot}
      data-glyph={meta.glyph}
      style={{ "--_c": meta.color, "--_s": `${size}px` } as CSSProperties}
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "img",
            "aria-label": label ?? meta.label,
            title: label ?? meta.label,
          })}
    >
      <svg viewBox="0 0 10 10" aria-hidden>
        {meta.glyph === "check" && <path d="M3 5.2 4.4 6.6 7.1 3.6" />}
        {meta.glyph === "minus" && <path d="M3 5h4" />}
        {meta.glyph === "clock" && <path d="M5 2.9V5l1.4 1" />}
      </svg>
    </span>
  );
}

/** An avatar with the person's live status in its corner. */
export function PresenceAvatar({
  userId,
  name,
  src,
  size = 32,
  style,
}: {
  userId: string | null | undefined;
  name: string;
  src?: string | null;
  size?: number;
  style?: CSSProperties;
}) {
  const view = usePresenceOf(userId);
  return (
    <span className={s.avatarWrap}>
      <Avatar name={name} src={src} size={size} style={style} />
      {view && (
        <span className={s.avatarDot}>
          <PresenceDot
            status={view.status}
            size={Math.max(8, Math.min(14, Math.round(size * 0.3)))}
            label={`${name}: ${describe(view)}`}
          />
        </span>
      )}
    </span>
  );
}

/** Dot + status label, with the message and end time on a second line. */
export function PresenceSummary({
  view,
  showWorkMode = true,
}: {
  view: PresenceView | null;
  showWorkMode?: boolean;
}) {
  if (!view) return <span className="px-tertiary">—</span>;
  const meta = STATUS[view.status];
  const until = untilLabel(view.expiresAt);
  const mode = view.workMode ? WORK_MODE[view.workMode] : null;
  const detail =
    view.status === "offline"
      ? [
          view.availability !== "available"
            ? STATUS[view.availability].label
            : null,
          view.lastSeenAt ? `Last active ${fromNow(view.lastSeenAt)}` : null,
        ]
      : [view.message, until];
  const second = detail.filter(Boolean).join(" · ");
  return (
    <span className={s.summary}>
      <span className={s.summaryLine}>
        <PresenceDot status={view.status} decorative />
        <span>{meta.label}</span>
        {showWorkMode && mode && (
          <span className={s.mode}>
            <Icon name={view.workMode === "field" ? "pin" : "wfh"} size={13} />
            {mode.label}
          </span>
        )}
      </span>
      {second && <span className={s.summaryDetail}>{second}</span>}
      {view.status === "offline" && view.message && (
        <span className={s.summaryDetail}>{view.message}</span>
      )}
    </span>
  );
}
