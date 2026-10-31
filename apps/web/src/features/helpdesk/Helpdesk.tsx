import { useContext, useEffect, useState, type FormEvent } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { useTransitionNavigate, useSharedElement, vtName } from "@next/motion";
import {
  Button,
  DataTable,
  Dialog,
  Field,
  FormGrid,
  Page,
  Pagination,
  PrimaryCell,
  SearchField,
  SegmentedControl,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  fieldSpan2,
  type Column,
} from "@next/ui";
import { DraftNote, sendOrQueue, useOfflineDraft } from "@next/offline";
import { apiClient, errorMessage } from "@next/lib/api";
import { searchParam, usePagedList } from "@next/lib/usePagedList";
import { fromNow, personName } from "@next/lib/format";
import {
  CATEGORIES,
  PRIORITIES,
  label,
  priorityTone,
  statusTone,
} from "./shared";

function TicketTitle({ t }: { t: any }) {
  const style = useSharedElement(vtName("ticket", t.id), `/helpdesk/${t.id}`);
  return (
    <PrimaryCell
      style={style}
      title={t.title}
      subtitle={`#${t.ticketNo ?? t.id} · ${t.raisedByUser ? personName(t.raisedByUser) : "You"} · ${fromNow(t.createdAt)}`}
    />
  );
}

export default function Helpdesk() {
  const navigate = useTransitionNavigate();
  const [status, setStatus] = useState("All");
  const [creating, setCreating] = useState(false);
  const list = usePagedList(
    (p, l, q) =>
      API_ENDPOINTS.TICKETS(
        p,
        l,
        `${searchParam(q)}${status !== "All" ? `&status=${status}` : ""}`,
      ),
    {
      deps: [status],
      listKeys: ["tickets"],
    },
  );
  const columns: Column<any>[] = [
    {
      key: "title",
      header: "Ticket",
      priority: "primary",
      render: (t) => <TicketTitle t={t} />,
    },
    {
      key: "category",
      header: "Category",
      priority: "hidden",
      render: (t) => t.category || "—",
    },
    {
      key: "priority",
      header: "Priority",
      priority: "secondary",
      render: (t) => (
        <StatusBadge tone={priorityTone(t.priority)} plain>
          {label(t.priority)}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      priority: "trailing",
      width: 200,
      // Status first so the column reads down cleanly; an SLA breach is a
      // second line under it rather than a badge competing beside it.
      render: (t) => (
        <span style={{ display: "grid", gap: 4, justifyItems: "start" }}>
          <StatusBadge tone={statusTone(t.status)}>
            {label(t.status)}
          </StatusBadge>
          {t.slaBreached && (
            <StatusBadge tone="danger" plain>
              SLA breached
            </StatusBadge>
          )}
        </span>
      ),
    },
  ];
  return (
    <Page
      title="Helpdesk"
      description="Questions and requests for IT, HR, payroll and leave. Tickets past their target response time are marked SLA breached."
      actions={
        <Button
          data-tour="helpdesk-new"
          variant="primary"
          icon="plus"
          onClick={() => setCreating(true)}
        >
          New Ticket
        </Button>
      }
      tabs={
        <>
          <SegmentedControl
            role="radiogroup"
            label="Status"
            value={status}
            onChange={setStatus}
            segments={["All", "open", "in_progress", "resolved", "closed"].map(
              (v) => ({ value: v, label: v === "All" ? "All" : label(v) }),
            )}
          />
          <SearchField
            label="Search tickets"
            value={list.query}
            onChange={(e) => list.search(e.target.value)}
            toolbarWidth={220}
            trailing
          />
        </>
      }
    >
      <DataTable
        label="Tickets"
        tour="helpdesk-table"
        columns={columns}
        rows={list.data}
        rowId={(t) => String(t.id)}
        loading={list.loading}
        onRowClick={(t) => navigate(`/helpdesk/${t.id}`)}
        stickyOffset={52}
        empty={{
          icon: "lifebuoy",
          title: "No tickets here",
          body: "Raise a ticket when you need help from HR, IT, or payroll.",
        }}
        footer={<Pagination {...list.pageProps} />}
      />
      <NewTicket
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          list.refresh();
        }}
      />
    </Page>
  );
}

const TICKET_EMPTY = {
  title: "",
  description: "",
  category: "IT",
  priority: "medium",
};

function NewTicket({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { setAlert } = useContext(AlertContext);
  const [v, setV] = useState(TICKET_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setV(TICKET_EMPTY);
      setErrors({});
    }
  }, [open]);
  const draft = useOfflineDraft({
    formKey: "helpdesk.ticket",
    values: v,
    setValues: setV,
    initial: TICKET_EMPTY,
    enabled: open,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Record<string, string> = {};
    if (!v.title.trim()) n.title = "Give the ticket a short title.";
    if (!v.description.trim()) n.description = "Describe what you need.";
    setErrors(n);
    if (Object.keys(n).length) return;
    setSaving(true);
    try {
      const result = await sendOrQueue({
        kind: "helpdesk.ticket",
        label: `Ticket · ${v.title.trim()}`,
        method: "POST",
        url: API_ENDPOINTS.CREATE_TICKET,
        body: v,
      });
      await draft.clear();
      setAlert({
        open: true,
        message: result.queued
          ? "Saved on this device. Your ticket will be sent when you’re back online."
          : "Ticket created.",
        severity: result.queued ? "info" : "success",
      });
      onCreated();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={saving}
      title="New Ticket"
      description="Ask IT, HR, payroll or leave for help. You’ll see replies and status changes on the ticket."
      icon={{ name: "lifebuoy", tone: "accent" }}
      footer={
        <>
          <DraftNote
            status={draft.status}
            savedAt={draft.savedAt}
            onDiscard={async () => {
              await draft.clear();
              setV(TICKET_EMPTY);
            }}
          />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form="ticket-form"
            busy={saving}
          >
            Create Ticket
          </Button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Field
            label="Title"
            error={errors.title}
            hint="A short summary, e.g. “VPN disconnects every hour”"
            className={fieldSpan2}
          >
            <TextInput data-autofocus value={v.title} onChange={set("title")} />
          </Field>
          <Field label="Category">
            <Select value={v.category} onChange={set("category")}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={v.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Description"
            error={errors.description}
            className={fieldSpan2}
          >
            <TextArea
              rows={5}
              value={v.description}
              onChange={set("description")}
            />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
