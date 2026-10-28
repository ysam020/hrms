import type { CSSProperties } from "react";
import { Skeleton } from "./display";
import d from "./display.module.css";
import f from "./fields.module.css";
import c from "./charts.module.css";
import s from "./skeletons.module.css";

// Loading placeholders shaped like the content they stand in for, built on
// the same grids as the real components (FormGrid, Metrics, ChartGrid,
// KeyValues) so nothing shifts when the data arrives. All are hidden from
// assistive tech; the page's own busy state announces loading.

const widths = ["72%", "54%", "86%", "63%", "78%", "47%", "68%", "58%"];
const w = (i: number) => widths[i % widths.length];

/** A few lines of body text. */
export function TextSkeleton({
  lines = 3,
  lastWidth = "60%",
}: {
  lines?: number;
  lastWidth?: string;
}) {
  return (
    <div className={s.text} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? lastWidth : "100%"} />
      ))}
    </div>
  );
}

/** Label + control pairs on the form grid. */
export function FormSkeleton({
  fields = 6,
  columns = 2,
  toggles = 0,
}: {
  fields?: number;
  columns?: 1 | 2;
  /** Switch rows after the fields. */
  toggles?: number;
}) {
  return (
    <div className={s.stack} aria-hidden>
      <div className={f.formGrid} data-columns={columns}>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className={f.field}>
            <Skeleton width={`${28 + ((i * 13) % 30)}%`} height={12} />
            <Skeleton height="var(--px-control-h)" radius={6} />
          </div>
        ))}
      </div>
      {Array.from({ length: toggles }, (_, i) => (
        <div key={i} className={s.toggle}>
          <Skeleton width={36} height={20} radius={10} />
          <Skeleton width={w(i)} height={12} style={{ maxWidth: 280 }} />
        </div>
      ))}
    </div>
  );
}

/** Titled sections, each holding a form — the settings-page shape. */
export function SectionsSkeleton({
  sections = 2,
  fields = 4,
  columns = 2,
  toggles = 1,
}: {
  sections?: number;
  fields?: number;
  columns?: 1 | 2;
  toggles?: number;
}) {
  return (
    <div className={s.sections} aria-hidden>
      {Array.from({ length: sections }, (_, i) => (
        <section key={i} className={s.section}>
          <div className={s.heading}>
            <Skeleton width={i % 2 ? 140 : 180} height={17} />
            <Skeleton width="44%" height={12} />
          </div>
          <FormSkeleton fields={fields} columns={columns} toggles={toggles} />
        </section>
      ))}
    </div>
  );
}

/** A row of metric tiles. */
export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={d.metrics} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={d.metric}>
          <Skeleton width={`${50 + ((i * 17) % 30)}%`} height={12} />
          <Skeleton width={56} height={28} style={{ marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}

/** One chart block: title, note and a bar or column chart. */
export function ChartSkeleton({
  kind = "bars",
  span,
}: {
  kind?: "bars" | "columns";
  span?: 2;
}) {
  return (
    <section className={c.block} data-span={span} aria-hidden>
      <header className={s.heading}>
        <Skeleton width={150} height={16} />
        <Skeleton width={110} height={11} />
      </header>
      <ChartBodySkeleton kind={kind} />
    </section>
  );
}

/** Just the chart area (when the block's title is already on screen). */
export function ChartBodySkeleton({
  kind = "bars",
}: {
  kind?: "bars" | "columns";
}) {
  return kind === "bars" ? (
    <div className={s.bars} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={s.barRow}>
          <Skeleton width={`${60 + ((i * 11) % 30)}%`} height={11} />
          <Skeleton width={`${88 - i * 15}%`} height={10} radius={5} />
        </div>
      ))}
    </div>
  ) : (
    <div className={s.columns} aria-hidden>
      {[46, 62, 38, 80, 54, 70, 44, 90, 58, 66].map((h, i) => (
        <Skeleton key={i} height={`${h}%`} radius={4} />
      ))}
    </div>
  );
}

/** Metrics over a grid of charts — the Insights and Analytics shape. */
export function InsightsSkeleton({ metrics = 4 }: { metrics?: number }) {
  return (
    <div className={s.page} aria-hidden>
      <MetricsSkeleton count={metrics} />
      <div className={c.grid}>
        <ChartSkeleton kind="columns" span={2} />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </div>
  );
}

/** List rows: optional avatar, a title line and a detail line. */
export function ListSkeleton({
  rows = 5,
  avatar = false,
  trailing = false,
}: {
  rows?: number;
  avatar?: boolean;
  /** A short value at the end of each row (a status, an amount). */
  trailing?: boolean;
}) {
  return (
    <ul className={s.list} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={s.row}>
          {avatar && <Skeleton width={32} height={32} radius={16} />}
          <span className={s.rowText}>
            <Skeleton width={w(i)} height={14} style={{ maxWidth: 360 }} />
            <Skeleton width={w(i + 3)} height={11} style={{ maxWidth: 240 }} />
          </span>
          {trailing && <Skeleton width={64} height={20} radius={10} />}
        </li>
      ))}
    </ul>
  );
}

/** A table: header row and body rows. */
export function TableSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  const grid: CSSProperties = {
    gridTemplateColumns: `2fr repeat(${columns - 1}, 1fr)`,
  };
  return (
    <div className={s.table} aria-hidden>
      <div className={s.tableHead} style={grid}>
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} width={i ? "50%" : "30%"} height={11} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={s.tableRow} style={grid}>
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton
              key={i}
              width={i ? `${45 + (((r + i) * 13) % 40)}%` : w(r)}
              height={i ? 12 : 14}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Label/value rows, like KeyValues. */
export function KeyValuesSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <dl className={d.kv} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>
            <Skeleton width={`${40 + ((i * 17) % 35)}%`} height={12} />
          </dt>
          <dd>
            <Skeleton width={w(i)} height={14} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A heading, a meta line and paragraphs — a document. */
export function ArticleSkeleton({ paragraphs = 3 }: { paragraphs?: number }) {
  return (
    <div className={s.article} aria-hidden>
      <Skeleton width={72} height={20} radius={10} />
      <Skeleton width="45%" height={26} />
      <Skeleton width={150} height={12} />
      {Array.from({ length: paragraphs }, (_, i) => (
        <TextSkeleton key={i} lines={i === 0 ? 2 : 3} lastWidth={w(i)} />
      ))}
    </div>
  );
}

/** An identity row: avatar or logo, a name and a detail line. */
export function HeaderSkeleton({
  size = 48,
  square = false,
}: {
  size?: number;
  square?: boolean;
}) {
  return (
    <div className={s.header} aria-hidden>
      <Skeleton
        width={size}
        height={size}
        radius={square ? 12 : size / 2}
        style={{ flex: "none" }}
      />
      <span className={s.rowText}>
        <Skeleton width={180} height={18} />
        <Skeleton width={96} height={20} radius={10} />
      </span>
    </div>
  );
}

/** Checkbox (or switch) rows with labels. */
export function ChecklistSkeleton({
  items = 6,
  columns = 1,
}: {
  items?: number;
  columns?: 1 | 2;
}) {
  return (
    <div className={s.checklist} data-columns={columns} aria-hidden>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className={s.toggle}>
          <Skeleton width={16} height={16} radius={4} />
          <Skeleton width={w(i)} height={12} style={{ maxWidth: 200 }} />
        </div>
      ))}
    </div>
  );
}
