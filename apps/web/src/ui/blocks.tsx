import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from "react";
import dayjs from "dayjs";
import { Button, IconButton } from "./controls";
import { Skeleton, type Tone } from "./display";
import { Icon, type IconName } from "./Icon";
import s from "./blocks.module.css";

// Surfaces for summaries and forms. Color is semantic only: a tile or
// section takes a tone because of what it means (present = success, pending
// = warning), never to tell siblings apart.

const toneStyle = (tone: Tone): CSSProperties =>
  (tone === "neutral"
    ? { "--_soft": "var(--px-neutral-soft)", "--_fg": "var(--px-text-2)" }
    : {
        "--_soft": `var(--px-${tone}-soft)`,
        "--_fg": `var(--px-${tone})`,
      }) as CSSProperties;

// ── Stat tiles ──────────────────────────────────────────────────────────────

/** A row of headline numbers as lightly tinted tiles. */
export function StatTiles({
  children,
  label,
  min = 150,
}: {
  children: ReactNode;
  label?: string;
  /** Narrowest tile before the row wraps. */
  min?: number;
}) {
  return (
    <dl
      className={s.tiles}
      aria-label={label}
      style={{ "--_min": `${min}px` } as CSSProperties}
    >
      {children}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  note,
  icon,
  tone = "neutral",
  loading,
  progress,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  loading?: boolean;
  /** 0–1: a thin meter under the value (e.g. allowance left). */
  progress?: number;
}) {
  return (
    <div className={s.tile} style={toneStyle(tone)}>
      <dt className={s.tileLabel}>
        {icon && (
          <span className={s.tileIcon} aria-hidden>
            <Icon name={icon} size={16} />
          </span>
        )}
        {label}
      </dt>
      <dd className={s.tileValue}>
        {loading ? <Skeleton width={44} height={26} /> : value}
      </dd>
      {progress != null && !loading && (
        <dd className={s.tileMeter} aria-hidden>
          <span
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </dd>
      )}
      {note && <dd className={s.tileNote}>{note}</dd>}
    </div>
  );
}

// ── Cards and form sections ─────────────────────────────────────────────────

