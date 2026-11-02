import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  DataTable,
  Page,
  Pagination,
  PrimaryCell,
  StatusBadge,
  type Column,
} from "@next/ui";
import { usePagedList } from "@next/lib/usePagedList";
import { fmtDateTime } from "@next/lib/format";
import s from "./platformAdmin.module.css";

const columns: Column<any>[] = [
  {
    key: "action",
    header: "Action",
    priority: "primary",
    render: (a) => (
      <PrimaryCell
        title={a.description}
        subtitle={a.reason ? `Reason: ${a.reason}` : a.action}
      />
    ),
  },
  {
    key: "actor",
    header: "Administrator",
    priority: "secondary",
    stackLabel: "By",
    render: (a) => a.actor ?? "Unknown",
  },
  {
    key: "target",
    header: "Organisation",
    priority: "secondary",
    stackLabel: "Org",
    render: (a) =>
      a.targetTenantName ?? <span className="px-tertiary">All</span>,
  },
  {
    key: "at",
    header: "When",
    priority: "hidden",
    render: (a) => <span className="px-num">{fmtDateTime(a.at)}</span>,
  },
  {
    key: "request",
    header: "Request",
    priority: "hidden",
    render: (a) =>
      a.requestId ? <span className={s.mono}>{a.requestId}</span> : "—",
  },
  {
    key: "result",
    header: "Result",
    priority: "trailing",
    render: (a) => (
      <StatusBadge tone={a.result === "success" ? "success" : "danger"}>
        {a.result === "success" ? "Succeeded" : "Failed"}
      </StatusBadge>
    ),
  },
];

/** Sensitive platform actions, newest first. Read-only: nothing edits these. */
export default function PlatformAuditLog() {
  const list = usePagedList(
    (p, l) => API_ENDPOINTS.PLATFORM_ADMIN_AUDIT(p, l),
    { listKeys: ["entries"] },
  );
  return (
    <Page
      title="Audit Log"
      subtitle="Praesto Platform Console"
      description="Platform administration actions — syncs, billing actions and changes to PraestoAdmin permissions — with who did them and why. Entries can’t be edited or deleted."
    >
      <DataTable
        label="Platform audit log"
        columns={columns}
        rows={list.data}
        rowId={(a) => String(a.id)}
        loading={list.loading}
        empty={{
          icon: "shield",
          title: "No platform actions yet",
          body: "Actions taken in the Platform Console appear here.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
    </Page>
  );
}
