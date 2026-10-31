import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import s from "./charts.module.css";

/** Same centered treatment as an empty table, so side-by-side panels align. */
// Compact, so an empty chart doesn't take a chart's height of whitespace.
const NoData = () => (
  <div className={s.noData}>
    <Icon name="chart" size={18} />
    <span>No data yet</span>
  </div>
);

// A deliberately small chart kit (dataviz method): one baseline, thin marks
// with 4px rounded data-ends, recessive grid, text in text tokens (never the
// series color), hover/focus tooltips, and a screen-reader table for every
// chart. Colors come from --px-series-* (validated palette) in fixed order.

export const SERIES = Array.from(
  { length: 8 },
  (_, i) => `var(--px-series-${i + 1})`,
);
export const OTHER = "var(--px-series-other)";

const nf = (v: number) => v.toLocaleString("en-IN");

function SrTable({
  caption,
  rows,
  unit,
}: {
  caption: string;
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  return (
    <table className="px-sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>
              {nf(r.value)}
              {unit ? ` ${unit}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Ranked horizontal bars — magnitude by category. Labels and values are
 * printed, so the list doubles as its own table.
 */
export function BarList({
  data,
  label,
  color = SERIES[0],
  format = nf,
  max,
  limit = 8,
}: {
  data: { label: string; value: number; color?: string }[];
  label: string;
  color?: string;
  format?: (v: number) => ReactNode;
  max?: number;
  limit?: number;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((a, d) => a + d.value, 0);
  const rows =
    rest > 0
      ? [...shown, { label: "Other", value: rest, color: OTHER }]
      : shown;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <NoData />;
  return (
    <ul className={s.barList} aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className={s.barRow}>
          <span className={s.barLabel}>{r.label}</span>
          <span className={s.barTrack} aria-hidden>
            <span
              className={s.bar}
              style={{
                width: `${Math.max(1.5, (r.value / top) * 100)}%`,
                background: r.color ?? color,
              }}
            />
          </span>
          <span className={s.barValue}>{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns over an ordered axis (months, ranges). One series. */
export function Columns({
  data,
  label,
  color = SERIES[0],
  height = 180,
  unit,
  format = nf,
}: {
  data: { label: string; value: number }[];
  label: string;
  color?: string;
  height?: number;
  unit?: string;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  if (!data.length) return <NoData />;
  const ticks = [0, top / 2, top];
  return (
    <figure className={s.columns} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="px-sr-only">
        {label}
      </figcaption>
      <div className={s.plot} style={{ height } as CSSProperties} aria-hidden>
        {ticks.map((t) => (
          <span
            key={t}
            className={s.gridline}
            style={{ bottom: `${(t / top) * 100}%` }}
          >
            <span className={s.tick}>{format(t)}</span>
          </span>
        ))}
        <div
          className={s.bars}
          style={{
            gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
          }}
        >
          {data.map((d, i) => (
            <button
              key={d.label}
              type="button"
              tabIndex={-1}
              className={s.col}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span
                className={s.colBar}
                data-active={hover === i || undefined}
                style={{
                  height: `${top ? (d.value / top) * 100 : 0}%`,
                  background: color,
                }}
              />
              {hover === i && (
                <span className={s.tooltip} role="tooltip">
                  <b>{format(d.value)}</b>
                  {unit ? ` ${unit}` : ""}
                  <span>{d.label}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div
        className={s.axis}
        style={{
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
        }}
        aria-hidden
      >
        {data.map((d, i) => (
          <span
            key={d.label}
            data-skip={
              data.length > 12 && i % Math.ceil(data.length / 12) !== 0
                ? ""
                : undefined
            }
          >
            {d.label}
          </span>
        ))}
      </div>
      <SrTable caption={label} rows={data} unit={unit} />
    </figure>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Legend for multi-series marks (identity is never color alone). */
export function Legend({
  items,
}: {
  items: { label: string; color: string; value?: ReactNode }[];
}) {
  return (
    <ul className={s.legend}>
      {items.map((i) => (
        <li key={i.label}>
          <i style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value != null && <b>{i.value}</b>}
        </li>
      ))}
    </ul>
  );
}

/** A titled chart block: heading, optional note, content. No card chrome. */
export function ChartBlock({
  title,
  note,
  children,
  span,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  span?: 2;
}) {
  return (
    <section className={s.block} data-span={span}>
      <header>
        <h2 className="px-headline">{title}</h2>
        {note && <p className="px-meta">{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}
