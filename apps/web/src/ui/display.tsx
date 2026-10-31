import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import s from "./display.module.css";

// ── Avatar ──────────────────────────────────────────────────────────────────
// Initials on a tint derived from the name, so the same person always gets
// the same color. Tints are low-chroma; initials meet 4.5:1 on every tint.

const TINTS: [string, string][] = [
  ["#e3f0f6", "#11577a"],
  ["#ece8fb", "#4b3aa8"],
  ["#e5f3ea", "#1b6b3c"],
  ["#fbefdc", "#7d4a00"],
  ["#f9e6ea", "#9a2742"],
  ["#e8eef3", "#3a4a5a"],
];

export function initials(name = "") {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "?"
  );
}

function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function Avatar({
  name,
  src,
  size = 32,
  style,
}: {
  name: string;
  src?: string | null;
  size?: number;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [bg, fg] = tintFor(name || "?");
  return (
    <span
      className={s.avatar}
      style={
        {
          "--_s": `${size}px`,
          "--_bg": bg,
          "--_fg": fg,
          ...style,
        } as CSSProperties
      }
      aria-hidden
    >
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneVars = (tone: Tone): CSSProperties =>
  tone === "neutral"
    ? ({
        "--_soft": "var(--px-neutral-soft)",
        "--_fg": "var(--px-text-2)",
      } as CSSProperties)
    : ({
        "--_soft": `var(--px-${tone}-soft)`,
        "--_fg": `var(--px-${tone})`,
      } as CSSProperties);

/** Dot + text. Color reinforces the label; it never replaces it. */
export function StatusBadge({
  tone,
  children,
  plain,
}: {
  tone: Tone;
  children: ReactNode;
  plain?: boolean;
}) {
  return (
    <span
      className={s.badge}
      style={toneVars(tone)}
      data-plain={plain || undefined}
    >
      {children}
    </span>
  );
}

/** Map the backend's status vocabulary onto tones in one place. */
export function toneForStatus(status?: string | null): Tone {
  const v = (status || "").toLowerCase().trim();
  // Attendance and calendar states. Leave and holidays are planned time
  // away, not a problem, so they take the informational accent; a late
  // punch or half day needs a look, so amber.
  if (/^(on.?leave|leave|holiday|wfh|work from home)$/.test(v)) return "accent";
  if (/^(late|half.?day)$/.test(v)) return "warning";
  if (v === "disbursing") return "warning";
  // Before the success test, which would otherwise match its "active".
  if (v === "inactive") return "danger";
  if (
    /(approved|active|present|complete|completed|resolved|closed|paid|hired|verified|published|success|disbursed)/.test(
      v,
    )
  )
    return "success";
  if (
    /(pending|review|in.?progress|open|draft|submitted|scheduled|processing|notice|requested|awaiting)/.test(
      v,
    )
  )
    return "warning";
  if (
    /(rejected|absent|failed|cancel|withdrawn|overdue|expired|terminated|lost|declined|inactive)/.test(
      v,
    )
  )
    return "danger";
  return "neutral";
}

export function Status({ value }: { value?: string | null }) {
  if (!value) return <span className="px-tertiary">—</span>;
  return <StatusBadge tone={toneForStatus(value)}>{value}</StatusBadge>;
}

export function Tag({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={s.tag} style={tone ? toneVars(tone) : undefined}>
      {children}
    </span>
  );
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export function Metrics({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <dl className={s.metrics} aria-label={label}>
      {children}
    </dl>
  );
}

export function Metric({
  label,
  value,
  note,
  size,
  loading,
  tone,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  size?: "sm";
  loading?: boolean;
  /** Tints the tile by meaning (success, warning…); neutral when omitted. */
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <div
      className={s.metric}
      data-tone={tone && tone !== "neutral" ? "" : undefined}
      style={tone ? toneVars(tone) : undefined}
    >
      <dt className={s.metricLabel}>
        {icon && (
          <span className={s.metricIcon} aria-hidden>
            <Icon name={icon} size={15} />
          </span>
        )}
        {label}
      </dt>
      <dd className={s.metricValue} data-size={size}>
        {loading ? <Skeleton width={48} height={size ? 20 : 26} /> : value}
      </dd>
      {note && <dd className={s.metricNote}>{note}</dd>}
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function Section({
  title,
  detail,
  action,
  children,
  id,
  className,
  headingLevel = 2,
}: {
  title?: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      className={`${s.section} ${className ?? ""}`}
      aria-labelledby={title ? headingId : undefined}
      id={id}
    >
      {(title || action) && (
        <header className={s.sectionHeader}>
          {title && (
            <H className={s.sectionTitle} id={headingId}>
              {title}
            </H>
          )}
          {detail && <span className={s.sectionDetail}>{detail}</span>}
          {action && <div className={s.sectionAction}>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Group({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${s.group} ${className ?? ""}`}>{children}</div>;
}

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? <span className="px-tertiary">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Feedback ────────────────────────────────────────────────────────────────

export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
  tone = "accent",
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon} style={toneVars(tone)} aria-hidden>
        <Icon name={icon} size={24} />
      </span>
      <p className={s.emptyTitle}>{title}</p>
      {children && <p className={s.emptyBody}>{children}</p>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon="alert"
      tone="danger"
      title="This couldn’t be loaded"
      action={
        onRetry && (
          <button type="button" className="px-link-button" onClick={onRetry}>
            Try Again
          </button>
        )
      }
    >
      {message || "Check your connection and try again."}
    </EmptyState>
  );
}

export function Banner({
  tone = "accent",
  icon,
  title,
  children,
  action,
}: {
  tone?: Tone;
  icon?: IconName;
  /** A bold first line; the children become its explanation. */
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const name: IconName =
    icon ??
    (tone === "danger"
      ? "alert"
      : tone === "success"
        ? "checkCircle"
        : tone === "warning"
          ? "alert"
          : "info");
  return (
    <div
      className={s.banner}
      style={toneVars(tone)}
      role={tone === "danger" ? "alert" : "status"}
      data-titled={title ? "" : undefined}
    >
      <Icon name={name} />
      <div className={s.bannerBody}>
        {title && <p className={s.bannerTitle}>{title}</p>}
        {children}
      </div>
      {action && <div className={s.bannerAction}>{action}</div>}
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className={s.skeleton}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
      data-skeleton=""
    />
  );
}

/** One stacked bar with a legend — for part-of-whole with ≤6 parts. */
export function Meter({
  parts,
  label,
}: {
  parts: { label: string; value: number; color: string }[];
  label: string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        className={s.meter}
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span
              key={p.label}
              style={{
                width: `${(p.value / total) * 100}%`,
                background: p.color,
              }}
            />
          ))}
      </div>
      <div className={s.legend} aria-hidden>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label}
            <b
              className="px-num"
              style={{ fontWeight: 600, color: "var(--px-text-1)" }}
            >
              {p.value}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
