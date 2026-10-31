import dayjs from "dayjs";
import { useState } from "react";
import { entityOptions } from "@web/assets/data/entityOptions";
import { timePresets } from "@web/assets/data/timePresets";
import { getDeviceInfo } from "@web/shared/utils/getDeviceInfo";
import {
  StatusBadge,
  StatTiles,
  StatTile,
  Icon,
  Button,
  Avatar,
  DataTable,
  ErrorState,
  Inspector,
  KeyValues,
  Page,
  PrimaryCell,
  SearchField,
  Section,
  Select,
  Tag,
  UserCombobox,
  type Column,
  type IconName,
  type Tone,
} from "@next/ui";
import { asList } from "@next/lib/api";
import { useGet } from "@next/lib/hooks";
import { fmtDateTime, fromNow } from "@next/lib/format";
import s from "./audit.module.css";

// Audit Log (Classic's layout/AuditLogs drawer, now a page). Same endpoint,
// filters (days, entityType, userName), presets and device parsing. Changes
// are shown field by field instead of as raw JSON.

interface Entry {
  _id: string;
  action?: string;
  entityType?: string;
  username?: string | null;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  oldValue?: unknown;
  newValue?: unknown;
}

const ENTITY = Object.fromEntries(
  entityOptions.filter((o) => o.value).map((o) => [o.value, o.label]),
);

/** "SavedReport" → "Saved Report" for areas missing from entityOptions. */
const splitWords = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._]/g, " ");
/** Product names for models whose code names mean nothing to people. */
const MODEL_NAMES: Record<string, string> = {
  McpConnection: "AI Assistant Connection",
};
const areaLabel = (entity: string) =>
  ENTITY[entity] ?? MODEL_NAMES[entity] ?? splitWords(entity);

const VERB: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
};
/**
 * The gateway writes generic events as "<ACTION> <Model>" (e.g. "CREATE
 * SavedReport"). Show those as a sentence; hand-written descriptions pass
 * through untouched. The original text stays in the details and search.
 */
function readable(e: Entry): string {
  const m = /^(CREATE|UPDATE|DELETE)\s+([A-Za-z]+)$/.exec(e.description ?? "");
  if (!m) return e.description;
  const model = MODEL_NAMES[m[2]] ?? splitWords(m[2]);
  return `${VERB[m[1]]} ${model.toLowerCase()}`;
}

type ActionMeta = { label: string; icon: IconName; tone: Tone };
const ACTION_META: Record<string, ActionMeta> = {
  CREATE: { label: "Created", icon: "plus", tone: "success" },
  UPDATE: { label: "Updated", icon: "edit", tone: "accent" },
  DELETE: { label: "Deleted", icon: "trash", tone: "danger" },
  READ: { label: "Read", icon: "search", tone: "neutral" },
};
/** The event's action, from the field or the generic "<ACTION> <Model>" text. */
const actionOf = (e: Entry): ActionMeta => {
  const a = (
    e.action ||
    /^(CREATE|UPDATE|DELETE|READ)\b/.exec(e.description ?? "")?.[1] ||
    ""
  ).toUpperCase();
  return (
    ACTION_META[a] ?? {
      label: a ? a[0] + a.slice(1).toLowerCase() : "Event",
      icon: "info",
      tone: "neutral",
    }
  );
};

function ActionIcon({ e, size = 30 }: { e: Entry; size?: number }) {
  const m = actionOf(e);
  return (
    <span
      className={s.actionIcon}
      data-tone={m.tone}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={m.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
/** A field value, formatted by type; nested data as indented JSON. */
function Value({ v }: { v: unknown }) {
  if (v == null || v === "")
    return <span className="px-tertiary">Not set</span>;
  if (v === "[REDACTED]")
    return (
      <span
        className={s.redacted}
        title="Hidden: this is a credential or secret"
      >
        <Icon name="lock" size={12} />
        Hidden
      </span>
    );
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (Array.isArray(v) && v.length === 0)
    return <span className="px-tertiary">None</span>;
  if (typeof v === "object")
    return <pre className={s.json}>{JSON.stringify(v, null, 2)}</pre>;
  const str = String(v);
  if (OBJECT_ID.test(str)) return <code className={s.mono}>{str}</code>;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str) && !Number.isNaN(Date.parse(str)))
    return <>{fmtDateTime(str)}</>;
  if (str.length > 160) return <LongText text={str} />;
  return <>{str}</>;
}

function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={s.long}>
      {open ? text : `${text.slice(0, 160)}…`}
      <button
        type="button"
        className="px-link-button"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Show less" : "Show all"}
      </button>
    </span>
  );
}

