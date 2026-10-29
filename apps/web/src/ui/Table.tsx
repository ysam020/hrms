import { type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Presence } from "@next/motion";
import { Checkbox, IconButton } from "./controls";
import { EmptyState, ErrorState, Skeleton } from "./display";
import type { IconName } from "./Icon";
import s from "./Table.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "right";
  width?: number | string;
  /**
   * How the cell behaves when the container is narrow:
   * primary → first line, trailing → right of first line,
   * secondary → small second line, hidden → dropped.
   */
  priority?: "primary" | "trailing" | "secondary" | "hidden";
  /** Short label shown before secondary values in the stacked layout. */
  stackLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowId: (row: T) => string;
  label: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  /** Bulk selection */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  bulkActions?: ReactNode;
  empty?: {
    icon?: IconName;
    title: string;
    body?: ReactNode;
    action?: ReactNode;
  };
  footer?: ReactNode;
  stickyOffset?: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowId,
  label,
  loading,
  error,
  onRetry,
  onRowClick,
  selectedId,
  selected,
  onSelectedChange,
  bulkActions,
  empty,
  footer,
  stickyOffset = 0,
}: DataTableProps<T>) {
  const selectable = Boolean(selected && onSelectedChange);
  const allIds = rows.map(rowId);
  const allChecked =
    selectable && allIds.length > 0 && allIds.every((id) => selected!.has(id));
  const someChecked = selectable && allIds.some((id) => selected!.has(id));

  const toggle = (id: string) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleAll = () => {
    if (!onSelectedChange) return;
    onSelectedChange(allChecked ? new Set() : new Set(allIds));
  };

  if (error && !loading)
    return <ErrorState message={error} onRetry={onRetry} />;

  const showSkeleton = loading && rows.length === 0;
  if (!showSkeleton && rows.length === 0 && empty) {
    return (
      <EmptyState icon={empty.icon} title={empty.title} action={empty.action}>
        {empty.body}
      </EmptyState>
    );
  }

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <div
      className={s.wrap}
      style={{ "--_sticky": `${stickyOffset}px` } as CSSProperties}
    >
      <table
        className={s.table}
        aria-label={label}
        aria-busy={loading || undefined}
      >
        <thead>
          <tr>
            {selectable && (
              <th className={s.check}>
                <Checkbox
                  aria-label="Select all"
                  checked={allChecked}
                  indeterminate={!allChecked && someChecked}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.align === "right" ? s.right : undefined}
                style={{ width: c.width }}
                scope="col"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className={s.row}>
                  {selectable && <td className={s.check} />}
                  {columns.map((c, j) => (
                    <td
                      key={c.key}
                      data-priority={
                        c.priority ?? (j === 0 ? "primary" : "secondary")
                      }
                    >
                      <Skeleton width={j === 0 ? "60%" : "40%"} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const id = rowId(row);
                const interactive = Boolean(onRowClick);
                return (
                  <tr
                    key={id}
                    className={s.row}
                    data-interactive={interactive || undefined}
                    aria-selected={selectedId ? selectedId === id : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onClick={interactive ? () => onRowClick!(row) : undefined}
                    onKeyDown={interactive ? (e) => onKey(e, row) : undefined}
                  >
                    {selectable && (
                      <td
                        className={s.check}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label="Select row"
                          checked={selected!.has(id)}
                          onChange={() => toggle(id)}
                        />
                      </td>
                    )}
                    {columns.map((c, j) => (
                      <td
                        key={c.key}
                        className={c.align === "right" ? s.right : undefined}
                        data-priority={
                          c.priority ?? (j === 0 ? "primary" : "secondary")
                        }
                        data-label={c.stackLabel}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {footer}
      <Presence
        show={Boolean(selectable && selected!.size > 0 && bulkActions)}
        variant="rise"
        className={s.bulkBar}
        elementProps={{ role: "toolbar", "aria-label": "Bulk actions" }}
      >
        <span className="px-num">{selected?.size} selected</span>
        {bulkActions}
        <IconButton
          icon="x"
          label="Clear selection"
          onClick={() => onSelectedChange?.(new Set())}
        />
      </Presence>
    </div>
  );
}

/** Identity cell: avatar/leading visual + title + subtitle. */
export function PrimaryCell({
  leading,
  title,
  subtitle,
  style,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={s.primaryCell}
      style={style}
      data-leading={leading ? "" : undefined}
    >
      {leading}
      <div className={s.primaryText}>
        <span>{title}</span>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total <= pageSize && page === 1) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className={s.footer} aria-label="Pagination">
      <span className="px-num">
        {from}–{to} of {total}
      </span>
      <div className={s.pager}>
        <IconButton
          icon="chevronLeft"
          label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        />
        <IconButton
          icon="chevronRight"
          label="Next page"
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        />
      </div>
    </nav>
  );
}
