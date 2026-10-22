import { Fragment, useId } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Pagination from "@mui/material/Pagination";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import type { Theme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import EmptyState from "./EmptyState";

// Gradient border — same as the dashboard right panel.
// Fill is painted on the padding-box, the gradient shows through the transparent 1px border.
const BORDER_GRADIENT =
  "linear-gradient(87.1deg, rgba(60,118,255,0.2) 2.38%, rgba(173,38,236,0.2) 27.97%, rgba(255,9,147,0.2) 45.03%, rgba(253,29,29,0.2) 61.64%, rgba(255,187,0,0.2) 91.27%)";

const gradientBorderSx = {
  border: "1px solid transparent",
  background: (t: Theme) =>
    `linear-gradient(${t.palette.background.paper}, ${t.palette.background.paper}) padding-box, ${BORDER_GRADIENT} border-box`,
} as const;

export interface DataListSelection<T> {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Rows failing this predicate render without a checkbox and are excluded from "select all". */
  isRowSelectable?: (row: T) => boolean;
}

export interface DataListColumn<T> {
  key: string;
  label: string;
  /** Renders as the card's bold title line. Defaults to the first column. */
  primary?: boolean;
  render?: (row: T) => ReactNode;
  /** Suppress the "Label:" prefix — used for the primary column and badge/chip cells. */
  hideLabel?: boolean;
}

export interface DataListAction<T> {
  icon: ReactNode;
  label: string;
  onClick: (row: T, event?: MouseEvent<HTMLButtonElement>) => void;
  color?:
    | "default"
    | "primary"
    | "secondary"
    | "info"
    | "success"
    | "warning"
    | "error";
  show?: (row: T) => boolean;
}

export interface DataListPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

interface DataListProps<T> {
  data: T[];
  columns: DataListColumn<T>[];
  getRowId?: (row: T) => string;
  loading?: boolean;
  variant?: "cards" | "rows";
  /** Alternate row background shading. Rows variant only. */
  striped?: boolean;
  actions?: (row: T) => DataListAction<T>[];
  /** Row-select checkboxes for bulk actions. Requires `getRowId`. */
  selection?: DataListSelection<T>;
  /** Makes the whole card clickable (e.g. navigate to a detail page). Cards variant only. */
  onRowClick?: (row: T) => void;
  pagination?: DataListPagination;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  toolbarActions?: ReactNode;
  emptyMessage?: string;
  emptyIcon?: ReactElement;
  ariaLabel: string;
}

/** Small "Label: value" pair — the building block for every non-primary field. */
function MetaItem({
  label,
  value,
  hideLabel,
}: {
  label: string;
  value: ReactNode;
  hideLabel?: boolean;
}) {
  if (hideLabel) return <>{value}</>;
  return (
    <Box sx={{ display: "flex", gap: 0.625, alignItems: "baseline" }}>
      <Typography
        variant="caption"
        sx={{
          flexShrink: 0,
          color: "text.secondary",
          fontWeight: 500,
          letterSpacing: 0.1,
        }}
      >
        {label}:
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "text.primary", fontWeight: 600 }}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}

