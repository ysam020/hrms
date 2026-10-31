import { useContext, useEffect, useState } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate } from "@next/motion";
import {
  StatTiles,
  StatTile,
  Button,
  DataTable,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Select,
  StatusBadge,
  type Column,
} from "@next/ui";
import { apiClient, unwrap } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fmtDate, fromNow } from "@next/lib/format";
import {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  canRaiseSupport,
  canViewOrgSupport,
  categoryLabel,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
} from "./config";
import s from "./support.module.css";

type Scope = "mine" | "org";

/** Query-string tail shared by the list and its filters. */
export function filterParams(f: Record<string, string>) {
  return Object.entries(f)
    .filter(([, v]) => v && v !== "all")
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");
}

export default function Support() {
  const { user } = useContext(UserContext);
  const navigate = useTransitionNavigate();
  const canRaise = canRaiseSupport(user);
  const canOrg = canViewOrgSupport(user);
  const [scope, setScope] = useState<Scope>("mine");
  const [filters, setFilters] = useState({
    status: "all",
    category: "all",
    priority: "all",
    sort: "updated_desc",
  });
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let live = true;
    setStats(null);
    apiClient
      .get(API_ENDPOINTS.SUPPORT_STATS(scope))
      .then((r) => live && setStats(unwrap(r)))
      .catch(() => live && setStats({}));
    return () => {
      live = false;
    };
  }, [scope]);

  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.SUPPORT_TICKETS(
        p,
        l,
        `&scope=${scope}${searchParam(q)}${filterParams(filters)}`,
      ),
    { deps: [scope, filters], listKeys: ["tickets"] },
  );
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

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
      key: "reporter",
      header: "Reporter",
      priority: "secondary",
      stackLabel: "By",
      render: (t) => (t.isMine ? "You" : t.reporterName),
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
      key: "created",
      header: "Created",
      priority: "hidden",
      render: (t) => <span className="px-num">{fmtDate(t.createdAt)}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      priority: "secondary",
      stackLabel: "Updated",
      render: (t) => fromNow(t.updatedAt),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      render: (t) => (
        <StatusBadge tone={statusTone(t.status)}>
          {statusLabel(t.status, true)}
        </StatusBadge>
      ),
    },
  ];

  const filtered =
    !!list.query ||
    Object.entries(filters).some(([k, v]) => k !== "sort" && v !== "all");

  return (
    <Page
      title="Support Tickets"
      subtitle="Report problems, billing issues and ideas to the Praesto team"
      actions={
        canRaise && (
          <Button
            data-tour="support-new"
            variant="primary"
            icon="plus"
            onClick={() => navigate("/support/new")}
          >
            New Ticket
          </Button>
        )
      }
      tabs={
        <>
          {canOrg && (
            <SegmentedControl
              role="radiogroup"
              label="Whose tickets"
              value={scope}
              onChange={(v) => setScope(v as Scope)}
              segments={[
                { value: "mine", label: "My Tickets" },
                { value: "org", label: "Organization" },
              ]}
            />
          )}
          <SearchField
            label="Search by number or subject"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={240}
            trailing
          />
        </>
      }
    >
      <div className={s.stack}>
        <StatTiles label="Ticket summary">
          <StatTile
            label="Total"
            icon="ticket"
            value={stats?.total ?? "—"}
            loading={!stats}
          />
          <StatTile
            label="Open"
            icon="inbox"
            tone="accent"
            value={stats?.open ?? "—"}
            loading={!stats}
          />
          <StatTile
            label="Waiting for You"
            icon="chat"
            tone={stats?.awaitingYou ? "warning" : "neutral"}
            value={stats?.awaitingYou ?? "—"}
            loading={!stats}
            note={
              stats?.awaitingYou
                ? "The Praesto team needs your reply"
                : "Nothing needs your reply"
            }
          />
          <StatTile
            label="Resolved"
            icon="checkCircle"
            tone="success"
            value={stats?.resolved ?? "—"}
            loading={!stats}
          />
        </StatTiles>
        <div className={s.filters} role="group" aria-label="Filters">
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={set("status")}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            {STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {statusLabel(st.value, true)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Category"
            value={filters.category}
            onChange={set("category")}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
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
          <Select aria-label="Sort" value={filters.sort} onChange={set("sort")}>
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Least recently updated</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
          </Select>
        </div>
        <DataTable
          label="Support tickets"
          tour="support-table"
          columns={columns}
          rows={list.data}
          rowId={(t) => String(t.id)}
          loading={list.loading}
          onRowClick={(t) => navigate(`/support/tickets/${t.id}`)}
          empty={
            filtered
              ? {
                  icon: "search",
                  title: "No tickets match",
                  body: "Try a different search or clear the filters.",
                }
              : {
                  icon: "lifebuoy",
                  title:
                    scope === "org"
                      ? "Your organization hasn’t raised any tickets"
                      : "You haven’t raised any tickets",
                  body: canRaise
                    ? "Report a bug, a billing problem or an idea and the Praesto team will reply here."
                    : "Ask an owner or admin if you need to contact Praesto.",
                  action: canRaise ? (
                    <Button
                      icon="plus"
                      onClick={() => navigate("/support/new")}
                    >
                      New Ticket
                    </Button>
                  ) : undefined,
                }
          }
          footer={<Pagination {...list.pageProps} />}
        />
      </div>
    </Page>
  );
}
