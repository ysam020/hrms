import { useCallback, useEffect, useState } from "react";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  Button,
  DataTable,
  Field,
  Inspector,
  KeyValues,
  Metric,
  Metrics,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  Section,
  SegmentedControl,
  Select,
  StatusBadge,
  TextInput,
  type Column,
} from "@next/ui";
import { apiClient, unwrap } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fmtDateTime, fromNow } from "@next/lib/format";
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  categoryLabel,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "../config";
import { filterParams } from "../Support";
import { TicketControls, useAgents } from "./TicketControls";
import s from "../support.module.css";

const hours = (h: number | null | undefined) =>
  h == null
    ? "—"
    : h < 1
      ? `${Math.round(h * 60)} min`
      : h < 48
        ? `${h} h`
        : `${(h / 24).toFixed(1)} d`;

export default function PlatformSupport() {
  const navigate = useTransitionNavigate();
  const agents = useAgents();
  const [stats, setStats] = useState<any | null>(null);
  const [assignee, setAssignee] = useState("all");
  const [filters, setFilters] = useState({
    status: "active",
    category: "all",
    priority: "all",
    from: "",
    to: "",
    sort: "updated_desc",
  });
  const [selected, setSelected] = useState<any | null>(null);

  const loadStats = useCallback(() => {
    apiClient
      .get(API_ENDPOINTS.PLATFORM_SUPPORT_STATS)
      .then((r) => setStats(unwrap(r)))
      .catch(() => setStats({ counts: {}, metrics: {}, recent: [] }));
  }, []);
  useEffect(loadStats, [loadStats]);

  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.PLATFORM_SUPPORT_TICKETS(
        p,
        l,
        `${searchParam(q)}${filterParams({ ...filters, assignee })}`,
      ),
    { deps: [filters, assignee], listKeys: ["tickets"] },
  );
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  const c = stats?.counts ?? {};
  const m = stats?.metrics ?? {};

  const columns: Column<any>[] = [
    {
      key: "subject",
      header: "Ticket",
      priority: "primary",
      render: (t) => (
        <PrimaryCell
          title={t.subject}
          subtitle={`${t.ticketNo} · ${categoryLabel(t.category)}`}
        />
      ),
    },
    {
      key: "tenant",
      header: "Organization",
      priority: "secondary",
      stackLabel: "Org",
      render: (t) => t.tenantName,
    },
    {
      key: "priority",
      header: "Priority",
      priority: "secondary",
      render: (t) => (
        <StatusBadge tone={priorityTone(t.priority)} plain>
          {priorityLabel(t.priority)}
        </StatusBadge>
      ),
    },
    {
      key: "reporter",
      header: "Reporter",
      priority: "hidden",
      render: (t) => t.reporterName,
    },
    {
      key: "assignee",
      header: "Assignee",
      priority: "secondary",
      stackLabel: "Assignee",
      render: (t) =>
        t.assigneeName ?? <span className="px-tertiary">Unassigned</span>,
    },
    {
      key: "created",
      header: "Created",
      priority: "hidden",
      render: (t) => <span className="px-num">{fmtDate(t.createdAt)}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      priority: "hidden",
      render: (t) => fromNow(t.updatedAt),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (t) => (
        <StatusBadge tone={statusTone(t.status)}>
          {statusLabel(t.status)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <Page
      title="Support Console"
      subtitle="Tickets from every organization · Praesto team only"
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            segments={[
              { value: "all", label: "All" },
              { value: "me", label: "Assigned to Me", count: c.mine },
              { value: "unassigned", label: "Unassigned", count: c.unassigned },
            ]}
          />
          <SearchField
            label="Ticket no., subject or organization"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={280}
            trailing
          />
        </>
      }
      inspector={
        <Inspector
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.ticketNo ?? "Ticket"}
          id={selected?.id}
          footer={
            selected && (
              <Button
                variant="primary"
                block
                icon="chat"
                onClick={() =>
                  navigate(`/platform/support/tickets/${selected.id}`)
                }
              >
                Open Conversation
              </Button>
            )
          }
        >
          {selected && (
            <div style={{ display: "grid", gap: 20 }}>
              <p className={`px-headline ${s.subject}`}>{selected.subject}</p>
              <KeyValues
                items={[
                  ["Organization", selected.tenantName],
                  ["Reporter", selected.reporterName],
                  ["Category", categoryLabel(selected.category)],
                  ["Created", fmtDateTime(selected.createdAt)],
                  ["Updated", fmtDateTime(selected.updatedAt)],
                ]}
              />
              <TicketControls
                ticket={selected}
                agents={agents}
                onChanged={(updated) => {
                  list.refresh();
                  loadStats();
                  setSelected(
                    updated
                      ? {
                          ...selected,
                          ...updated,
                          assigneeName:
                            agents.find((a) => a.id === updated.assigneeId)
                              ?.name ?? null,
                        }
                      : null,
                  );
                }}
              />
            </div>
          )}
        </Inspector>
      }
    >
      <div className={s.stack}>
        <Metrics label="Queue">
          <Metric label="Open" value={c.open ?? "—"} loading={!stats} />
          <Metric
            label="In Progress"
            value={c.inProgress ?? "—"}
            loading={!stats}
          />
          <Metric
            label="Waiting for Tenant"
            value={c.waiting ?? "—"}
            loading={!stats}
          />
          <Metric label="Resolved" value={c.resolved ?? "—"} loading={!stats} />
          <Metric
            label="Urgent"
            value={c.urgent ?? "—"}
            loading={!stats}
            note="Active tickets"
          />
          <Metric
            label="Assigned to Me"
            value={c.mine ?? "—"}
            loading={!stats}
            note="Active tickets"
          />
          <Metric label="Total" value={c.total ?? "—"} loading={!stats} />
        </Metrics>
        <Metrics label="Response metrics">
          <Metric
            size="sm"
            label="Avg. First Response"
            value={hours(m.avgFirstResponseHours)}
            loading={!stats}
            note={`Last ${m.windowDays ?? 30} days · ${m.firstResponseSample ?? 0} tickets`}
          />
          <Metric
            size="sm"
            label="Avg. Time to Resolve"
            value={hours(m.avgResolutionHours)}
            loading={!stats}
            note={`Resolved in last ${m.windowDays ?? 30} days · ${m.resolutionSample ?? 0} tickets`}
          />
        </Metrics>

        {stats?.recent?.length > 0 && (
          <Section title="Recently Updated">
            <ul className="px-hairline-list">
              {stats.recent.slice(0, 5).map((t: any) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="px-link-button"
                    onClick={() =>
                      navigate(`/platform/support/tickets/${t.id}`)
                    }
                    style={{ textAlign: "left" }}
                  >
                    <span className={s.ref}>{t.ticketNo}</span>{" "}
                    <span className={s.subject}>{t.subject}</span>
                  </button>
                  <span className="px-meta">
                    {" "}
                    · {t.tenantName} · {statusLabel(t.status)} ·{" "}
                    {fromNow(t.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className={s.filters} role="group" aria-label="Filters">
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={set("status")}
          >
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            value={filters.category}
            onChange={set("category")}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Priority"
            value={filters.priority}
            onChange={set("priority")}
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Field label="Created from">
            <TextInput
              type="date"
              value={filters.from}
              onChange={set("from")}
            />
          </Field>
          <Field label="Created to">
            <TextInput type="date" value={filters.to} onChange={set("to")} />
          </Field>
          <Select aria-label="Sort" value={filters.sort} onChange={set("sort")}>
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Least recently updated</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
          </Select>
        </div>

        <DataTable
          label="Support tickets"
          tour="console-table"
          columns={columns}
          rows={list.data}
          rowId={(t) => String(t.id)}
          loading={list.loading}
          selectedId={selected?.id ?? null}
          onRowClick={(t) => setSelected(t)}
          empty={{
            icon: "lifebuoy",
            title: "No tickets match",
            body: "Try another filter, or clear the search.",
          }}
          footer={<Pagination {...list.pageProps} />}
        />
      </div>
    </Page>
  );
}