function ActionsRow<T>({
  row,
  actions,
}: {
  row: T;
  actions: DataListAction<T>[];
}) {
  const visible = actions.filter((a) => !a.show || a.show(row));
  if (visible.length === 0) return null;
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
      {visible.map((action) => (
        <Tooltip key={action.label} title={action.label}>
          <IconButton
            size="small"
            color={action.color === "default" ? undefined : action.color}
            aria-label={action.label}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick(row, e);
            }}
          >
            {action.icon}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}

function CardRow<T>({
  row,
  columns,
  actions,
  onRowClick,
  checkbox,
}: {
  row: T;
  columns: DataListColumn<T>[];
  actions?: DataListAction<T>[];
  onRowClick?: (row: T) => void;
  checkbox?: ReactNode;
}) {
  const primaryCol = columns.find((c) => c.primary) ?? columns[0];
  const restCols = columns.filter((c) => c !== primaryCol);

  return (
    <Box
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      role={onRowClick ? "button" : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(row);
              }
            }
          : undefined
      }
      sx={{
        // gradient border + paper fill
        ...gradientBorderSx,
        borderRadius: 1.5,
        boxShadow: (t) =>
          t.palette.mode === "light"
            ? "0 1px 2px rgba(15, 23, 42, 0.04)"
            : "0 1px 3px rgba(0, 0, 0, 0.35)",
        px: 2,
        py: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        cursor: onRowClick ? "pointer" : "default",
        "&:hover": {
          // clickable cards show a solid primary border on hover
          borderColor: onRowClick ? "primary.main" : "transparent",
          boxShadow: (t) =>
            t.palette.mode === "light"
              ? "0 4px 14px rgba(15, 23, 42, 0.08)"
              : "0 4px 14px rgba(0, 0, 0, 0.45)",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        {checkbox}
        <Box
          sx={{ minWidth: 0, flex: 1, color: "text.primary", fontWeight: 600 }}
        >
          {primaryCol.render
            ? primaryCol.render(row)
            : (row as any)[primaryCol.key]}
        </Box>
        {actions && <ActionsRow row={row} actions={actions} />}
      </Box>
      {restCols.length > 0 && (
        <Box
          sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5 }}
        >
          {restCols.map((col) => (
            <MetaItem
              key={col.key}
              label={col.label}
              hideLabel={col.hideLabel}
              value={col.render ? col.render(row) : (row as any)[col.key]}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function TableRowLike<T>({
  row,
  columns,
  actions,
  alt,
  checkbox,
}: {
  row: T;
  columns: DataListColumn<T>[];
  actions?: DataListAction<T>[];
  alt?: boolean;
  checkbox?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.5,
        py: 1.1,
        px: 2,
        bgcolor: alt ? "action.hover" : undefined,
        transition: "background-color 0.15s ease",
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        {checkbox}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            columnGap: 2.5,
            rowGap: 0.5,
            flex: 1,
            minWidth: 0,
          }}
        >
          {columns.map((col) => (
            <MetaItem
              key={col.key}
              label={col.label}
              hideLabel={col.hideLabel}
              value={col.render ? col.render(row) : (row as any)[col.key]}
            />
          ))}
        </Box>
      </Box>
      {actions && <ActionsRow row={row} actions={actions} />}
    </Box>
  );
}

function SkeletonRows({
  variant,
  count = 3,
}: {
  variant: "cards" | "rows";
  count?: number;
}) {
  return (
    <>
      {[...Array(count)].map((_, i) =>
        variant === "cards" ? (
          <Box
            key={i}
            sx={{
              ...gradientBorderSx,
              borderRadius: 1.5,
              px: 2,
              py: 1.5,
            }}
          >
            <Skeleton width="40%" height={22} />
            <Skeleton width="70%" height={16} sx={{ mt: 1 }} />
          </Box>
        ) : (
          <Box key={i} sx={{ py: 1.1, px: 2 }}>
            <Skeleton width="60%" height={18} />
          </Box>
        ),
      )}
    </>
  );
}

/**
 * Mobile-first replacement for MaterialReactTable / plain MUI <Table>. Renders
 * rows as full-width cards ("cards") or lightweight divided rows ("rows")
 * instead of a fixed-width <table>, so it uses the full row width on desktop
 * and reflows instead of horizontally scrolling on narrow screens.
 */
function DataList<T>({
  data,
  columns,
  getRowId,
  loading = false,
  variant = "cards",
  striped = false,
  actions,
  onRowClick,
  pagination,
  search,
  toolbarActions,
  selection,
  emptyMessage = "No records found",
  emptyIcon,
  ariaLabel,
}: DataListProps<T>) {
  const headingId = useId();
  const hasToolbar = !!search || !!toolbarActions || !!selection;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize))
    : 1;

  const selectedSet = selection ? new Set(selection.selectedIds) : null;
  const selectableRows = selection
    ? data.filter(
        (row) => !selection.isRowSelectable || selection.isRowSelectable(row),
      )
    : [];
  const selectableIds = selection
    ? selectableRows.map((row) => (getRowId ? getRowId(row) : ""))
    : [];
  const allSelected =
    selectableIds.length > 0 &&
    selectableIds.every((id) => selectedSet!.has(id));
  const someSelected =
    !allSelected && selectableIds.some((id) => selectedSet!.has(id));

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = selectedSet!.has(id)
      ? selection.selectedIds.filter((sid) => sid !== id)
      : [...selection.selectedIds, id];
    selection.onChange(next);
  };

  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) {
      const selectableSet = new Set(selectableIds);
      selection.onChange(
        selection.selectedIds.filter((id) => !selectableSet.has(id)),
      );
    } else {
      selection.onChange(
        Array.from(new Set([...selection.selectedIds, ...selectableIds])),
      );
    }
  };

  const rows = data.map((row, i) => {
    const rowKey = getRowId ? getRowId(row) : i;
    const rowActions = actions?.(row);
    const rowSelectable =
      !selection ||
      !selection.isRowSelectable ||
      selection.isRowSelectable(row);
    const checkbox =
      selection && rowSelectable ? (
        <Checkbox
          size="small"
          checked={selectedSet!.has(String(rowKey))}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleRow(String(rowKey))}
          inputProps={{ "aria-label": "Select row" }}
          sx={{ p: 0.5, mr: 0.5, flexShrink: 0 }}
        />
      ) : undefined;
    return (
      <Fragment key={rowKey}>
        {variant === "cards" ? (
          <CardRow
            row={row}
            columns={columns}
            actions={rowActions}
            onRowClick={onRowClick}
            checkbox={checkbox}
          />
        ) : (
          <>
            {i > 0 && <Divider />}
            <TableRowLike
              row={row}
              columns={columns}
              actions={rowActions}
              alt={striped && i % 2 === 1}
              checkbox={checkbox}
            />
          </>
        )}
      </Fragment>
    );
  });

  const body = loading ? (
    <SkeletonRows variant={variant} />
  ) : data.length === 0 ? (
    <EmptyState
      message={emptyMessage}
      icon={emptyIcon}
      sx={variant === "rows" ? { border: "none", borderRadius: 0 } : undefined}
    />
  ) : (
    rows
  );

  return (
    <Box
      role="region"
      aria-labelledby={headingId}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        height: "100%",
      }}
    >
      <Typography id={headingId} sx={{ position: "absolute", left: -9999 }}>
        {ariaLabel}
      </Typography>

      {hasToolbar && (
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          {selection && data.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                flexShrink: 0,
              }}
            >
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected}
                disabled={selectableIds.length === 0}
                onChange={toggleAll}
                inputProps={{ "aria-label": "Select all on this page" }}
                sx={{ p: 0.5 }}
              />
              <Typography variant="body2" color="text.secondary">
                {selection.selectedIds.length > 0
                  ? `${selection.selectedIds.length} selected`
                  : "Select all"}
              </Typography>
            </Box>
          )}
          {search && (
            <Box sx={{ width: { xs: "100%", sm: 260 }, flexShrink: 0 }}>
              <TextField
                size="small"
                fullWidth
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Search…"}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
          )}
          {toolbarActions && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 1.5,
                ml: "auto",
              }}
            >
              {toolbarActions}
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {variant === "cards" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {body}
          </Box>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              ...gradientBorderSx,
              borderRadius: 1.5,
              boxShadow: (t) =>
                t.palette.mode === "light"
                  ? "0 1px 2px rgba(15, 23, 42, 0.04)"
                  : "0 1px 3px rgba(0, 0, 0, 0.35)",
              overflow: "hidden",
            }}
          >
            {body}
          </Paper>
        )}
      </Box>

      {pagination && data.length > 0 && (
        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            mt: 1,
          }}
        >
          <Pagination
            color="primary"
            shape="rounded"
            page={pagination.page + 1}
            count={totalPages}
            onChange={(_, page) => pagination.onPageChange(page - 1)}
          />
          {pagination.onPageSizeChange && (
            <Select
              size="small"
              value={pagination.pageSize}
              onChange={(e) =>
                pagination.onPageSizeChange!(Number(e.target.value))
              }
              sx={{ minWidth: 90 }}
            >
              {(pagination.pageSizeOptions ?? [10, 25, 50]).map((size) => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>
      )}
    </Box>
  );
}

export default DataList;