export function Card({
  children,
  className,
  padded = true,
  as: As = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "div" | "section" | "article";
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <As
      className={`${s.card} ${className ?? ""}`}
      data-padded={padded || undefined}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * A titled group of related fields: icon, title, one line on why it's
 * asked, then the fields. Long forms read as a few of these instead of one
 * column of inputs.
 */
export function FormSection({
  icon,
  title,
  description,
  action,
  tone = "accent",
  children,
  id,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      className={`${s.card} ${s.formSection}`}
      data-padded
      aria-labelledby={headingId}
      id={id}
    >
      <header className={s.formSectionHeader}>
        {icon && (
          <span className={s.sectionIcon} style={toneStyle(tone)} aria-hidden>
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className={s.formSectionText}>
          <h2 className={s.formSectionTitle} id={headingId}>
            {title}
          </h2>
          {description && (
            <p className={s.formSectionDescription}>{description}</p>
          )}
        </div>
        {action && <div className={s.formSectionAction}>{action}</div>}
      </header>
      {children}
    </section>
  );
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** A small calendar leaf: month band, day, weekday. */
export function DateTile({
  date,
  tone = "accent",
  muted,
  size = "regular",
}: {
  date: string | Date;
  tone?: Tone;
  muted?: boolean;
  size?: "regular" | "small";
}) {
  const d = dayjs(date);
  return (
    <span
      className={s.dateTile}
      style={toneStyle(muted ? "neutral" : tone)}
      data-size={size}
      aria-hidden
    >
      <span className={s.dateMonth}>{d.format("MMM")}</span>
      <span className={s.dateDay}>{d.format("D")}</span>
      {size === "regular" && (
        <span className={s.dateWeekday}>{d.format("ddd")}</span>
      )}
    </span>
  );
}

/** ‹ Period › in one capsule, with an optional jump back to the present. */
export function PeriodStepper({
  label,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  nextDisabled,
  onReset,
  resetLabel,
}: {
  label: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  nextDisabled?: boolean;
  /** Shown when set, e.g. "This Month" while viewing another month. */
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className={s.period}>
      <div className={s.periodCapsule}>
        <IconButton
          icon="chevronLeft"
          label={previousLabel}
          onClick={onPrevious}
        />
        <span className={s.periodLabel} aria-live="polite">
          {label}
        </span>
        <IconButton
          icon="chevronRight"
          label={nextLabel}
          onClick={onNext}
          disabled={nextDisabled}
        />
      </div>
      {onReset && resetLabel && (
        <Button size="small" variant="plain" onClick={onReset}>
          {resetLabel}
        </Button>
      )}
    </div>
  );
}

// ── Review ──────────────────────────────────────────────────────────────────

/**
 * One step's answers on a review screen, with a way back to change them.
 * Problems are listed first so they're the first thing read.
 */
export function ReviewSection({
  title,
  icon,
  items,
  issues,
  onEdit,
  editLabel = "Edit",
}: {
  title: string;
  icon?: IconName;
  items: [ReactNode, ReactNode][];
  issues?: string[];
  onEdit?: () => void;
  editLabel?: string;
}) {
  const hasIssues = Boolean(issues?.length);
  return (
    <section
      className={`${s.card} ${s.review}`}
      data-padded
      data-issues={hasIssues || undefined}
      aria-label={title}
    >
      <header className={s.reviewHeader}>
        {icon && (
          <span
            className={s.sectionIcon}
            style={toneStyle(hasIssues ? "danger" : "accent")}
            aria-hidden
          >
            <Icon name={hasIssues ? "alert" : icon} size={16} />
          </span>
        )}
        <h3 className={s.reviewTitle}>{title}</h3>
        {onEdit && (
          <Button
            size="small"
            variant="plain"
            icon="edit"
            onClick={onEdit}
            aria-label={`${editLabel} ${title}`}
          >
            {editLabel}
          </Button>
        )}
      </header>
      {hasIssues && (
        <ul className={s.reviewIssues} role="list">
          {issues!.map((i) => (
            <li key={i}>
              <Icon name="alert" size={14} />
              {i}
            </li>
          ))}
        </ul>
      )}
      <dl className={s.reviewList}>
        {items.map(([k, v], i) => (
          <div key={i} className={s.reviewItem}>
            <dt>{k}</dt>
            <dd>
              {v === "" || v == null ? (
                <span className="px-tertiary">—</span>
              ) : (
                v
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Label/value line for summary panels (totals, request previews). */
export function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={s.summaryRow} data-emphasis={emphasis || undefined}>
      <span>{label}</span>
      <span className="px-num">{value}</span>
    </div>
  );
}

// ── Rating ──────────────────────────────────────────────────────────────────

const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * A 1–5 rating as a radio group of labelled cards. Arrow keys move the
 * choice; the selected option is filled with the accent and named in words,
 * so the scale never relies on color alone.
 */
export function RatingScale({
  value,
  onChange,
  label,
  disabled,
  invalid,
  words = RATING_WORDS,
  colored,
}: {
  value?: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  words?: string[];
  /** Colour the scale from red (1) to green (5). */
  colored?: boolean;
}) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!d || disabled) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, (value ?? 0) + d || 1));
    // Read the group now: React clears currentTarget after the handler.
    const group = e.currentTarget;
    onChange(next);
    requestAnimationFrame(() =>
      group.querySelector<HTMLButtonElement>(`[data-n="${next}"]`)?.focus(),
    );
  };
  return (
    <div
      className={s.rating}
      data-colored={colored || undefined}
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      onKeyDown={move}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          data-n={n}
          aria-checked={value === n}
          aria-label={`${n}, ${words[n - 1]}`}
          tabIndex={value === n || (!value && n === 1) ? 0 : -1}
          disabled={disabled}
          className={s.ratingOption}
          data-filled={value != null && n <= value ? "" : undefined}
          onClick={() => onChange(n)}
        >
          <span className={s.ratingNum}>{n}</span>
          <span className={s.ratingWord}>{words[n - 1]}</span>
        </button>
      ))}
    </div>
  );
}

/** Read-only score as five pips and "4 / 5". */
export function ScorePips({
  value,
  max = 5,
  label,
  showValue = true,
}: {
  value?: number | null;
  max?: number;
  label?: string;
  /** Off where the number is already shown beside the pips. */
  showValue?: boolean;
}) {
  if (value == null || Number.isNaN(Number(value)))
    return <span className="px-tertiary">—</span>;
  const v = Number(value);
  return (
    <span
      className={s.pips}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${v} out of ${max}`}
    >
      <span className={s.pipRow} aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <i
            key={i}
            data-on={i + 1 <= Math.floor(v) || undefined}
            data-tone={v >= 4 ? "success" : v >= 3 ? "accent" : "warning"}
          />
        ))}
      </span>
      {showValue && (
        <span className={s.pipValue} aria-hidden>
          {Number.isInteger(v) ? v : v.toFixed(1)}
          <small> / {max}</small>
        </span>
      )}
    </span>
  );
}

/**
 * A labelled group of fields inside a dialog: a small heading, an optional
 * note, then the fields. Lighter than FormSection, which is a card.
 */
export function FieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className={s.fieldGroup}>
      <legend className={s.fieldGroupTitle}>{title}</legend>
      {description && <p className={s.fieldGroupNote}>{description}</p>}
      {children}
    </fieldset>
  );
}