const isStructured = (v: unknown) => v != null && typeof v === "object";
const fieldLabel = (f: string) =>
  f
    .replace(/[._]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** Field-by-field before/after, changed fields first. */
function Changes({ before, after }: { before: unknown; after: unknown }) {
  const b = asRecord(before);
  const a = asRecord(after);
  if (!b && !a) return null;
  if ((before != null && !b) || (after != null && !a))
    return (
      <pre className={s.raw}>{JSON.stringify({ before, after }, null, 2)}</pre>
    );
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  const rows = keys
    .map((k) => ({
      k,
      from: b?.[k],
      to: a?.[k],
      changed:
        Boolean(b && a) && JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]),
    }))
    .sort((x, y) => Number(y.changed) - Number(x.changed));
  return (
    <table className={s.diff}>
      <thead>
        <tr>
          <th scope="col">Field</th>
          {b && <th scope="col">Before</th>}
          {a && <th scope="col">{b ? "After" : "Value"}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          // Nested data gets the full width, before over after, instead of
          // two thin columns of wrapped JSON.
          b && a && (isStructured(r.from) || isStructured(r.to)) ? (
            <tr key={r.k} data-changed={r.changed || undefined}>
              <th scope="row">{fieldLabel(r.k)}</th>
              <td colSpan={2}>
                <div className={s.stacked}>
                  <span className="px-meta">Before</span>
                  <Value v={r.from} />
                  <span className="px-meta">After</span>
                  <div className={s.to}>
                    <Value v={r.to} />
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            <tr key={r.k} data-changed={r.changed || undefined}>
              <th scope="row">{fieldLabel(r.k)}</th>
              {b && (
                <td className={s.from}>
                  <Value v={r.from} />
                </td>
              )}
              {a && (
                <td className={s.to}>
                  <Value v={r.to} />
                </td>
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export default function AuditLog() {
  const [days, setDays] = useState(7);
  const [entity, setEntity] = useState("");
  const [person, setPerson] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);

  const params = new URLSearchParams({ days: String(days) });
  if (entity) params.set("entityType", entity);
  if (person) params.set("userName", person);
  const { data, loading, error, refetch } = useGet<Entry[]>(
    `/audit-logs?${params}`,
  );

  const q = query.trim().toLowerCase();
  const rows = asList(data).filter(
    (e: Entry) =>
      !q ||
      e.description?.toLowerCase().includes(q) ||
      readable(e).toLowerCase().includes(q) ||
      e.username?.toLowerCase().includes(q) ||
      e.ipAddress?.includes(q),
  );

  const columns: Column<Entry>[] = [
    {
      key: "what",
      header: "Activity",
      priority: "primary",
      width: "38%",
      render: (e) => (
        <PrimaryCell
          leading={<ActionIcon e={e} />}
          title={<span title={e.description}>{readable(e)}</span>}
          subtitle={actionOf(e).label}
        />
      ),
    },
    {
      key: "area",
      header: "Area",
      priority: "secondary",
      render: (e) =>
        e.entityType ? (
          <Tag>{areaLabel(e.entityType)}</Tag>
        ) : (
          <span className="px-tertiary">—</span>
        ),
    },
    {
      key: "by",
      header: "By",
      priority: "secondary",
      stackLabel: "By",
      render: (e) =>
        e.username ? (
          <span className={s.actor}>
            <Avatar name={e.username} size={22} />
            <span className="px-truncate">{e.username}</span>
          </span>
        ) : (
          <span className={s.actor}>
            <span className={s.system} aria-hidden>
              <Icon name="gear" size={12} />
            </span>
            <span className="px-secondary">System</span>
          </span>
        ),
    },
    {
      key: "when",
      header: "When",
      priority: "trailing",
      width: 150,
      render: (e) => (
        <time
          dateTime={e.timestamp}
          title={fmtDateTime(e.timestamp)}
          className={s.when}
        >
          <span className="px-num">{dayjs(e.timestamp).format("h:mm A")}</span>
          <span className="px-meta">
            {dayjs(e.timestamp).format("D MMM")} · {fromNow(e.timestamp)}
          </span>
        </time>
      ),
    },
    {
      key: "ip",
      header: "IP Address",
      priority: "hidden",
      width: 130,
      render: (e) =>
        e.ipAddress ? (
          <code className={`${s.mono} px-truncate`} title={e.ipAddress}>
            {e.ipAddress}
          </code>
        ) : (
          <span className="px-tertiary">—</span>
        ),
    },
  ];
  const all = asList<Entry>(data);
  const filtering = Boolean(q || person || entity);
  const counts = { CREATE: 0, UPDATE: 0, DELETE: 0 } as Record<string, number>;
  for (const r of rows) {
    const k = actionOf(r).label;
    if (k === "Created") counts.CREATE++;
    else if (k === "Updated") counts.UPDATE++;
    else if (k === "Deleted") counts.DELETE++;
  }
  const clearFilters = () => {
    setQuery("");
    setPerson("");
    setEntity("");
  };

  return (
    <Page
      title="Audit Log"
      width="wide"
      description="Who changed what, and when. Select an entry to see the fields that changed."
      tabs={
        <div className={s.filters}>
          <Select
            aria-label="Time range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {timePresets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Area"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            {entityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value ? o.label : "All Areas"}
              </option>
            ))}
          </Select>
          <UserCombobox
            label="Person"
            placeholder="Everyone"
            valueKey="username"
            value={person}
            onChange={(username) => setPerson(username)}
          />
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            label="Search activity"
          />
        </div>
      }
      inspector={
        <Inspector
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Activity"
          id={selected?._id}
          resizeKey="audit"
        >
          {selected && (
            <div className={s.detail}>
              <header className={s.detailHead}>
                <ActionIcon e={selected} size={40} />
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <p className={s.detailTitle}>{readable(selected)}</p>
                  <p className="px-meta">
                    {selected.username || "System"} ·{" "}
                    {fmtDateTime(selected.timestamp)}
                  </p>
                </div>
              </header>
              {(selected.oldValue != null || selected.newValue != null) && (
                <Section
                  title={
                    selected.oldValue != null && selected.newValue != null
                      ? "Changes"
                      : selected.newValue != null
                        ? "Values"
                        : "Removed Values"
                  }
                  detail={
                    selected.oldValue != null && selected.newValue != null
                      ? "Changed fields first"
                      : undefined
                  }
                  headingLevel={3}
                >
                  <Changes
                    before={selected.oldValue}
                    after={selected.newValue}
                  />
                </Section>
              )}
              <Section title="Details" headingLevel={3}>
                <KeyValues
                  items={[
                    [
                      "Action",
                      <StatusBadge tone={actionOf(selected).tone}>
                        {actionOf(selected).label}
                      </StatusBadge>,
                    ],
                    [
                      "Area",
                      selected.entityType
                        ? areaLabel(selected.entityType)
                        : null,
                    ],
                    ["By", selected.username || "System"],
                    ["When", fmtDateTime(selected.timestamp)],
                    [
                      "IP Address",
                      selected.ipAddress && (
                        <code className={s.mono}>{selected.ipAddress}</code>
                      ),
                    ],
                    [
                      "Device",
                      selected.userAgent ? getDeviceInfo(selected) : null,
                    ],
                  ]}
                />
              </Section>
              <Section title="Original Event" headingLevel={3}>
                <code className={s.rawLine}>{selected.description}</code>
              </Section>
            </div>
          )}
        </Inspector>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <>
          {!loading && rows.length > 0 && (
            <StatTiles label="Events in view" min={150}>
              <StatTile label="Events" icon="shield" value={rows.length} />
              <StatTile
                label="Created"
                icon="plus"
                tone="success"
                value={counts.CREATE}
              />
              <StatTile
                label="Updated"
                icon="edit"
                tone="accent"
                value={counts.UPDATE}
              />
              <StatTile
                label="Deleted"
                icon="trash"
                tone={counts.DELETE ? "danger" : "neutral"}
                value={counts.DELETE}
              />
            </StatTiles>
          )}
          <DataTable
            label="Audit log"
            tour="audit-table"
            columns={columns}
            rows={rows}
            rowId={(e) => e._id}
            loading={loading}
            onRowClick={setSelected}
            selectedId={selected?._id ?? null}
            stickyOffset={52}
            empty={
              filtering && all.length > 0
                ? {
                    icon: "search",
                    title: "Nothing matches these filters",
                    body: `${all.length} events in this time range, none matching your search or filters.`,
                    action: (
                      <Button onClick={clearFilters}>Clear Filters</Button>
                    ),
                  }
                : {
                    icon: "shield",
                    title: "No activity in this time range",
                    body: "Try a longer time range.",
                  }
            }
          />
        </>
      )}
    </Page>
  );
}
