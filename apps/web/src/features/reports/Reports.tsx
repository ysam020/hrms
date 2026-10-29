import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  IconButton,
  Page,
  Pagination,
  PrimaryCell,
  Section,
  Select,
  Sheet,
  Skeleton,
  Tag,
  TextArea,
  TextInput,
  inlineCheckClass,
  layout,
  type Column,
  ChecklistSkeleton,
  FormSkeleton,
  TableSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { fmtDate, fromNow, plural } from "@next/lib/format";
import { usePagedList } from "@next/lib/usePagedList";
import s from "./reports.module.css";

// Report Builder and Saved Reports (Classic's ReportBuilder/SavedReports).
// The config shape {entity, columns, filters, sort, limit} and the run/CSV/save
// endpoints are Classic's. Saved reports gain an in-app result view; Classic
// only toasted the row count.

const ENTITIES = [
  "employee",
  "attendance",
  "leave",
  "salary",
  "recruitment",
  "payroll",
];
const OPERATORS: Record<string, string> = {
  eq: "is",
  ne: "is not",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  in: "is one of",
  contains: "contains",
};
interface Filter {
  field: string;
  operator: string;
  value: string;
}
type Row = Record<string, unknown>;

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** camelCase / snake_case field ids → "Title Case" labels. */
const fieldLabel = (f: string) =>
  f
    .replace(/[._]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const cell = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

async function downloadCsv(url: string, body: object, name: string) {
  const res = await apiClient.post(url, body, { responseType: "blob" });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(href);
}

function ResultTable({ rows, label }: { rows: Row[]; label: string }) {
  const keys = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const columns: Column<Row & { __i: number }>[] = keys.map((k, i) => ({
    key: k,
    header: fieldLabel(k),
    priority: i === 0 ? "primary" : i < 4 ? "secondary" : "hidden",
    stackLabel: fieldLabel(k),
    render: (r) => (
      <span className={typeof r[k] === "number" ? "px-num" : undefined}>
        {cell(r[k])}
      </span>
    ),
  }));
  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows.map((r, i) => ({ ...r, __i: i }))}
      rowId={(r) => String(r.__i)}
      empty={{
        icon: "doc",
        title: "No matching rows",
        body: "Loosen the filters and run again.",
      }}
    />
  );
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function ReportBuilderPage() {
  const { setAlert } = useContext(AlertContext);
  const [entity, setEntity] = useState("employee");
  const [schema, setSchema] = useState<{
    selectableFields: string[];
    filterableFields: string[];
  } | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sort, setSort] = useState({
    field: "",
    direction: "desc" as "asc" | "desc",
  });
  const [limit, setLimit] = useState(100);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSchema(null);
    setFilters([]);
    setRows(null);
    apiClient
      .get(API_ENDPOINTS.ENTITY_SCHEMA(entity))
      .then((res) => {
        const next = res.data.data;
        setSchema(next);
        setColumns(next.selectableFields.slice(0, 5));
      })
      .catch((err) => {
        setSchema({ selectableFields: [], filterableFields: [] });
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
      });
  }, [entity, setAlert]);

  const config = () => ({
    entity,
    columns,
    filters: filters.filter((f) => f.value.trim()),
    sort: sort.field ? sort : undefined,
    limit,
  });
  const run = async () => {
    setRunning(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.RUN_REPORT, config());
      setRows(res.data.data?.rows ?? []);
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setRunning(false);
    }
  };
  const csv = () =>
    downloadCsv(
      API_ENDPOINTS.RUN_REPORT,
      { ...config(), format: "csv" },
      `${entity}_report`,
    ).catch(() =>
      setAlert({
        open: true,
        message: "The CSV couldn’t be downloaded. Try again.",
        severity: "error",
      }),
    );
  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.SAVE_REPORT, {
        ...saveForm,
        entity,
        config: config(),
      });
      setSaveOpen(false);
      setSaveForm({ name: "", description: "" });
      setAlert({ open: true, message: "Report saved.", severity: "success" });
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  const setFilter = (i: number, patch: Partial<Filter>) =>
    setFilters((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const toggle = (c: string) =>
    setColumns((cs) =>
      cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c],
    );
  const empty = columns.length === 0;

  return (
    <Page
      title="Report Builder"
      width="wide"
      actions={
        <>
          <Button icon="download" disabled={empty} onClick={csv}>
            CSV
          </Button>
          <Button icon="pin" disabled={empty} onClick={() => setSaveOpen(true)}>
            Save
          </Button>
          <Button
            variant="primary"
            icon="play"
            busy={running}
            disabled={empty}
            onClick={run}
          >
            Run
          </Button>
        </>
      }
    >
      <div className={s.builder}>
        <aside
          className={`${layout.rail} ${s.options}`}
          aria-label="Report options"
        >
          <Field label="Data">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {title(e)}
                </option>
              ))}
            </Select>
          </Field>
          {!schema ? (
            <div style={{ display: "grid", gap: 24 }}>
              <ChecklistSkeleton items={8} />
              <FormSkeleton fields={2} columns={2} />
            </div>
          ) : (
            <>
              <fieldset className={s.group}>
                <legend className={`px-headline ${s.legend}`}>
                  Columns{" "}
                  <span className="px-meta">
                    {columns.length} of {schema.selectableFields.length}
                  </span>
                </legend>
                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {schema.selectableFields.map((f) => (
                    <label key={f} className={inlineCheckClass}>
                      <Checkbox
                        checked={columns.includes(f)}
                        onChange={() => toggle(f)}
                      />
                      {fieldLabel(f)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className={s.group}>
                <legend className={`px-headline ${s.legend}`}>Filters</legend>
                {filters.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gap: 6,
                      gridTemplateColumns: "1fr 1fr auto",
                      alignItems: "center",
                    }}
                  >
                    <Select
                      aria-label="Field"
                      value={f.field}
                      onChange={(e) => setFilter(i, { field: e.target.value })}
                    >
                      {schema.filterableFields.map((x) => (
                        <option key={x} value={x}>
                          {fieldLabel(x)}
                        </option>
                      ))}
                    </Select>
                    <Select
                      aria-label="Condition"
                      value={f.operator}
                      onChange={(e) =>
                        setFilter(i, { operator: e.target.value })
                      }
                    >
                      {Object.entries(OPERATORS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    <IconButton
                      icon="x"
                      label="Remove filter"
                      onClick={() =>
                        setFilters((fs) => fs.filter((_, j) => j !== i))
                      }
                    />
                    <TextInput
                      aria-label="Value"
                      value={f.value}
                      onChange={(e) => setFilter(i, { value: e.target.value })}
                      placeholder={f.operator === "in" ? "a, b, c" : "Value"}
                      style={{ gridColumn: "1 / 3" }}
                    />
                  </div>
                ))}
                <span>
                  <Button
                    size="small"
                    icon="plus"
                    disabled={!schema.filterableFields[0]}
                    onClick={() =>
                      setFilters((fs) => [
                        ...fs,
                        {
                          field: schema.filterableFields[0],
                          operator: "eq",
                          value: "",
                        },
                      ])
                    }
                  >
                    Add Filter
                  </Button>
                </span>
              </fieldset>
              <FormGrid columns={2}>
                <Field label="Sort By">
                  <Select
                    value={sort.field}
                    onChange={(e) =>
                      setSort((cur) => ({ ...cur, field: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {schema.selectableFields.map((x) => (
                      <option key={x} value={x}>
                        {fieldLabel(x)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Order">
                  <Select
                    value={sort.direction}
                    disabled={!sort.field}
                    onChange={(e) =>
                      setSort((cur) => ({
                        ...cur,
                        direction: e.target.value as "asc" | "desc",
                      }))
                    }
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </Select>
                </Field>
                <Field label="Row Limit">
                  <TextInput
                    type="number"
                    min={1}
                    max={10000}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value) || 100)}
                  />
                </Field>
              </FormGrid>
            </>
          )}
        </aside>
        <div className={`${layout.stack} ${s.results}`}>
          {rows === null ? (
            <p className="px-tertiary px-callout">
              Choose what to include on the left, then Run. Results appear here.
            </p>
          ) : (
            <Section title="Results" detail={plural(rows.length, "row")}>
              <ResultTable rows={rows} label={`${title(entity)} report`} />
            </Section>
          )}
        </div>
      </div>
      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        busy={saving}
        title="Save Report"
        description="Saved reports can be re-run any time with fresh data."
        footer={
          <>
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              busy={saving}
              disabled={!saveForm.name.trim()}
              onClick={save}
            >
              Save
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Name">
            <TextInput
              data-autofocus
              value={saveForm.name}
              onChange={(e) =>
                setSaveForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </Field>
          <Field label="Description" optional>
            <TextArea
              rows={2}
              value={saveForm.description}
              onChange={(e) =>
                setSaveForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}

// ── Saved ───────────────────────────────────────────────────────────────────

interface SavedReport {
  id: string;
  name: string;
  entity: string;
  description?: string | null;
  lastRunAt?: string | null;
  createdAt: string;
}

export function SavedReportsPage() {
  const { setAlert } = useContext(AlertContext);
  const navigate = useNavigate();
  const list = usePagedList((p, l) => API_ENDPOINTS.SAVED_REPORTS(p, l), {
    pageSize: 10,
  });
  const [result, setResult] = useState<{
    report: SavedReport;
    rows: Row[] | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const run = async (report: SavedReport) => {
    setResult({ report, rows: null });
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.RUN_SAVED_REPORT(report.id),
      );
      setResult({ report, rows: res.data.data?.rows ?? [] });
      list.refresh();
    } catch (err) {
      setResult(null);
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };
  const csv = (r: SavedReport) =>
    downloadCsv(
      `${API_ENDPOINTS.RUN_SAVED_REPORT(r.id)}?format=csv`,
      {},
      r.name,
    ).catch(() =>
      setAlert({
        open: true,
        message: "The CSV couldn’t be downloaded. Try again.",
        severity: "error",
      }),
    );
  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.DELETE_SAVED_REPORT(deleteTarget.id),
      );
      setAlert({ open: true, message: "Report deleted.", severity: "success" });
      setDeleteTarget(null);
      list.refresh();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<SavedReport>[] = [
    {
      key: "name",
      header: "Report",
      priority: "primary",
      render: (r) => (
        <PrimaryCell title={r.name} subtitle={r.description ?? undefined} />
      ),
    },
    {
      key: "entity",
      header: "Data",
      priority: "secondary",
      render: (r) => <Tag>{title(r.entity)}</Tag>,
    },
    {
      key: "last",
      header: "Last Run",
      priority: "secondary",
      stackLabel: "Last run",
      render: (r) => (r.lastRunAt ? fromNow(r.lastRunAt) : "Never"),
    },
    {
      key: "created",
      header: "Created",
      priority: "hidden",
      render: (r) => fmtDate(r.createdAt),
    },
    {
      key: "act",
      header: <span className="px-sr-only">Actions</span>,
      align: "right",
      priority: "trailing",
      render: (r) => (
        <span
          className="px-row"
          style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 2 }}
        >
          <IconButton
            icon="play"
            label={`Run ${r.name}`}
            onClick={() => run(r)}
          />
          <IconButton
            icon="download"
            label={`Download ${r.name} as CSV`}
            onClick={() => csv(r)}
          />
          <IconButton
            icon="trash"
            label={`Delete ${r.name}`}
            onClick={() => setDeleteTarget(r)}
          />
        </span>
      ),
    },
  ];

  return (
    <Page
      title="Saved Reports"
      actions={
        <Button
          variant="primary"
          icon="plus"
          onClick={() =>
            navigate("/reports/report-builder", { viewTransition: true })
          }
        >
          New Report
        </Button>
      }
    >
      <DataTable
        label="Saved reports"
        columns={columns}
        rows={list.data as SavedReport[]}
        rowId={(r) => r.id}
        loading={list.loading}
        empty={{
          icon: "doc",
          title: "No saved reports",
          body: "Build a report and save it to run it again later.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <Sheet
        open={result !== null}
        onClose={() => setResult(null)}
        title={result?.report.name}
        width={720}
      >
        {result?.rows == null ? (
          <TableSkeleton rows={8} columns={5} />
        ) : (
          <ResultTable rows={result.rows} label={result.report.name} />
        )}
      </Sheet>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        busy={deleting}
        title={`Delete “${deleteTarget?.name}”?`}
        description="The report definition is removed. Data isn’t affected."
        confirmLabel="Delete"
      />
    </Page>
  );
}
