import { useMemo, useState } from "react";
import { entityOptions } from "@web/assets/data/entityOptions";
import { timePresets } from "@web/assets/data/timePresets";
import { getDeviceInfo } from "@web/shared/utils/getDeviceInfo";
import {
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
  type Column,
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

const show = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
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
        {rows.map((r) => (
          <tr key={r.k} data-changed={r.changed || undefined}>
            <th scope="row">{fieldLabel(r.k)}</th>
            {b && <td className={s.from}>{show(r.from)}</td>}
            {a && <td className={s.to}>{show(r.to)}</td>}
          </tr>
        ))}
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
  const people = useGet<any>("/get-all-users?limit=200");
  const usernames = useMemo(
    () =>
      asList(people.data, "users")
        .map((u: any) => u.username)
        .filter(Boolean)
        .sort(),
    [people.data],
  );

  const q = query.trim().toLowerCase();
  const rows = asList(data).filter(
    (e: Entry) =>
      !q ||
      e.description?.toLowerCase().includes(q) ||
      e.username?.toLowerCase().includes(q) ||
      e.ipAddress?.includes(q),
  );

  const columns: Column<Entry>[] = [
    {
      key: "what",
      header: "Activity",
      priority: "primary",
      render: (e) => (
        <PrimaryCell title={e.description} subtitle={e.username || "System"} />
      ),
    },
    {
      key: "area",
      header: "Area",
      priority: "secondary",
      render: (e) =>
        e.entityType ? <Tag>{ENTITY[e.entityType] ?? e.entityType}</Tag> : "—",
    },
    {
      key: "when",
      header: "When",
      priority: "trailing",
      render: (e) => (
        <time dateTime={e.timestamp} title={fmtDateTime(e.timestamp)}>
          {fromNow(e.timestamp)}
        </time>
      ),
    },
    {
      key: "ip",
      header: "IP Address",
      priority: "hidden",
      render: (e) => <span className="px-num">{e.ipAddress || "—"}</span>,
    },
  ];

  return (
    <Page
      title="Audit Log"
      width="wide"
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
          <Select
            aria-label="Person"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="">Everyone</option>
            {usernames.map((u: string) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
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
        >
          {selected && (
            <div style={{ display: "grid", gap: 20 }}>
              <p className="px-section">{selected.description}</p>
              <KeyValues
                items={[
                  ["By", selected.username || "System"],
                  ["When", fmtDateTime(selected.timestamp)],
                  [
                    "Area",
                    selected.entityType
                      ? (ENTITY[selected.entityType] ?? selected.entityType)
                      : null,
                  ],
                  ["Action", selected.action],
                  [
                    "IP Address",
                    selected.ipAddress && (
                      <span className="px-num">{selected.ipAddress}</span>
                    ),
                  ],
                  [
                    "Device",
                    selected.userAgent ? getDeviceInfo(selected) : null,
                  ],
                ]}
              />
              {(selected.oldValue != null || selected.newValue != null) && (
                <Section title="Changes" headingLevel={3}>
                  <Changes
                    before={selected.oldValue}
                    after={selected.newValue}
                  />
                </Section>
              )}
            </div>
          )}
        </Inspector>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <DataTable
          label="Audit log"
          columns={columns}
          rows={rows}
          rowId={(e) => e._id}
          loading={loading}
          onRowClick={setSelected}
          selectedId={selected?._id ?? null}
          stickyOffset={52}
          empty={{
            icon: "shield",
            title: "No activity",
            body: "Nothing matches these filters. Try a longer time range.",
          }}
        />
      )}
    </Page>
  );
}
